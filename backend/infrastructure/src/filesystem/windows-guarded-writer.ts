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

function externalAssetPath(path: string): string {
  return path.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`);
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
  private readonly closed: Promise<void>;

  constructor(private readonly child: ChildProcessWithoutNullStreams, private readonly signal: AbortSignal, private readonly commandTimeoutMs: number) {
    this.closed = new Promise((resolveClosed) => child.once('close', () => resolveClosed()));
    child.stdout.setEncoding('utf8');
    child.stderr.resume();
    child.stdin.on('error', (error) => this.reject(error));
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
    if (this.waiting !== undefined) throw fail('R2_GUARD_BUSY');
    if (this.signal.aborted) {
      await this.terminate();
      throw fail('R2_CHANGE_ABORTED');
    }
    let mustTerminate = false;
    let timer: NodeJS.Timeout | undefined;
    const interrupt = (code: string) => {
      mustTerminate = true;
      this.reject(fail(code));
    };
    const onAbort = () => interrupt('R2_CHANGE_ABORTED');
    const response = new Promise<WorkerReady | WorkerResponse>((resolveResponse, rejectResponse) => {
      this.waiting = { resolve: resolveResponse, reject: rejectResponse };
      timer = setTimeout(() => interrupt('R2_GUARD_TIMEOUT'), this.commandTimeoutMs);
      this.signal.addEventListener('abort', onAbort, { once: true });
      this.child.stdin.write(`${JSON.stringify(command)}\n`, 'utf8', (error) => {
        if (error !== null && error !== undefined) {
          mustTerminate = true;
          this.reject(error);
        }
      });
    });
    try { return await response; }
    finally {
      clearTimeout(timer);
      this.signal.removeEventListener('abort', onAbort);
      if (mustTerminate) await this.terminate();
    }
  }

  async terminate(): Promise<void> {
    if (!this.exited) this.child.kill();
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.closed,
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(fail('R2_GUARD_TERMINATION_FAILED')), 5_000); })
      ]);
    } finally { clearTimeout(timer); }
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
  readonly nativeGuardPath?: string;
  readonly shellPath?: string;
  readonly commandTimeoutMs?: number;
}

export class WindowsGuardedWriter implements GuardedWriter {
  private readonly rootReady: Promise<{ path: string; volumeSerial: bigint; fileIndex: bigint }>;
  private readonly workerPath: string;
  private readonly nativeGuardPath: string;
  private readonly shellPath: string;
  private readonly commandTimeoutMs: number;

  constructor(rootDirectory: string, options: WindowsGuardedWriterOptions = {}) {
    if (!isAbsolute(rootDirectory)) throw fail('R2_ROOT_NOT_ABSOLUTE');
    this.commandTimeoutMs = options.commandTimeoutMs ?? 30_000;
    if (!Number.isInteger(this.commandTimeoutMs) || this.commandTimeoutMs <= 0 || this.commandTimeoutMs > 60_000) throw fail('R2_GUARD_TIMEOUT_INVALID');
    this.rootReady = realpath(rootDirectory).then(async (path) => {
      const identity = await stat(path, { bigint: true });
      return { path, volumeSerial: identity.dev, fileIndex: identity.ino };
    });
    this.workerPath = options.workerPath ?? externalAssetPath(fileURLToPath(new URL('./windows-guarded-worker.ps1', import.meta.url)));
    this.nativeGuardPath = options.nativeGuardPath ?? externalAssetPath(fileURLToPath(new URL('./windows-guard-native.cs', import.meta.url)));
    this.shellPath = options.shellPath ?? 'powershell.exe';
  }

  async open(pathInput: string, expectedHash: string, signal: AbortSignal): Promise<GuardedFile> {
    if (process.platform !== 'win32') throw fail('R2_GUARD_UNSUPPORTED');
    if (!hashPattern.test(expectedHash)) throw fail('R2_PATCH_HASH_INVALID');
    if (signal.aborted) throw fail('R2_CHANGE_ABORTED');
    const path = normalizeRelativePath(pathInput);
    const root = await this.rootReady;
    const target = await validateTarget(root.path, path);
    if (signal.aborted) throw fail('R2_CHANGE_ABORTED');
    const child = spawn(this.shellPath, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', this.workerPath, '-NativeGuardPath', this.nativeGuardPath, '-Target', target,
      '-Root', root.path, '-RootVolumeSerialNumber', root.volumeSerial.toString(), '-RootFileIndex', root.fileIndex.toString()
    ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const worker = new GuardWorker(child, signal, this.commandTimeoutMs);
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
