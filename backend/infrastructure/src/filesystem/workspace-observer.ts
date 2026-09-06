import { createHash } from 'node:crypto';
import { watch, type FSWatcher } from 'node:fs';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import type { ProjectGitState, WorkspaceObservation, WorkspaceObserver } from '@codryn/core';
import { isR1SensitiveRelativePath } from '@codryn/core';
import type { ContextPathPolicy } from './context-path-policy.js';

const maxFiles = 5_000;
const maxBytes = 64 * 1024 * 1024;
const maxDurationMs = 5_000;
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'build', 'out', '.next', '.cache', 'coverage', 'user-data', 'blobs']);

function cancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('R2_WORKSPACE_CANCELLED');
}

export interface WorkspaceObserverOptions {
  readonly git?: Pick<ProjectGitState, 'inspect'>;
  readonly contextPolicy?: Pick<ContextPathPolicy, 'allowed' | 'refresh'>;
}

export class FileWorkspaceObserver implements WorkspaceObserver {
  private readonly rootReady: Promise<string>;
  private watcher: FSWatcher | undefined;
  private generation = 0;
  private watcherHealthy = true;

  constructor(rootDirectory: string, private readonly options: WorkspaceObserverOptions = {}) {
    if (!isAbsolute(rootDirectory)) throw new Error('R2_WORKSPACE_ROOT_NOT_ABSOLUTE');
    this.rootReady = realpath(rootDirectory);
  }

  async inspect(signal: AbortSignal): Promise<WorkspaceObservation> {
    cancelled(signal);
    await this.options.contextPolicy?.refresh?.();
    const root = await this.rootReady;
    this.ensureWatcher(root);
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const startGeneration = this.generation;
    const startedAt = Date.now();
    const entries: string[] = [];
    let totalBytes = 0;
    let complete = this.watcherHealthy;
    const visit = async (current: string): Promise<void> => {
      cancelled(signal);
      if (Date.now() - startedAt > maxDurationMs) { complete = false; return; }
      const info = await lstat(current);
      if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) return;
      const rel = relative(root, current).replaceAll('\\', '/') || '.';
      const segments = rel.split('/');
      if (segments.some((segment) => ignoredDirectories.has(segment.toLowerCase())) || isR1SensitiveRelativePath(rel) || this.options.contextPolicy?.allowed(rel) === false) return;
      if (info.isDirectory()) {
        const children = (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
        for (const child of children) {
          if (!complete && Date.now() - startedAt > maxDurationMs) return;
          await visit(resolve(current, child.name));
        }
        return;
      }
      if (entries.length >= maxFiles || totalBytes + info.size > maxBytes) { complete = false; return; }
      const bytes = await readFile(current);
      const after = await lstat(current).catch(() => null);
      if (after === null || after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.isSymbolicLink()) { complete = false; return; }
      entries.push(`${rel}\0${createHash('sha256').update(bytes).digest('hex')}\0${bytes.length}`);
      totalBytes += bytes.length;
    };
    try { await visit(root); } catch {
      if (signal.aborted) throw new Error('R2_WORKSPACE_CANCELLED');
      complete = false;
    }
    if (this.generation !== startGeneration || !this.watcherHealthy || Date.now() - startedAt > maxDurationMs) complete = false;
    entries.sort();
    const fingerprint = createHash('sha256').update(entries.join('\n'), 'utf8').digest('hex');
    let gitIdentity: string | null = null;
    if (this.options.git !== undefined) {
      try {
        const baseline = await this.options.git.inspect(signal);
        gitIdentity = baseline.mode === 'git' ? baseline.worktreeIdentity : null;
      } catch (error) {
        if (signal.aborted) throw error;
        complete = false;
      }
    }
    return { fingerprint, gitIdentity, complete };
  }

  close(): void {
    this.watcher?.close();
    this.watcher = undefined;
  }

  private ensureWatcher(root: string): void {
    if (this.watcher !== undefined) return;
    try {
      this.watcher = watch(root, { recursive: true }, (_event, filename) => {
        const relativeName = filename?.toString().replaceAll('\\', '/') ?? '';
        if (relativeName.length === 0 || !this.isIgnored(relativeName)) this.generation += 1;
      });
      this.watcher.on('error', () => { this.watcherHealthy = false; this.generation += 1; });
    } catch {
      this.watcherHealthy = false;
    }
  }

  private isIgnored(relativeName: string): boolean {
    const segments = relativeName.split('/');
    return segments.some((segment) => ignoredDirectories.has(segment.toLowerCase()))
      || isR1SensitiveRelativePath(relativeName)
      || this.options.contextPolicy?.allowed(relativeName) === false;
  }
}
