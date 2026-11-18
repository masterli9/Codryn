import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import type { ProjectBaseline, ProjectGitState as ProjectGitStatePort } from '@codryn/core';
import { gitExecutable, GitFailure, requirePassiveGitFilters, runLocalGit } from './local-git-command.js';
import { readBoundedContextFile } from '../filesystem/read-bounded-context-file.js';

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
  return error instanceof GitFailure ? error.reason === 'non-git' : error.code === 128 && /not a git repository/i.test(error.stderr ?? '');
}

function isMissingExecutable(error: GitCommandError): boolean {
  return error instanceof GitFailure ? error.reason === 'unavailable' : error.code === 'ENOENT';
}

function digest(bytes: Uint8Array | string): string {
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
  private readonly executable: Promise<string>;

  constructor(rootDirectory: string, options: ProjectGitStateOptions = {}) {
    if (!isAbsolute(rootDirectory)) throw new Error('R2_GIT_ROOT_NOT_ABSOLUTE');
    this.rootReady = realpath(rootDirectory);
    this.executable = gitExecutable(options.gitExecutable);
    void this.executable.catch(() => undefined);
  }

  async inspect(signal: AbortSignal): Promise<ProjectBaseline> {
    if (signal.aborted) throw abortError();
    const root = await this.rootReady;
    try {
      return await this.inspectOnce(root, signal);
    } catch (error) {
      if (error instanceof Error && error.message === 'R4_GIT_UNSAFE') {
        return { mode: 'non-git', reason: 'git_unavailable' };
      }
      if (error instanceof Error && error.message === 'R2_GIT_SNAPSHOT_UNSTABLE') {
        return this.inspectOnce(root, signal);
      }
      throw error;
    }
  }
  async hasConflict(path: string, signal: AbortSignal): Promise<boolean> {
    const root=await this.rootReady;
    const result=await this.tryCommand(root,['ls-files','--unmerged','-z','--',path],signal);
    if(result.ok)return result.result.stdout.length>0;
    if(isMissingExecutable(result.error)||isNotRepository(result.error))return false;
    throw commandError('R2_GIT_QUERY_FAILED',result.error);
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
    const prefix = relative(gitRoot, root).replaceAll('\\', '/');
    if (isAbsolute(prefix) || prefix === '..' || prefix.startsWith('../')) throw new Error('R2_GIT_ROOT_MISMATCH');

    const firstIndexHash = await this.indexHash(root, signal);
    const head = await this.optionalRevision(root, ['rev-parse', '--verify', 'HEAD'], signal, true);
    const branch = await this.optionalRevision(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], signal, false);
    await requirePassiveGitFilters(await this.executable, root, signal);
    const statusResult = await this.requiredCommand(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=all'], signal);
    const secondIndexHash = await this.indexHash(root, signal);
    const secondHead = await this.optionalRevision(root, ['rev-parse', '--verify', 'HEAD'], signal, true);
    const secondBranch = await this.optionalRevision(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], signal, false);
    if (firstIndexHash !== secondIndexHash || head !== secondHead || branch !== secondBranch) {
      throw new Error('R2_GIT_SNAPSHOT_UNSTABLE');
    }
    const parsed = parseStatus(statusResult.stdout);
    return {
      mode: 'git',
      head,
      branch,
      indexHash: firstIndexHash,
      status: parsed.status.filter(item => !prefix || item.path.startsWith(`${prefix}/`)).map(item => ({ ...item, path: prefix ? item.path.slice(prefix.length + 1) : item.path })),
      conflicts: parsed.conflicts.filter(item => !prefix || item.startsWith(`${prefix}/`)).map(item => prefix ? item.slice(prefix.length + 1) : item),
      worktreeIdentity: gitRoot
    };
  }

  private async indexHash(root: string, signal: AbortSignal): Promise<string> {
    const index = await this.requiredCommand(root, ['rev-parse', '--git-path', 'index'], signal);
    const indexPath = resolve(root, index.stdout.trim());
    const info = await lstat(indexPath).catch((error: unknown) => {
      if (error instanceof Error && Reflect.get(error,'code') === 'ENOENT') return null;
      throw new Error('R2_GIT_INDEX_UNAVAILABLE');
    });
    if (!info) return digest('absent');
    if (info.isSymbolicLink() || await realpath(indexPath) !== indexPath) throw new Error('R2_GIT_INDEX_UNAVAILABLE');
    const bytes = await readBoundedContextFile(indexPath, 32 * 1024 * 1024, info);
    if (!bytes) throw new Error('R2_GIT_INDEX_UNAVAILABLE');
    return digest(bytes);
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
    const code = result.error instanceof GitFailure ? result.error.exitCode : result.error.code;
    if (code === 1 || (allowUnborn && code === 128)) return null;
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
      const stdout = await runLocalGit(await this.executable, cwd, args, signal);
      return { ok: true, result: { stdout, stderr: '' } };
    } catch (error) {
      if (signal.aborted) throw abortError();
      return { ok: false, error: error as GitCommandError };
    }
  }
}
