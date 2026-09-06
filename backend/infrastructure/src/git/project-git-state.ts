import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { ProjectBaseline, ProjectGitState as ProjectGitStatePort } from '@codryn/core';

const execFileAsync = promisify(execFile);
const maxOutputBytes = 1024 * 1024;
const queryTimeoutMs = 5_000;

interface ProjectGitStateOptions {
  readonly gitExecutable?: string;
}

interface GitCommandError extends Error {
  readonly code?: string | number;
  readonly stderr?: string;
  readonly stdout?: string;
}

interface GitCommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

function isNotRepository(error: GitCommandError): boolean {
  return error.code === 128 && /not a git repository/i.test(error.stderr ?? '');
}

function isMissingExecutable(error: GitCommandError): boolean {
  return error.code === 'ENOENT';
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function abortError(): Error {
  return new Error('R2_GIT_CANCELLED');
}

function commandError(code: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : '';
  return new Error(`${code}:${message}`);
}

function parseStatus(raw: string): {
  readonly status: readonly { path: string; xy: string }[];
  readonly conflicts: readonly string[];
} {
  const tokens = raw.split('\0');
  const status: { path: string; xy: string }[] = [];
  const conflicts: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined || token.length === 0) continue;
    if (token.length < 4 || token[2] !== ' ') throw new Error('R2_GIT_STATUS_INVALID');
    const xy = token.slice(0, 2);
    const path = token.slice(3);
    status.push({ path, xy });
    if (xy.includes('U') || xy === 'AA' || xy === 'DD') conflicts.push(path);
    if (xy.includes('R') || xy.includes('C')) index += 1;
  }
  return { status, conflicts };
}

export class ProjectGitState implements ProjectGitStatePort {
  private readonly rootReady: Promise<string>;
  private readonly gitExecutable: string;

  constructor(rootDirectory: string, options: ProjectGitStateOptions = {}) {
    if (!isAbsolute(rootDirectory)) throw new Error('R2_GIT_ROOT_NOT_ABSOLUTE');
    this.rootReady = realpath(rootDirectory);
    this.gitExecutable = options.gitExecutable ?? 'git';
  }

  async inspect(signal: AbortSignal): Promise<ProjectBaseline> {
    if (signal.aborted) throw abortError();
    const root = await this.rootReady;
    try {
      return await this.inspectOnce(root, signal);
    } catch (error) {
      if (error instanceof Error && error.message === 'R2_GIT_SNAPSHOT_UNSTABLE') {
        return this.inspectOnce(root, signal);
      }
      throw error;
    }
  }

  private async inspectOnce(root: string, signal: AbortSignal): Promise<ProjectBaseline> {
    const topLevel = await this.tryCommand(root, ['rev-parse', '--show-toplevel'], signal);
    if (!topLevel.ok) {
      if (isMissingExecutable(topLevel.error)) return { mode: 'non-git', reason: 'git_unavailable' };
      if (isNotRepository(topLevel.error)) return { mode: 'non-git', reason: 'not_repository' };
      throw commandError('R2_GIT_QUERY_FAILED', topLevel.error);
    }
    const gitRoot = await realpath(resolve(root, topLevel.result.stdout.trim())).catch(() => {
      throw new Error('R2_GIT_ROOT_INVALID');
    });
    if (gitRoot.toLowerCase() !== root.toLowerCase()) throw new Error('R2_GIT_ROOT_MISMATCH');

    const firstIndexHash = await this.indexHash(root, signal);
    const head = await this.optionalRevision(root, ['rev-parse', '--verify', 'HEAD'], signal, true);
    const branch = await this.optionalRevision(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], signal, false);
    const statusResult = await this.requiredCommand(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], signal);
    const secondIndexHash = await this.indexHash(root, signal);
    const secondHead = await this.optionalRevision(root, ['rev-parse', '--verify', 'HEAD'], signal, true);
    if (firstIndexHash !== secondIndexHash || head !== secondHead) {
      throw new Error('R2_GIT_SNAPSHOT_UNSTABLE');
    }
    const parsed = parseStatus(statusResult.stdout);
    return {
      mode: 'git',
      head,
      branch,
      indexHash: firstIndexHash,
      status: parsed.status,
      conflicts: parsed.conflicts,
      worktreeIdentity: gitRoot
    };
  }

  private async indexHash(root: string, signal: AbortSignal): Promise<string> {
    const index = await this.requiredCommand(root, ['rev-parse', '--git-path', 'index'], signal);
    const indexPath = await realpath(resolve(root, index.stdout.trim())).catch(() => {
      throw new Error('R2_GIT_INDEX_UNAVAILABLE');
    });
    return digest(await readFile(indexPath));
  }

  private async optionalRevision(
    root: string,
    args: readonly string[],
    signal: AbortSignal,
    allowUnborn: boolean
  ): Promise<string | null> {
    const result = await this.tryCommand(root, args, signal);
    if (result.ok) {
      const value = result.result.stdout.trim();
      if (value.length === 0) throw new Error('R2_GIT_REVISION_INVALID');
      return value;
    }
    if (result.error.code === 1 || (allowUnborn && result.error.code === 128)) return null;
    throw commandError('R2_GIT_QUERY_FAILED', result.error);
  }

  private async requiredCommand(root: string, args: readonly string[], signal: AbortSignal): Promise<GitCommandResult> {
    const result = await this.tryCommand(root, args, signal);
    if (!result.ok) throw commandError('R2_GIT_QUERY_FAILED', result.error);
    return result.result;
  }

  private async tryCommand(
    cwd: string,
    args: readonly string[],
    signal: AbortSignal
  ): Promise<{ readonly ok: true; readonly result: GitCommandResult } | { readonly ok: false; readonly error: GitCommandError }> {
    if (signal.aborted) throw abortError();
    try {
      const result = await execFileAsync(this.gitExecutable, [...args], {
        cwd,
        shell: false,
        windowsHide: true,
        timeout: queryTimeoutMs,
        maxBuffer: maxOutputBytes,
        signal,
        env: {
          ...process.env,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_OPTIONAL_LOCKS: '0',
          GIT_TERMINAL_PROMPT: '0'
        }
      });
      return { ok: true, result: { stdout: result.stdout, stderr: result.stderr } };
    } catch (error) {
      if (signal.aborted) throw abortError();
      return { ok: false, error: error as GitCommandError };
    }
  }
}
