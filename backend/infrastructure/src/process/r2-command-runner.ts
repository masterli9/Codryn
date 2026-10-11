import { spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';
import { commandSpecSchema, type CommandSpec } from '@codryn/shared';
import type { CommandResult, CommandRunner, CommandOutput, CommandOwnership } from '@codryn/core';
import { R2CommandProtocol } from './r2-command-protocol.js';
import { buildCommandEnvironment } from './command-environment.js';

const maxArguments = 128;
const maxArgumentBytes = 4096;
const maxArgumentsBytes = 32 * 1024;
const defaultTimeoutMs = 30_000;
const defaultOutputBytes = 256 * 1024;

function externalAssetPath(path: string): string {
  return path.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`);
}

export interface R2CommandRunnerOptions {
  readonly onOwned?: (ownership: CommandOwnership) => Promise<void>;
  readonly workerPath?: string;
  readonly jobPath?: string;
  readonly shellPath?: string;
  readonly environment?: Record<string, string | undefined>;
}

function result(status: CommandResult['status'], startedAt: number, treeStopped = false): CommandResult {
  return { status, exitCode: null, stdout: '', stderr: '', truncated: false, durationMs: Math.max(0, Date.now() - startedAt), treeStopped };
}

function isWithin(root: string, candidate: string): boolean {
  const value = relative(root, candidate);
  return value === '' || (!isAbsolute(value) && value !== '..' && !value.startsWith(`..${sep}`));
}

function validateCommand(input: CommandSpec): CommandSpec {
  const command = commandSpecSchema.parse(input);
  if (command.args.length > maxArguments) throw new Error('R2_COMMAND_ARGUMENT_LIMIT');
  let totalBytes = 0;
  for (const argument of command.args) {
    const bytes = Buffer.byteLength(argument, 'utf8');
    if (bytes > maxArgumentBytes) throw new Error('R2_COMMAND_ARGUMENT_LIMIT');
    totalBytes += bytes;
  }
  totalBytes += Buffer.byteLength(command.executable, 'utf8');
  if (totalBytes > maxArgumentsBytes) throw new Error('R2_COMMAND_ARGUMENT_LIMIT');
  return command;
}

function abortResult(startedAt: number): CommandResult {
  return result('cancelled', startedAt, false);
}

export class R2CommandRunner implements CommandRunner {
  private readonly onOwned: ((ownership: CommandOwnership) => Promise<void>) | undefined;
  private readonly rootReady: Promise<string>;
  private readonly workerPath: string;
  private readonly jobPath: string;
  private readonly shellPath: string;
  private readonly environment: Record<string, string | undefined>;

  constructor(rootDirectory: string, options: R2CommandRunnerOptions = {}) {
    if (!isAbsolute(rootDirectory)) throw new Error('R2_ROOT_NOT_ABSOLUTE');
    this.onOwned = options.onOwned;
    this.rootReady = realpath(rootDirectory);
    this.workerPath = options.workerPath ?? externalAssetPath(fileURLToPath(new URL('./r2-command-worker.ps1', import.meta.url)));
    this.jobPath = options.jobPath ?? externalAssetPath(fileURLToPath(new URL('./r2-command-job.cs', import.meta.url)));
    this.shellPath = options.shellPath ?? 'powershell.exe';
    this.environment = options.environment ?? process.env;
  }

  async run(input: CommandSpec, signal: AbortSignal, onOutput?: (output: CommandOutput) => void): Promise<CommandResult> {
    const startedAt = Date.now();
    let command: CommandSpec;
    try { command = validateCommand(input); }
    catch { return result('failed', startedAt, false); }
    if (process.platform !== 'win32') return result('termination_failed', startedAt, false);
    if (signal.aborted) return abortResult(startedAt);
    const root = await this.rootReady;
    let cwd: string;
    try {
      if (!isAbsolute(command.cwd)) return result('failed', startedAt, false);
      cwd = await realpath(command.cwd);
    } catch {
      return result('failed', startedAt, false);
    }
    if (!isWithin(root, cwd) || cwd !== root) return result('failed', startedAt, false);
    const environment = buildCommandEnvironment({
      ...this.environment,
      SystemRoot: this.environment.SystemRoot ?? process.env.SystemRoot
    });
    const commandJson = Buffer.from(JSON.stringify({
      hostPid: process.pid,
      executable: command.executable,
      args: command.args,
      cwd,
      timeoutMs: Math.min(command.timeoutMs, 120_000) || defaultTimeoutMs,
      maxOutputBytes: Math.min(command.maxOutputBytes, defaultOutputBytes) || defaultOutputBytes
    }), 'utf8').toString('base64');
    let child: ChildProcessByStdio<Writable, Readable, Readable>;
    try {
      child = spawn(this.shellPath, [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', this.workerPath, '-JobPath', this.jobPath, '-CommandJson', commandJson
      ], {
        cwd: root,
        env: environment,
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch {
      return result('failed', startedAt, false);
    }

    return new Promise<CommandResult>((resolveResult) => {
      let settled = false;
      let workerResult: CommandResult | undefined;
      let protocolFailed = false;
      let ownershipPending: Promise<void> = Promise.resolve();
      const protocol = new R2CommandProtocol();
      const watchdog = setTimeout(() => { protocolFailed = true; child.kill(); }, command.timeoutMs + 15_000);
      watchdog.unref();
      const send = (message: 'start' | 'cancel'): void => {
        if (!child.stdin.destroyed) child.stdin.write(message + '\n');
      };
      const onAbort = (): void => send('cancel');
      const settle = async (): Promise<void> => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        signal.removeEventListener('abort', onAbort);
        try { protocol.finish(); await ownershipPending; } catch { protocolFailed = true; }
        resolveResult(protocolFailed ? result('termination_failed', startedAt, false) : workerResult ?? result('termination_failed', startedAt, false));
      };
      const onStdout = (chunk: Buffer): void => {
        try {
          for (const frame of protocol.push(chunk)) {
            if (frame.type === 'owned') {
              const { jobName, worker, target } = frame;
              if (worker.pid !== child.pid) throw new Error('R3_COMMAND_OWNER_MISMATCH');
              // The suspended target cannot execute before the durable ownership hook succeeds.
              ownershipPending = Promise.resolve(this.onOwned?.({ jobName, worker, target })).then(() => send(signal.aborted ? 'cancel' : 'start')).catch(() => { protocolFailed = true; send('cancel'); });
            } else if (frame.type === 'output') {
              onOutput?.({ stream: frame.stream, sequence: frame.sequence, bytes: Buffer.from(frame.data, 'base64') });
            } else if (frame.type === 'result') {
              workerResult = { status: frame.status, exitCode: frame.exitCode, stdout: Buffer.from(frame.stdout, 'base64').toString('utf8'), stderr: Buffer.from(frame.stderr, 'base64').toString('utf8'), truncated: frame.truncated, durationMs: frame.durationMs, treeStopped: frame.treeStopped };
            } else protocolFailed = true;
          }
        } catch { protocolFailed = true; send('cancel'); }
      };
      child.stdout.on('data', onStdout);
      child.stderr.resume();
      child.stdin.on('error', () => { /* EOF is handled by worker; never expose raw pipe errors. */ });
      child.on('close', () => { void settle(); });
      child.on('error', () => { protocolFailed = true; void settle(); });
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
  }
}
