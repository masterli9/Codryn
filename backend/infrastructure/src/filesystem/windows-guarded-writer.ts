import { createHash } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lstat, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { GuardedFile, GuardedWriter } from '@codryn/core';
import { decideSensitivePath } from './sensitive-path-policy.js';

const maxFileBytes = 1024 * 1024;
const hashPattern = /^[0-9a-f]{64}$/;

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function fail(code: string): Error {
  return new Error(code);
}

function normalizeRelativePath(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || isAbsolute(value) || /^(?:[A-Za-z]:|[\\/])/.test(value)) {
    throw fail('R2_PATH_INVALID');
  }
  const normalized = value.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..' || segment.includes(':'))) {
    throw fail('R2_PATH_INVALID');
  }
  const decision = decideSensitivePath(normalized);
  if (!decision.allowed) throw fail('R2_PATH_SENSITIVE');
  return normalized;
}

function isWithin(root: string, target: string): boolean {
  const value = relative(root, target);
  return value === '' || (!isAbsolute(value) && !value.startsWith(`..${sep}`) && value !== '..');
}

async function validateTarget(root: string, path: string): Promise<string> {
  const candidate = resolve(root, path);
  const segments = path.split('/');
  let current = root;
  for (const [index, segment] of segments.entries()) {
    current = resolve(current, segment);
    const details = await lstat(current).catch(() => { throw fail('R2_FILE_NOT_FOUND'); });
    if (details.isSymbolicLink()) throw fail('R2_PATH_REPARSE');
    if (index < segments.length - 1 && !details.isDirectory()) throw fail('R2_PATH_NOT_DIRECTORY');
  }
  const canonical = await realpath(candidate).catch(() => { throw fail('R2_FILE_NOT_FOUND'); });
  if (!isWithin(root, canonical)) throw fail('R2_PATH_OUTSIDE_ROOT');
  const details = await stat(canonical);
  if (!details.isFile()) throw fail('R2_FILE_NOT_REGULAR');
  if (details.size > maxFileBytes) throw fail('R2_PATCH_FILE_TOO_LARGE');
  if (details.nlink > 1) throw fail('R2_PATH_HARDLINK');
  return canonical;
}

interface WorkerReady { type: 'ready'; bytes: string }
interface WorkerResponse { type: 'published' | 'closed' | 'error'; code?: string }

class GuardWorker {
  private buffered = '';
  private waiting: { resolve: (response: WorkerReady | WorkerResponse) => void; reject: (error: Error) => void } | undefined;
  private exited = false;

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.setEncoding('utf8');
    child.stderr.resume();
    child.stdout.on('data', (chunk: string) => this.consume(chunk));
    child.on('error', (error) => this.reject(error));
    child.on('exit', () => {
      this.exited = true;
      this.reject(fail('R2_GUARD_WORKER_EXITED'));
    });
  }

  private consume(chunk: string): void {
    this.buffered += chunk;
    while (true) {
      const newline = this.buffered.indexOf('\n');
      if (newline < 0) return;
      const line = this.buffered.slice(0, newline).trim();
      this.buffered = this.buffered.slice(newline + 1);
      if (line.length === 0 || this.waiting === undefined) continue;
      try {
        const response = JSON.parse(line) as WorkerReady | WorkerResponse;
        const waiting = this.waiting;
        this.waiting = undefined;
        if (response.type === 'error') waiting.reject(fail(response.code ?? 'R2_GUARD_OPERATION_FAILED'));
        else waiting.resolve(response);
      } catch {
        this.reject(fail('R2_GUARD_PROTOCOL_INVALID'));
      }
    }
  }

  private reject(error: Error): void {
    const waiting = this.waiting;
    this.waiting = undefined;
    waiting?.reject(error);
  }

  async command(command: Record<string, string>): Promise<WorkerReady | WorkerResponse> {
    if (this.exited) throw fail('R2_GUARD_WORKER_EXITED');
    const response = new Promise<WorkerReady | WorkerResponse>((resolveResponse, rejectResponse) => {
      this.waiting = { resolve: resolveResponse, reject: rejectResponse };
    });
    await new Promise<void>((resolveWrite, rejectWrite) => {
      this.child.stdin.write(`${JSON.stringify(command)}\n`, 'utf8', (error) => error ? rejectWrite(error) : resolveWrite());
    });
    return response;
  }

  async terminate(): Promise<void> {
    if (!this.exited) this.child.kill();
  }
}

class WindowsGuardedFile implements GuardedFile {
  readonly bytes: Uint8Array;
  private closed = false;
  private published = false;

  constructor(private readonly worker: GuardWorker, bytes: Uint8Array) {
    this.bytes = new Uint8Array(bytes);
  }

  async publish(bytes: Uint8Array): Promise<void> {
    if (this.closed) throw fail('R2_GUARD_CLOSED');
    if (this.published) throw fail('R2_GUARD_ALREADY_PUBLISHED');
    if (bytes.byteLength > maxFileBytes) throw fail('R2_PATCH_FILE_TOO_LARGE');
    const response = await this.worker.command({ type: 'publish', bytes: Buffer.from(bytes).toString('base64') });
    if (response.type !== 'published') throw fail('R2_GUARD_PROTOCOL_INVALID');
    this.published = true;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      const response = await this.worker.command({ type: 'close' });
      if (response.type !== 'closed') throw fail('R2_GUARD_PROTOCOL_INVALID');
    } finally {
      await this.worker.terminate();
    }
  }
}

export interface WindowsGuardedWriterOptions {
  readonly workerPath?: string;
  readonly shellPath?: string;
}

export class WindowsGuardedWriter implements GuardedWriter {
  private readonly rootReady: Promise<string>;
  private readonly workerPath: string;
  private readonly shellPath: string;

  constructor(rootDirectory: string, options: WindowsGuardedWriterOptions = {}) {
    if (!isAbsolute(rootDirectory)) throw fail('R2_ROOT_NOT_ABSOLUTE');
    this.rootReady = realpath(rootDirectory);
    this.workerPath = options.workerPath ?? fileURLToPath(new URL('./windows-guarded-worker.ps1', import.meta.url));
    this.shellPath = options.shellPath ?? 'powershell.exe';
  }

  async open(pathInput: string, expectedHash: string, signal: AbortSignal): Promise<GuardedFile> {
    if (process.platform !== 'win32') throw fail('R2_GUARD_UNSUPPORTED');
    if (!hashPattern.test(expectedHash)) throw fail('R2_PATCH_HASH_INVALID');
    if (signal.aborted) throw fail('R2_CHANGE_ABORTED');
    const path = normalizeRelativePath(pathInput);
    const root = await this.rootReady;
    const target = await validateTarget(root, path);
    const child = spawn(this.shellPath, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', this.workerPath, '-Target', target
    ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const worker = new GuardWorker(child);
    try {
      const response = await worker.command({ type: 'ready' });
      if (response.type !== 'ready') throw fail('R2_GUARD_PROTOCOL_INVALID');
      const bytes = Buffer.from(response.bytes, 'base64');
      if (bytes.byteLength > maxFileBytes) throw fail('R2_PATCH_FILE_TOO_LARGE');
      if (digest(bytes) !== expectedHash) throw fail('R2_PATCH_STALE');
      return new WindowsGuardedFile(worker, bytes);
    } catch (error) {
      await worker.terminate();
      throw error;
    }
  }
}
