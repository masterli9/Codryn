import { createHash, randomUUID } from 'node:crypto';
import { watch, type FSWatcher } from 'node:fs';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import type { ProjectGitState, WorkspaceObservation, WorkspaceObserver } from '@codryn/core';
import { ContextPathPolicy, ContextPathPolicyError } from './context-path-policy.js';
import { MAX_CONTEXT_FILE_BYTES, readBoundedContextFile } from './read-bounded-context-file.js';

const maxFiles = 5_000;
const maxBytes = 64 * 1024 * 1024;
const maxDurationMs = 5_000;
type ObserverPolicy = Pick<ContextPathPolicy, 'decide' | 'refresh'>;

function cancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('R2_WORKSPACE_CANCELLED');
}

export interface WorkspaceObserverOptions {
  readonly git?: Pick<ProjectGitState, 'inspect'>;
  readonly contextPolicy?: ObserverPolicy;
}

export class FileWorkspaceObserver implements WorkspaceObserver {
  private readonly rootReady: Promise<string>;
  private policyReady: Promise<ObserverPolicy> | undefined;
  private watcher: FSWatcher | undefined;
  private generation = 0;
  private readonly watcherId = randomUUID();
  private watcherHealthy = true;

  constructor(rootDirectory: string, private readonly options: WorkspaceObserverOptions = {}) {
    if (!isAbsolute(rootDirectory)) throw new Error('R2_WORKSPACE_ROOT_NOT_ABSOLUTE');
    this.rootReady = realpath(rootDirectory);
  }

  async inspect(signal: AbortSignal): Promise<WorkspaceObservation> {
    cancelled(signal);
    const root = await this.rootReady;
    this.policyReady ??= this.options.contextPolicy === undefined ? ContextPathPolicy.fromProjectRoot(root).catch((error: unknown) => {
      this.policyReady = undefined;
      throw error;
    }) : Promise.resolve(this.options.contextPolicy);
    const policy = await this.policyReady;
    const revision = await policy.refresh();
    this.ensureWatcher(root, policy);
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const startGeneration = this.generation;
    const startedAt = Date.now();
    const entries: string[] = [];
    const observedPaths: string[] = [];
    const inputHashes: Record<string, string> = Object.create(null) as Record<string, string>;
    let totalBytes = 0;
    let complete = this.watcherHealthy;
    let policyChanged = false;
    const visit = async (current: string): Promise<void> => {
      cancelled(signal);
      if (policyChanged || Date.now() - startedAt > maxDurationMs) { complete = false; return; }
      const info = await lstat(current);
      if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) return;
      const rel = relative(root, current).replaceAll('\\', '/') || '.';
      if (!policy.decide(rel, 'crawl', { kind: info.isDirectory() ? 'directory' : 'file' }).allowed) return;
      if (await realpath(current) !== current) { complete = false; return; }
      if (info.isDirectory()) {
        const children = (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
        for (const child of children) {
          if (!complete && Date.now() - startedAt > maxDurationMs) return;
          await visit(resolve(current, child.name));
        }
        return;
      }
      if (!policy.decide(rel, 'crawl', { kind: 'file', size: info.size }).allowed) return;
      if (entries.length >= maxFiles || totalBytes + info.size > maxBytes) { complete = false; return; }
      if (await policy.refresh() !== revision) { policyChanged = true; complete = false; return; }
      if (!policy.decide(rel, 'crawl', { kind: 'file' }).allowed) return;
      const bytes = await readBoundedContextFile(current, Math.min(MAX_CONTEXT_FILE_BYTES, maxBytes - totalBytes), info);
      const after = await lstat(current).catch(() => null);
      if (bytes === null || after === null || !after.isFile() || after.ino !== info.ino || after.dev !== info.dev
        || after.size !== info.size || after.mtimeMs !== info.mtimeMs || await realpath(current) !== current) { complete = false; return; }
      totalBytes += bytes.length;
      if (!policy.decide(rel, 'crawl', { kind: 'file', bytes }).allowed) return;
      const digest = createHash('sha256').update(bytes).digest('hex');
      entries.push(`${rel}\0${digest}\0${bytes.length}`);
      inputHashes[rel] = digest;
      observedPaths.push(rel);
    };
    try { await visit(root); } catch (error) {
      if (error instanceof ContextPathPolicyError) throw error;
      if (signal.aborted) throw new Error('R2_WORKSPACE_CANCELLED');
      complete = false;
    }
    if (this.generation !== startGeneration || !this.watcherHealthy || Date.now() - startedAt > maxDurationMs) complete = false;
    entries.sort();
    let gitIdentity: string | null = null;
    if (this.options.git !== undefined) {
      try {
        const baseline = await this.options.git.inspect(signal);
        gitIdentity = baseline.mode === 'git' ? createHash('sha256').update(JSON.stringify({
          worktree: baseline.worktreeIdentity, head: baseline.head, branch: baseline.branch,
          index: baseline.indexHash, conflicts: baseline.conflicts
        })).digest('hex') : null;
      } catch (error) {
        if (signal.aborted) throw error;
        complete = false;
      }
    }
    if (this.generation !== startGeneration || !this.watcherHealthy) complete = false;
    policyChanged ||= await policy.refresh() !== revision;
    cancelled(signal);
    const fingerprint = createHash('sha256').update(revision).update('\0').update(policyChanged ? '' : entries.join('\n'), 'utf8').digest('hex');
    if (!policyChanged) inputHashes['@policy'] = revision;
    return { fingerprint, gitIdentity, complete: complete && !policyChanged, observedPaths: policyChanged ? [] : observedPaths,
      inputHashes: policyChanged ? {} : inputHashes, watcherGeneration: `${this.watcherId}:${this.generation}` };
  }

  close(): void {
    this.watcher?.close();
    this.watcher = undefined;
  }

  private ensureWatcher(root: string, policy: ObserverPolicy): void {
    if (this.watcher !== undefined) return;
    try {
      this.watcher = watch(root, { recursive: true }, (_event, filename) => {
        const relativeName = filename?.toString().replaceAll('\\', '/') ?? '';
        const topLevel = relativeName.split('/')[0]?.toLowerCase();
        // Git metadata and rule changes may invalidate observations even if content returns to baseline.
        if (relativeName.length === 0 || topLevel === '.git' || topLevel === '.codrynignore'
          || policy.decide(relativeName, 'crawl').allowed) this.generation += 1;
      });
      this.watcher.on('error', () => { this.watcherHealthy = false; this.generation += 1; });
    } catch {
      this.watcherHealthy = false;
    }
  }

}
