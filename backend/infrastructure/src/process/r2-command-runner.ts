import { spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';
import { commandSpecSchema, type CommandSpec } from '@codryn/shared';
import type { CommandResult, CommandRunner } from '@codryn/core';
import { buildCommandEnvironment } from './command-environment.js';

const maxArguments = 128;
const maxArgumentBytes = 4096;
const maxArgumentsBytes = 32 * 1024;
const defaultTimeoutMs = 30_000;
const defaultOutputBytes = 256 * 1024;

export interface R2CommandRunnerOptions {
  readonly workerPath?: string;
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
  private readonly rootReady: Promise<string>;
  private readonly workerPath: string;
  private readonly shellPath: string;
  private readonly environment: Record<string, string | undefined>;

  constructor(rootDirectory: string, options: R2CommandRunnerOptions = {}) {
    if (!isAbsolute(rootDirectory)) throw new Error('R2_ROOT_NOT_ABSOLUTE');
    this.rootReady = realpath(rootDirectory);
    this.workerPath = options.workerPath ?? fileURLToPath(new URL('./r2-command-worker.ps1', import.meta.url));
    this.shellPath = options.shellPath ?? 'powershell.exe';
    this.environment = options.environment ?? process.env;
  }

  async run(input: CommandSpec, signal: AbortSignal): Promise<CommandResult> {
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
      executable: command.executable,
      args: command.args,
      cwd,
      timeoutMs: Math.min(command.timeoutMs, 120_000) || defaultTimeoutMs,
      maxOutputBytes: Math.min(command.maxOutputBytes, defaultOutputBytes) || defaultOutputBytes
    }), 'utf8').toString('base64');
    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn(this.shellPath, [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', this.workerPath, '-CommandJson', commandJson
      ], {
        cwd: root,
        env: environment,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch {
      return result('failed', startedAt, false);
    }

    return new Promise<CommandResult>((resolveResult) => {
      let settled = false;
      let buffer = '';
      let aborted = false;
      let workerResult: CommandResult | undefined;
      const settle = (value: CommandResult): void => {
        if (settled) return;
        settled = true;
        child.stdout.off('data', onStdout);
        child.off('close', onClose);
        child.off('error', onError);
        resolveResult(value);
      };
      const onStdout = (chunk: Buffer | string): void => {
        buffer += chunk.toString();
        const newline = buffer.indexOf('\n');
        if (newline < 0) return;
        const line = buffer.slice(0, newline).trim();
        if (line.length === 0) return;
        try {
          const payload = JSON.parse(line) as {
            type?: string; status?: CommandResult['status']; exitCode?: number | null;
            stdout?: string; stderr?: string; truncated?: boolean; durationMs?: number; treeStopped?: boolean;
          };
          if (payload.type === 'result' && payload.status !== undefined) {
            workerResult = {
              status: payload.status,
              exitCode: payload.exitCode ?? null,
              stdout: Buffer.from(payload.stdout ?? '', 'base64').toString('utf8'),
              stderr: Buffer.from(payload.stderr ?? '', 'base64').toString('utf8'),
              truncated: payload.truncated === true,
              durationMs: typeof payload.durationMs === 'number' && Number.isSafeInteger(payload.durationMs)
                ? payload.durationMs
                : Math.max(0, Date.now() - startedAt),
              treeStopped: payload.treeStopped === true
            };
          }
        } catch {
          settle(result('termination_failed', startedAt, false));
        }
      };
      child.stderr.resume();
      const onClose = (): void => settle(aborted ? abortResult(startedAt) : workerResult ?? result('termination_failed', startedAt, false));
      const onError = (): void => settle(aborted ? abortResult(startedAt) : workerResult ?? result('termination_failed', startedAt, false));
      child.stdout.on('data', onStdout);
      child.on('close', onClose);
      child.on('error', onError);
      signal.addEventListener('abort', () => {
        if (settled) return;
        aborted = true;
        try { child.kill(); } catch { settle(abortResult(startedAt)); }
      }, { once: true });
    });
  }
}
