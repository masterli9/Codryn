import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdtemp, open, realpath, rename, rmdir, unlink, utimes, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { gitBranchSchema, gitHistorySchema, gitMessageSchema, gitObjectIdSchema, gitPathSchema, gitSnapshotSchema } from '@codryn/shared';
import type { GitItem, GitSide, GitSnapshot } from '@codryn/shared';
import { ContextPathPolicy } from '../filesystem/context-path-policy.js';
import { readBoundedContextFile } from '../filesystem/read-bounded-context-file.js';
import { gitExecutable, GitFailure, requirePassiveGitFilters, runLocalGit } from './local-git-command.js';

const normalized = (value: string) => value.replaceAll('\\', '/');
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const boundedText = (raw: string, limit = 32768) => {
  const prefix = Buffer.from(raw).subarray(0, limit).toString('utf8');
  return { text: prefix, truncated: prefix !== raw };
};
const safePath = (path: string) => gitPathSchema.safeParse(path).success;
const diffFlags = ['--no-ext-diff', '--no-textconv', '--no-color', '--no-renames'];
const safeError = (code: string) => new Error(code);

interface StatusEntry { path: string; old?: string; xy: string }
interface Snapshot {
  view: GitSnapshot;
  root: string;
  executable: string;
  gitDir: string;
  commonDir: string;
  index: string;
  indexHash: string;
  headRef: string | null;
  entries: StatusEntry[];
  identity: string;
}

function parseStatus(raw: string): StatusEntry[] {
  const tokens = raw.split('\0');
  const result: StatusEntry[] = [];
  for (let index = 0; index < tokens.length - 1; index++) {
    const entry = tokens[index];
    if (!entry || entry[2] !== ' ') throw safeError('R4_GIT_FAILED');
    const xy = entry.slice(0, 2), path = entry.slice(3);
    const old = /[RC]/u.test(xy) ? tokens[++index] : undefined;
    result.push({ path, xy, ...(old === undefined ? {} : { old }) });
  }
  return result;
}

const conflict = (xy: string) => xy.includes('U') || xy === 'AA' || xy === 'DD';
const isStaged = (entry: StatusEntry) => entry.xy !== '??' && entry.xy[0] !== ' ';

function projectPath(prefix: string, path: string): string | null {
  const value = prefix ? (path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : null) : path;
  return value !== null && safePath(value) ? value : null;
}

async function regularDigest(path: string, byteLimit: number): Promise<string | null> {
  try {
    const stats = await lstat(path);
    if (!stats.isFile() || stats.isSymbolicLink() || await realpath(path) !== path) return null;
    const bytes = await readBoundedContextFile(path, byteLimit, stats);
    return bytes !== null && await realpath(path) === path ? digest(bytes) : null;
  } catch (error) {
    if (error instanceof Error && Reflect.get(error, 'code') === 'ENOENT') return 'missing';
    return null;
  }
}

function baseView(mode: GitSnapshot['mode'], reason: string): GitSnapshot {
  return { mode, snapshotId: null, projectPrefix: '', head: null, branch: null, upstream: null, ahead: null, behind: null, branches: [],
    items: [], limited: mode !== 'non-git', reason, canCommit: false, canSwitch: false };
}

export class LocalGitOperations {
  constructor(private readonly projectRoot: string, private readonly override?: string) {}

  private async inspect(signal: AbortSignal): Promise<Snapshot> {
    const executable = await gitExecutable(this.override);
    const project = await realpath(this.projectRoot);
    if (project !== this.projectRoot) throw safeError('R3_PROJECT_UNAVAILABLE');
    const run = (cwd: string, args: readonly string[]) => runLocalGit(executable, cwd, args, signal);
    const root = await realpath((await run(project, ['rev-parse', '--show-toplevel'])).trim());
    const prefix = normalized(relative(root, project));
    if (prefix && !safePath(prefix)) throw safeError('R4_GIT_FAILED');
    const [directories, policy] = await Promise.all([
      run(root, ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir', '--git-path', 'index']),
      ContextPathPolicy.fromProjectRoot(project)
    ]);
    const [gitDir, commonDir, index] = directories.trim().split(/\r?\n/u).map(value => resolve(root, value));
    if (!gitDir || !commonDir || !index || await realpath(gitDir) !== gitDir || await realpath(commonDir) !== commonDir || dirname(index) !== gitDir) throw safeError('R4_GIT_FAILED');
    const readIdentity = async () => {
      const initial = await regularDigest(index, 32 * 1024 * 1024);
      if (!initial) throw safeError('R4_GIT_FAILED');
      const [head, headRef] = await Promise.all([
        this.optional(executable, root, ['rev-parse', '--verify', 'HEAD'], signal),
        this.optional(executable, root, ['symbolic-ref', '-q', 'HEAD'], signal)
      ]);
      return [initial, head, headRef] as const;
    };
    const [indexHash, headRaw, headRef] = await readIdentity();
    const head = headRaw ? gitObjectIdSchema.parse(headRaw) : null;
    const branch = headRef?.startsWith('refs/heads/') ? headRef.slice('refs/heads/'.length) : null;
    const branchName = branch && gitBranchSchema.safeParse(branch).success;
    const [branchesRaw, upstream, stateMarkers] = await Promise.all([
      run(root, ['for-each-ref', '--count=101', '--format=%(objectname) %(refname:short)', 'refs/heads']),
      this.optional(executable, root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], signal),
      Promise.all(['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply','sequencer','info/sparse-checkout'].map(name =>
        lstat(join(gitDir, name)).then(() => true, () => false)))
    ]);
    await requirePassiveGitFilters(executable, root, signal);
    const raw = await run(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=all', '--renames']);
    const entries = parseStatus(raw);
    const hashes: [string, string | null][] = [], items: GitItem[] = [];
    const nativeMutation = !stateMarkers.some(Boolean);
    let limited = entries.length > 250;
    let outsideStaged = false, budget = 16 * 1024 * 1024;
    for (const entry of entries.slice(0, 250)) {
      const path = projectPath(prefix, entry.path), old = entry.old === undefined ? undefined : projectPath(prefix, entry.old);
      if ((!path || old === null) && isStaged(entry)) outsideStaged = true;
      if (!path || old === null) continue;
      const allowed = policy.decide(path, 'context', { kind: 'file' }).allowed && (!old || policy.decide(old, 'context', { kind: 'file' }).allowed);
      if (!allowed) { if (isStaged(entry)) outsideStaged = true; continue; }
      if (entry.xy === '??' || entry.xy[1] !== ' ') {
        const full = join(root, entry.path);
        const size = await lstat(full).then(item => item.size, () => 0);
        const hash = size > budget ? null : await regularDigest(full, Math.min(1024 * 1024, budget));
        if (!hash) limited = true;
        if (hash && hash !== 'missing') budget -= size;
        hashes.push([entry.path, hash]);
      }
      const actionable = nativeMutation && !!branchName && !entry.old && !conflict(entry.xy);
      const add = (side: GitSide, status: string) => items.push({ side, path, status, actionable, ...(old ? { originalPath: old } : {}) });
      if (conflict(entry.xy)) add('conflict', 'U');
      else if (entry.xy === '??') add('untracked', '?');
      else {
        if (entry.xy[0] && entry.xy[0] !== ' ') add('staged', entry.xy[0]);
        if (entry.xy[1] && entry.xy[1] !== ' ') add('unstaged', entry.xy[1]);
      }
    }
    limited ||= items.length > 250;
    const branches = branchesRaw.trim().split(/\r?\n/u).map(line => line.slice(line.indexOf(' ') + 1)).filter(name => gitBranchSchema.safeParse(name).success).slice(0, 100);
    let ahead: number | null = null, behind: number | null = null;
    if (upstream && head) {
      const counts = await this.optional(executable, root, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], signal);
      const match = counts?.match(/^(\d+)\s+(\d+)$/u);
      if (match) { ahead = Number(match[1]); behind = Number(match[2]); }
    }
    const [endIndex, endHead, endRef] = await readIdentity(), policyRevision = policy.revision;
    if (indexHash !== endIndex || headRaw !== endHead || headRef !== endRef || await policy.refresh() !== policyRevision) throw safeError('R3_STALE_VIEW');
    const identity = digest(JSON.stringify([root, prefix, indexHash, head, headRef, raw, hashes, policyRevision, branchesRaw, upstream, ahead, behind, stateMarkers]));
    const hasConflict = entries.some(entry => conflict(entry.xy));
    const reason = limited ? 'Stav překročil bezpečný limit.' : !nativeMutation ? 'Git spravuje rozepsanou operaci nebo externí filtry.' :
      !branchName ? 'HEAD není na podporované lokální větvi.' : hasConflict ? 'Vyřešte konflikty v Gitu.' : outsideStaged ? 'Index obsahuje cesty mimo bezpečný rozsah projektu.' : null;
    const view = gitSnapshotSchema.parse({ mode: 'git', snapshotId: identity, projectPrefix: prefix, head, branch, upstream, ahead, behind, branches,
      items: items.slice(0, 250), limited, reason, canCommit: !limited && nativeMutation && !!branchName && !hasConflict && !outsideStaged && entries.some(isStaged),
      canSwitch: !limited && nativeMutation && !!branchName && !!head && !prefix && entries.length === 0 });
    return { view, root, executable, gitDir, commonDir, index, indexHash, headRef, entries, identity };
  }

  async read(signal: AbortSignal): Promise<GitSnapshot> {
    try { return (await this.inspect(signal)).view; }
    catch (error) {
      signal.throwIfAborted();
      if (error instanceof GitFailure && error.reason === 'non-git') return baseView('non-git', 'Projekt je mimo Git worktree.');
      if (error instanceof Error && error.message === 'R3_STALE_VIEW') return baseView('unavailable', 'Git stav se mění. Načtěte jej znovu.');
      if (error instanceof Error && error.message === 'R4_GIT_UNSAFE') return baseView('unavailable', 'Git má nakonfigurované externí filtry.');
      return baseView('unavailable', 'Git stav nelze bezpečně načíst.');
    }
  }

  async key(signal: AbortSignal): Promise<string> {
    return (await this.inspect(signal)).commonDir.toLowerCase();
  }

  private async require(snapshotId: string, signal: AbortSignal): Promise<Snapshot> {
    const state = await this.inspect(signal);
    if (state.identity !== snapshotId || state.view.limited) throw safeError('R3_STALE_VIEW');
    return state;
  }

  private optional(executable: string, root: string, args: readonly string[], signal: AbortSignal): Promise<string | null> {
    return runLocalGit(executable, root, args, signal).then(value => value.trim() || null, error => {
      if (error instanceof GitFailure && (error.exitCode === 1 || error.exitCode === 128)) return null;
      throw error;
    });
  }

  private async command(state: Snapshot, args: readonly string[], signal: AbortSignal, options?: { index?: string; input?: string }) {
    await requirePassiveGitFilters(state.executable, state.root, signal);
    return runLocalGit(state.executable, state.root, args, signal, options);
  }

  async diff(snapshotId: string, path: string, side: GitSide, signal: AbortSignal) {
    const state = await this.require(snapshotId, signal), item = state.view.items.find(item => item.path === path && item.side === side);
    if (!item) throw safeError('R4_GIT_UNSAFE');
    const rootPath = state.view.projectPrefix ? `${state.view.projectPrefix}/${path}` : path;
    const paths = item.originalPath ? [rootPath, state.view.projectPrefix ? `${state.view.projectPrefix}/${item.originalPath}` : item.originalPath] : [rootPath];
    let raw: string;
    if (side === 'untracked') {
      const filename = join(state.root, rootPath), stats = await lstat(filename);
      if (stats.isSymbolicLink() || await realpath(filename) !== filename) throw safeError('R4_GIT_UNSAFE');
      const bytes = await readBoundedContextFile(filename, 32768, stats);
      raw = bytes && !bytes.includes(0) ? bytes.toString('utf8').split('\n').map(line => `+${line}`).join('\n') : 'Obsah nelze bezpečně zobrazit.';
    } else raw = await this.command(state, ['diff', ...diffFlags, ...(side === 'staged' ? ['--cached'] : []), '--', ...paths], signal);
    await this.require(snapshotId, signal);
    return { snapshotId, ...boundedText(raw) };
  }

  async history(snapshotId: string, cursor: number, signal: AbortSignal) {
    const state = await this.require(snapshotId, signal);
    const raw = state.view.head ? await this.command(state, ['log', '-z', '--format=%H%x00%an%x00%aI%x00%P%x00%D%x00%s',
      `--skip=${cursor}`, '-n21', state.view.head, '--', ...(state.view.projectPrefix ? [state.view.projectPrefix] : [])], signal) : '';
    const fields = raw.split('\0'), commits = [];
    for (let index = 0; index + 5 < fields.length; index += 6) commits.push({
      hash: fields[index], author: fields[index + 1]?.slice(0, 256), at: fields[index + 2], parents: fields[index + 3]?.split(' ').filter(Boolean).slice(0, 32),
      refs: fields[index + 4]?.slice(0, 1024), title: fields[index + 5]?.slice(0, 1024)
    });
    await this.require(snapshotId, signal);
    return gitHistorySchema.parse({ snapshotId, commits: commits.slice(0, 20), next: commits.length > 20 && cursor < 4980 ? cursor + 20 : null });
  }

  async commitFiles(snapshotId: string, hash: string, signal: AbortSignal) {
    const state = await this.require(snapshotId, signal);
    gitObjectIdSchema.parse(hash);
    const pathspec = state.view.projectPrefix ? [state.view.projectPrefix] : [];
    const raw = await this.command(state, ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-z', hash, '--', ...pathspec], signal);
    const policy = await ContextPathPolicy.fromProjectRoot(this.projectRoot), paths = raw.split('\0').filter(Boolean)
      .map(path => projectPath(state.view.projectPrefix, path)).filter((path): path is string => !!path && policy.decide(path, 'context', { kind: 'file' }).allowed);
    await this.require(snapshotId, signal);
    return { snapshotId, paths: paths.slice(0, 250), truncated: paths.length > 250 };
  }

  async stagedDiff(snapshotId: string, signal: AbortSignal): Promise<string> {
    const state = await this.require(snapshotId, signal);
    if (!state.view.canCommit) throw safeError('R4_GIT_UNSAFE');
    const policy = await ContextPathPolicy.fromProjectRoot(this.projectRoot);
    const changed = (await this.command(state, ['diff', '--cached', '--name-only', '-z', ...diffFlags, '--'], signal)).split('\0').filter(Boolean);
    if (!changed.length || changed.some(rootPath => {
      const path = projectPath(state.view.projectPrefix, rootPath);
      return path === null || !policy.decide(path, 'context', { kind: 'file' }).allowed;
    })) throw safeError('R4_GIT_UNSAFE');
    const raw = await this.command(state, ['diff', '--cached', ...diffFlags, '--', ...changed], signal);
    await this.require(snapshotId, signal);
    if (!raw.trim() || Buffer.byteLength(raw) > 24000) throw safeError('R4_GIT_UNSAFE');
    return raw;
  }

  private async withIndex<T>(snapshotId: string, signal: AbortSignal, action: (state: Snapshot, temporary: string, publish: () => Promise<void>) => Promise<T>) {
    const state = await this.require(snapshotId, signal);
    const indexLock = state.index + '.lock', headLock = join(state.gitDir, 'HEAD.lock');
    const temporary = join(state.gitDir, `codryn-index-${randomUUID()}`);
    let lockedIndex = false, lockedHead = false;
    try {
      const idx = await open(indexLock, 'wx'); lockedIndex = true; await idx.close();
      const head = await open(headLock, 'wx'); lockedHead = true; await head.close();
      const latest = await this.require(snapshotId, signal);
      if (latest.index !== state.index || latest.gitDir !== state.gitDir) throw safeError('R3_STALE_VIEW');
      if (state.indexHash !== 'missing') {
        const info = await lstat(state.index);
        if (!info.isFile() || info.isSymbolicLink() || await realpath(state.index) !== state.index) throw safeError('R3_STALE_VIEW');
        const bytes = await readBoundedContextFile(state.index, 32 * 1024 * 1024, info);
        if (!bytes || digest(bytes) !== state.indexHash) throw safeError('R3_STALE_VIEW');
        const file = await open(temporary, 'wx');
        try { await file.writeFile(bytes); } finally { await file.close(); }
        // Preserve Git's racy-clean comparison between entry mtimes and the index.
        await utimes(temporary, info.atime, info.mtime);
      }
      return await action(latest, temporary, async () => {
        await this.require(snapshotId, signal);
        const info = await lstat(temporary);
        const bytes = await readBoundedContextFile(temporary, 32 * 1024 * 1024, info);
        if (!bytes) throw safeError('R4_GIT_UNSAFE');
        const lock = await open(indexLock, 'r+');
        try { await lock.writeFile(bytes); await lock.sync(); } finally { await lock.close(); }
        await rename(indexLock, state.index);
        lockedIndex = false;
      });
    } catch (error) {
      if (error instanceof Error && Reflect.get(error, 'code') === 'EEXIST') throw safeError('R3_STALE_VIEW');
      throw error;
    } finally {
      await unlink(temporary).catch(() => undefined);
      if (lockedHead) await unlink(headLock);
      if (lockedIndex) await unlink(indexLock);
    }
  }

  async stage(snapshotId: string, path: string, operation: 'stage' | 'unstage', signal: AbortSignal) {
    await this.withIndex(snapshotId, signal, async (state, index, publish) => {
      const allowedSides: GitSide[] = operation === 'stage' ? ['unstaged', 'untracked'] : ['staged'];
      if (!state.view.items.some(item => item.path === path && item.actionable && allowedSides.includes(item.side))) throw safeError('R4_GIT_UNSAFE');
      const full = state.view.projectPrefix ? `${state.view.projectPrefix}/${path}` : path;
      const filename = join(state.root, full);
      const details = await lstat(filename).catch((error: unknown) => {
        if (error instanceof Error && Reflect.get(error, 'code') === 'ENOENT') return null;
        throw safeError('R4_GIT_UNSAFE');
      });
      if (details && (!details.isFile() || details.isSymbolicLink() || await realpath(filename) !== filename)) throw safeError('R4_GIT_UNSAFE');
      const args = operation === 'stage' ? ['add', '-A', '--', full] : state.view.head ? ['restore', '--staged', '--source=HEAD', '--', full] : ['rm', '--cached', '--', full];
      await this.command(state, args, signal, { index });
      await publish();
    });
    return this.read(signal);
  }

  async commit(snapshotId: string, message: string, signal: AbortSignal) {
    await this.withIndex(snapshotId, signal, async (state, index) => {
      if (!state.view.canCommit || !state.headRef || !gitBranchSchema.safeParse(state.view.branch).success) throw safeError('R4_GIT_UNSAFE');
      const old = state.view.head;
      const tree = gitObjectIdSchema.parse((await this.command(state, ['write-tree'], signal, { index })).trim());
      const commit = gitObjectIdSchema.parse((await this.command(state, ['commit-tree', tree, ...(old ? ['-p', old] : []), '-F', '-'], signal,
        { input: gitMessageSchema.parse(message) + '\n', index }).catch(() => { throw safeError('R4_GIT_IDENTITY'); })).trim());
      await this.require(snapshotId, signal);
      const metadata = await mkdtemp(join(state.commonDir, 'codryn-ref-'));
      try {
        await writeFile(join(metadata, 'commondir'), '..\n', { flag: 'wx' });
        // An independent detached metadata directory lets Git lock the shared
        // branch without also touching the real, already protected HEAD.
        await writeFile(join(metadata, 'HEAD'), commit + '\n', { flag: 'wx' });
        await this.command(state, [`--git-dir=${metadata}`, 'update-ref', '--no-deref', '-m', 'commit: Codryn',
          state.headRef, commit, old ?? '0'.repeat(commit.length)], signal).catch(() => { throw safeError('R3_STALE_VIEW'); });
      } finally {
        await unlink(join(metadata, 'HEAD')).catch(() => undefined);
        await unlink(join(metadata, 'commondir')).catch(() => undefined);
        await rmdir(metadata).catch(() => undefined);
      }
    });
    return this.read(signal);
  }

  async switchBranch(snapshotId: string, target: string, signal: AbortSignal) {
    const state = await this.require(snapshotId, signal);
    gitBranchSchema.parse(target);
    if (!state.view.canSwitch || !state.view.branches.includes(target) || target === state.view.branch) throw safeError('R4_GIT_UNSAFE');
    const targetTree = await this.command(state, ['ls-tree', '-r', '-z', `refs/heads/${target}`], signal);
    if (targetTree.split('\0').some(entry => entry && !/^100(?:644|755) blob [a-f0-9]{40,64}\t/u.test(entry))) throw safeError('R4_GIT_UNSAFE');
    await this.require(snapshotId, signal);
    await this.command(state, ['checkout', '--no-overwrite-ignore', '--no-recurse-submodules', target], signal);
    return this.read(signal);
  }
}
