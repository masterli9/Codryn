import { Worker } from 'node:worker_threads';
import type { R4RepoMapStatus } from '@codryn/shared';
import { ContextPathPolicy, ContextPathPolicyError } from '../filesystem/context-path-policy.js';
import { mapPath, mapRootStamp, readMapFile } from './repo-map-files.js';
import { initialMapStatus, instructionApplies, lexicalPathName } from './repo-map-scan.js';
import type { ScanInput, ScanMode, ScanResult } from './repo-map-scan.js';
import type { RepoMapInstruction, RepoMapItem, RepoMapStore } from './repo-map-store.js';

const resultLimit = 12;
const resultBytes = 32 * 1024;
const instructionLimit = 4;
const instructionBytes = 16 * 1024;
const scanLimits = { entries: 5_000, bytes: 64 * 1024 * 1024 };

type SelectionReason = 'explicit_path' | 'explicit_directory' | 'symbol' | 'name' | 'path';
type OmissionReason = 'changed' | 'unread' | 'policy_changed' | 'limit' | 'policy_invalid' | 'unavailable';

export interface RepoMapSelection {
  items: (RepoMapItem & { reason: SelectionReason })[];
  omitted: { path: string | null; reason: OmissionReason }[];
  limited: boolean;
  policyRevision: string | null;
}

export interface RepoMapInstructionExcerpt extends RepoMapInstruction {
  text: string;
  truncated: boolean;
  policyRevision: string;
}

export interface MapWorkerRequest extends ScanInput {
  signal: AbortSignal;
  report(status: R4RepoMapStatus): void;
}

export type MapWorker = (request: MapWorkerRequest) => Promise<ScanResult>;

type WorkerMessage = { type: 'progress'; status: R4RepoMapStatus } | { type: 'result'; result: ScanResult };

export function runRepoMapWorker(filename: string, request: MapWorkerRequest): Promise<ScanResult> {
  const { signal, report, ...input } = request;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(filename, { workerData: input });
    const abort = () => { void worker.terminate().finally(() => reject(signal.reason)); };
    signal.addEventListener('abort', abort, { once: true });
    worker.on('message', (message: WorkerMessage) => {
      if (signal.aborted) return;
      if (message.type === 'progress') report(message.status);
      else resolve(message.result);
    });
    worker.once('error', reject);
    worker.once('exit', () => {
      signal.removeEventListener('abort', abort);
      reject(signal.aborted ? signal.reason : new Error('R4_REPO_MAP_WORKER_EXITED'));
    });
  });
}

export interface RepoMapHandle {
  status: R4RepoMapStatus;
  done: Promise<R4RepoMapStatus>;
}

interface ActiveScan {
  handle: RepoMapHandle;
  controller: AbortController;
}

interface OpenMap {
  root: string;
  latest: RepoMapHandle;
  active: ActiveScan | null;
}

type SymbolEngine = (input: {
  root: string;
  path: string;
  contentHash: string;
  policyRevision: string;
  signal: AbortSignal;
}) => Promise<readonly string[] | null>;

export class RepoMapBuilder {
  private readonly projects = new Map<string, OpenMap>();
  private readonly pending = new Set<Promise<R4RepoMapStatus>>();

  constructor(
    private readonly store: RepoMapStore,
    private readonly worker: MapWorker,
    private readonly symbolEngine?: SymbolEngine
  ) {}

  start(projectId: string, root: string, signal: AbortSignal): RepoMapHandle {
    const open = this.projects.get(projectId);
    if (open?.root === root) return open.latest;
    if (open) this.close(projectId);
    return this.launch(projectId, root, 'quick', signal);
  }

  status(projectId: string): R4RepoMapStatus {
    return this.requireOpen(projectId).latest.status;
  }

  statusIfOpen(projectId: string): R4RepoMapStatus | undefined {
    return this.projects.get(projectId)?.latest.status;
  }

  init(projectId: string, signal: AbortSignal): RepoMapHandle {
    const open = this.requireOpen(projectId);
    if (open.active?.handle.status.mode === 'deep') return open.active.handle;
    open.active?.controller.abort();
    return this.launch(projectId, open.root, 'deep', signal);
  }

  cancel(projectId: string): R4RepoMapStatus {
    const open = this.requireOpen(projectId);
    const active = open.active;
    if (!active) return open.latest.status;
    active.controller.abort();
    active.handle.status = { ...active.handle.status, state: 'partial', reason: 'cancelled' };
    return active.handle.status;
  }

  close(projectId: string): void {
    this.projects.get(projectId)?.active?.controller.abort();
    this.projects.delete(projectId);
  }

  closeAll(): void {
    for (const id of this.projects.keys()) this.close(id);
  }

  async drain(signal: AbortSignal): Promise<void> {
    if (!this.pending.size || signal.aborted) return;
    let onAbort = () => {};
    try {
      await Promise.race([
        Promise.all(this.pending),
        new Promise<void>(resolve => {
          onAbort = resolve;
          signal.addEventListener('abort', onAbort, { once: true });
        })
      ]);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  async deepen(projectId: string, task: string, explicitPaths: readonly string[], signal: AbortSignal): Promise<RepoMapSelection> {
    const result: RepoMapSelection = { items: [], omitted: [], limited: false, policyRevision: null };
    const open = this.projects.get(projectId);
    if (!open) return result;
    try {
      const policy = await ContextPathPolicy.fromProjectRoot(open.root);
      if (await mapRootStamp(open.root) === null) return { ...result, omitted: [{ path: null, reason: 'unavailable' }] };
      const revision = result.policyRevision = policy.revision;
      const saved = this.store.current(projectId);
      if (!saved) return result;
      if (saved.policyRevision !== revision) {
        this.refresh(projectId, open);
        return { ...result, omitted: [{ path: null, reason: 'policy_changed' }] };
      }
      const terms = new Set(task.toLowerCase().match(/[\p{L}\p{N}_$-]{2,}/gu) ?? []);
      const current = new Map(saved.items.map(item => [item.path, item]));
      const ranked = saved.items.flatMap(item => {
        const reason = select(item, task.toLowerCase(), terms, explicitPaths);
        return reason ? [{ item, reason }] : [];
      }).sort((left, right) => rank[left.reason] - rank[right.reason]);
      const config = saved.items.filter(item => /(?:^|\/)tsconfig[^/]*\.json$/i.test(item.path) && item.kind === 'file');
      const checked = new Map<string, boolean>();
      let readBytes = 0, selectionBytes = 0, verified = 0;
      const isCurrent = async (item: RepoMapItem): Promise<boolean> => {
        const previous = checked.get(item.path);
        if (previous !== undefined) return previous;
        if (item.freshness === 'unread' || verified >= 48 || readBytes >= 8 * 1024 * 1024) return false;
        verified++;
        const value = await readMapFile(open.root, item.path, policy, 'context', signal, 8 * 1024 * 1024 - readBytes);
        readBytes += value.bytes;
        const same = value.state === 'read' && value.hash === item.contentHash;
        checked.set(item.path, same);
        return same;
      };
      for (const { item, reason } of ranked.slice(0, resultLimit)) {
        signal.throwIfAborted();
        const related = /\.[cm]?[jt]sx?$/i.test(item.path) ? [...config] : [];
        const visited = new Set([item.path]);
        const pending = [...item.imports];
        while (pending.length && visited.size <= 48) {
          const path = pending.shift();
          if (!path || visited.has(path)) continue;
          visited.add(path);
          const dependency = current.get(path);
          if (dependency) {
            related.push(dependency);
            pending.push(...dependency.imports);
          }
        }
        if (item.freshness === 'unread') {
          result.omitted.push({ path: item.path, reason: 'unread' });
          continue;
        }
        if (pending.length || !await isCurrent(item) || !await everyCurrent(related, isCurrent)) {
          result.omitted.push({ path: item.path, reason: 'changed' });
          continue;
        }
        const symbols = this.symbolEngine && item.role === 'source'
          ? await this.symbolEngine({ root: open.root, path: item.path, contentHash: item.contentHash, policyRevision: revision, signal }).catch(() => null)
          : null;
        if (symbols) {
          // The engine may read asynchronously, so verify the selected file again.
          checked.delete(item.path);
          if (!await isCurrent(item)) {
            result.omitted.push({ path: item.path, reason: 'changed' });
            continue;
          }
        }
        const metadata = {
          ...item, reason,
          symbols: symbols ? [...new Set(symbols.filter(symbol => /^[\p{L}_$][\p{L}\p{N}_$]{0,119}$/u.test(symbol)))].sort().slice(0, 64) : item.symbols
        };
        const size = Buffer.byteLength(JSON.stringify(metadata), 'utf8');
        if (selectionBytes + size > resultBytes) { result.limited = true; break; }
        selectionBytes += size;
        result.items.push(metadata);
      }
      signal.throwIfAborted();
      if (await policy.refresh() !== revision || this.projects.get(projectId) !== open) {
        return { ...result, items: [], omitted: [{ path: null, reason: 'policy_changed' }] };
      }
      if (result.omitted.some(item => item.reason === 'changed')) this.refresh(projectId, open);
      result.limited ||= ranked.length > resultLimit;
      return result;
    } catch (error) {
      signal.throwIfAborted();
      return { ...result, items: [], omitted: [{ path: null, reason: error instanceof ContextPathPolicyError ? 'policy_invalid' : 'unavailable' }] };
    }
  }

  async instructions(projectId: string, signal: AbortSignal, explicitPaths: readonly string[] = []): Promise<RepoMapInstructionExcerpt[]> {
    const open = this.projects.get(projectId);
    if (!open) return [];
    try {
      const policy = await ContextPathPolicy.fromProjectRoot(open.root);
      if (await mapRootStamp(open.root) === null) return [];
      const policyRevision = policy.revision;
      const saved = this.store.current(projectId);
      const records = saved?.policyRevision === policyRevision ? saved.instructions : [];
      const known = new Map(records.map(record => [record.path, record]));
      const paths = [...new Set(['AGENTS.md', ...known.keys()])].filter(path => instructionApplies(path, explicitPaths)).slice(0, instructionLimit);
      let remaining = instructionBytes;
      const excerpts: RepoMapInstructionExcerpt[] = [];
      for (const path of paths) {
        signal.throwIfAborted();
        const value = await readMapFile(open.root, path, policy, 'context', signal, 128 * 1024);
        if (value.state !== 'read') continue;
        const recorded = known.get(path);
        if (recorded && recorded.contentHash !== value.hash) this.refresh(projectId, open);
        const bytes = Buffer.from(value.text, 'utf8');
        const truncated = bytes.length > remaining;
        const text = new TextDecoder().decode(bytes.subarray(0, remaining), { stream: truncated });
        excerpts.push({ path, contentHash: value.hash, authority: 'project_rules', text, truncated, policyRevision });
        remaining -= Buffer.byteLength(text, 'utf8');
        if (truncated || remaining <= 0) break;
      }
      signal.throwIfAborted();
      return await policy.refresh() === policyRevision && this.projects.get(projectId) === open ? excerpts : [];
    } catch {
      signal.throwIfAborted();
      return [];
    }
  }

  private requireOpen(projectId: string): OpenMap {
    const open = this.projects.get(projectId);
    if (!open) throw new Error('R3_NOT_FOUND');
    return open;
  }

  private refresh(projectId: string, open: OpenMap): void {
    if (!open.active && this.projects.get(projectId) === open) {
      this.launch(projectId, open.root, open.latest.status.mode, new AbortController().signal);
    }
  }

  private launch(projectId: string, root: string, mode: ScanMode, external: AbortSignal): RepoMapHandle {
    const controller = new AbortController();
    const timeout = AbortSignal.timeout(mode === 'quick' ? 5_000 : 30_000);
    const signal = AbortSignal.any([controller.signal, external, timeout]);
    const handle: RepoMapHandle = { status: initialMapStatus(mode), done: Promise.resolve(initialMapStatus(mode)) };
    const active = { handle, controller };
    const project = { root, latest: handle, active } as OpenMap;
    this.projects.set(projectId, project);
    handle.done = this.build(projectId, project, handle, mode, signal, timeout).finally(() => {
      if (this.projects.get(projectId) === project) project.active = null;
      this.pending.delete(handle.done);
    });
    this.pending.add(handle.done);
    return handle;
  }

  private async build(projectId: string, project: OpenMap, handle: RepoMapHandle, mode: ScanMode, signal: AbortSignal, timeout: AbortSignal): Promise<R4RepoMapStatus> {
    let generation: number | null = null;
    try {
      signal.throwIfAborted();
      generation = this.store.begin(projectId);
      const result = await this.worker({
        root: project.root, mode, signal,
        limits: { ...scanLimits, milliseconds: mode === 'quick' ? 4_500 : 29_500 },
        report: status => { if (!signal.aborted) handle.status = status; }
      });
      signal.throwIfAborted();
      if (result.policyRevision !== null) {
        for (let offset = 0; offset < result.items.length; offset += 128) {
          signal.throwIfAborted();
          this.store.stage(projectId, generation, result.items.slice(offset, offset + 128), offset === 0 ? result.instructions : []);
        }
        const policy = await ContextPathPolicy.fromProjectRoot(project.root);
        signal.throwIfAborted();
        const current = await this.verify(project.root, mode, policy, result, signal);
        signal.throwIfAborted();
        if (!current || this.projects.get(projectId) !== project || !this.store.publish(projectId, generation, result.policyRevision)) {
          return handle.status = { ...handle.status, state: 'partial', reason: 'changed' };
        }
        generation = null;
      }
      return handle.status = result.status;
    } catch (error) {
      if (signal.aborted) return handle.status = { ...handle.status, state: 'partial', reason: timeout.aborted ? 'limit' : 'cancelled' };
      if (error instanceof ContextPathPolicyError) {
        return handle.status = { ...handle.status, state: 'error', reason: 'policy_invalid', ...(error.line ? { policyLine: error.line } : {}) };
      }
      return handle.status = { ...handle.status, state: 'error', reason: 'unavailable' };
    } finally {
      if (generation !== null) this.store.discard(projectId, generation);
    }
  }

  private async verify(root: string, mode: ScanMode, policy: ContextPathPolicy, result: ScanResult, signal: AbortSignal): Promise<boolean> {
    const verification = result.verification;
    if (!verification || policy.revision !== result.policyRevision || await mapRootStamp(root) !== verification.root) return false;
    const action = mode === 'deep' ? 'deep_init' : 'map';
    // Use small batches to keep publication off the synchronous desktop path.
    for (let offset = 0; offset < verification.stamps.length; offset += 16) {
      signal.throwIfAborted();
      const same = await Promise.all(verification.stamps.slice(offset, offset + 16).map(async ([path, stamp]) =>
        (await mapPath(root, path, policy, action))?.stamp === stamp));
      if (same.includes(false)) return false;
    }
    return await mapRootStamp(root) === verification.root && await policy.refresh() === result.policyRevision;
  }
}

const rank: Record<SelectionReason, number> = { explicit_path: 0, explicit_directory: 1, symbol: 2, name: 3, path: 4 };

function select(item: RepoMapItem, task: string, terms: ReadonlySet<string>, explicitPaths: readonly string[]): SelectionReason | null {
  if (explicitPaths.includes(item.path)) return 'explicit_path';
  if (explicitPaths.some(path => item.path.startsWith(path + '/'))) return 'explicit_directory';
  if (item.symbols.some(symbol => terms.has(symbol.toLowerCase()))) return 'symbol';
  if (terms.has(lexicalPathName(item.path))) return 'name';
  return task.includes(item.path.toLowerCase()) ? 'path' : null;
}

async function everyCurrent(items: readonly RepoMapItem[], check: (item: RepoMapItem) => Promise<boolean>): Promise<boolean> {
  for (const item of items) if (!await check(item)) return false;
  return true;
}
