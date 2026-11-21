import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { LocalGitOperations } from '../src/git/local-git-operations.js';
import { createR3Infrastructure } from '../src/create-r3-infrastructure.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'codryn-r4-git-')));
  roots.push(root);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, windowsHide: true, timeout: 5000,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' }, encoding: 'utf8' });
  git('init', '-b', 'main');
  git('config', 'user.name', 'Codryn Test'); git('config', 'user.email', 'test@example.invalid');
  await mkdir(join(root, 'project'));
  await writeFile(join(root, 'project', 'file.ts'), 'export const value = 1;\n');
  await writeFile(join(root, 'outside.txt'), 'outside\n');
  git('add', '.'); git('commit', '-m', 'initial');
  return { root, git, path: join(root, 'project', 'file.ts'), signal: AbortSignal.timeout(45000) };
}

it('exposes staged and unstaged sides for a nested project and refuses outside staged data on commit', async () => {
  const f = await fixture(), local = new LocalGitOperations(join(f.root, 'project'));
  await writeFile(f.path, 'export const value = 2;\n'); f.git('add', 'project/file.ts');
  await writeFile(f.path, 'export const value = 3;\n');
  const first = await local.read(f.signal);
  expect(first).toMatchObject({ branch: 'main', projectPrefix: 'project', items: [{ path: 'file.ts', side: 'staged' }, { path: 'file.ts', side: 'unstaged' }], canSwitch: false });
  if (!first.snapshotId) throw new Error('Missing snapshot.');
  expect((await local.diff(first.snapshotId, 'file.ts', 'staged', f.signal)).text).toContain('+export const value = 2;');
  expect((await local.diff(first.snapshotId, 'file.ts', 'unstaged', f.signal)).text).toContain('+export const value = 3;');
  await writeFile(join(f.root, 'outside.txt'), 'edited\n'); f.git('add', 'outside.txt');
  await expect(local.commit(first.snapshotId, 'refuse stale snapshot', f.signal)).rejects.toThrow('R3_STALE_VIEW');
  const current = await local.read(f.signal);
  expect(current.canCommit).toBe(false);
  if (!current.snapshotId) throw new Error('Missing snapshot.');
  await expect(local.commit(current.snapshotId, 'refuse outside staged data', f.signal)).rejects.toThrow();
  expect(f.git('log', '-1', '--format=%s').trim()).toBe('initial');
});

it('shows every required Git status and opens diffs from the current index and worktree', async () => {
  const f = await fixture(), local = new LocalGitOperations(f.root);
  await writeFile(join(f.root, 'changed.ts'), 'export const staged = 1;\n');
  await writeFile(join(f.root, 'deleted.ts'), 'remove me\n');
  f.git('add', 'changed.ts', 'deleted.ts'); f.git('commit', '-m', 'Git status fixture');
  await writeFile(join(f.root, 'conflict.ts'), 'main version\n');
  f.git('add', 'conflict.ts'); f.git('commit', '-m', 'main conflict version');
  f.git('branch', 'conflict-side');
  f.git('checkout', 'conflict-side');
  await writeFile(join(f.root, 'conflict.ts'), 'side version\n');
  f.git('add', 'conflict.ts'); f.git('commit', '-m', 'side conflict version');
  f.git('checkout', 'main');
  await writeFile(join(f.root, 'conflict.ts'), 'other main version\n');
  f.git('add', 'conflict.ts'); f.git('commit', '-m', 'other main version');
  try { f.git('merge', 'conflict-side'); } catch { /* Git leaves a real unmerged index for this fixture. */ }

  await writeFile(join(f.root, 'changed.ts'), 'export const staged = 2;\n');
  f.git('add', 'changed.ts');
  await writeFile(join(f.root, 'changed.ts'), 'export const unstaged = 3;\n');
  await unlink(join(f.root, 'deleted.ts'));
  await writeFile(join(f.root, 'new.ts'), 'export const fresh = true;\n');

  const view = await local.read(f.signal);
  expect(view.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: 'changed.ts', side: 'staged', status: 'M' }),
    expect.objectContaining({ path: 'changed.ts', side: 'unstaged', status: 'M' }),
    expect.objectContaining({ path: 'deleted.ts', side: 'unstaged', status: 'D' }),
    expect.objectContaining({ path: 'new.ts', side: 'untracked', status: '?' }),
    expect.objectContaining({ path: 'conflict.ts', side: 'conflict', status: 'U' })
  ]));
  if (!view.snapshotId) throw new Error('Missing snapshot.');
  expect((await local.diff(view.snapshotId, 'changed.ts', 'staged', f.signal)).text).toContain('+export const staged = 2;');
  expect((await local.diff(view.snapshotId, 'changed.ts', 'unstaged', f.signal)).text).toContain('+export const unstaged = 3;');
  expect((await local.diff(view.snapshotId, 'deleted.ts', 'unstaged', f.signal)).text).toContain('-remove me');
  expect((await local.diff(view.snapshotId, 'new.ts', 'untracked', f.signal)).text).toContain('+export const fresh = true;');
  expect((await local.diff(view.snapshotId, 'conflict.ts', 'conflict', f.signal)).text).toContain('diff --cc conflict.ts');
});

it('stages and unstages the exact file, commits only the reviewed tree and safely switches a clean branch', async () => {
  const f = await fixture(), local = new LocalGitOperations(f.root);
  f.git('branch', 'other');
  await writeFile(f.path, 'export const value = 4;\n');
  let view = await local.read(f.signal);
  const id = () => { if (!view.snapshotId) throw new Error('Missing snapshot.'); return view.snapshotId; };
  await expect(local.switchBranch(id(), 'other', f.signal)).rejects.toThrow();
  view = await local.stage(id(), 'project/file.ts', 'stage', f.signal);
  expect(view.reason).toBeNull();
  expect(view.items).toMatchObject([{ path: 'project/file.ts', side: 'staged' }]);
  view = await local.stage(id(), 'project/file.ts', 'unstage', f.signal);
  expect(view.items).toMatchObject([{ path: 'project/file.ts', side: 'unstaged' }]);
  view = await local.stage(id(), 'project/file.ts', 'stage', f.signal);
  expect((await local.stagedDiff(id(), f.signal))).toContain('+export const value = 4;');
  view = await local.commit(id(), 'Explicit message', f.signal);
  expect(f.git('log', '-1', '--format=%s').trim()).toBe('Explicit message');
  expect((await local.history(id(), 0, f.signal)).commits.map(item => item.title)).toEqual(['Explicit message', 'initial']);
  view = await local.switchBranch(id(), 'other', f.signal);
  expect(view.branch).toBe('other');
  expect(await readFile(f.path, 'utf8')).toContain('value = 1');
});

it('sends only staged changes to a fake provider, rejects an old confirmation, and commits the edited message', async () => {
  const f = await fixture();
  const profile = await mkdtemp(join(tmpdir(), 'codryn-r4-git-profile-'));
  roots.push(profile);
  const prompts: string[] = [];
  const host = await createR3Infrastructure({
    userDataPath: profile,
    runtimeFactory: () => async () => { throw new Error('Suggestion should not start an agent run.'); },
    async commitSuggestion(task, mode) {
      expect(mode).toBe('demo');
      prompts.push(task);
      return 'Proposed message';
    }
  });
  try {
    const project = await host.projects.open(f.root, f.signal);
    await host.chats.create(project.id, 'PRIVATE_CHAT_TITLE');
    await writeFile(f.path, 'STAGED_VALUE\n');
    f.git('add', 'project/file.ts');
    await writeFile(f.path, 'UNSTAGED_VALUE\n');
    await writeFile(join(f.root, '.env'), 'HIDDEN_VALUE\n');
    const current = await host.localGit.status(project.id, f.signal);
    if (!current.snapshotId) throw new Error('Missing snapshot.');
    expect(await host.localGit.suggest(project.id, current.snapshotId, f.signal)).toEqual({
      sourceSnapshotId: current.snapshotId, message: 'Proposed message'
    });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('+STAGED_VALUE');
    expect(prompts[0]).not.toMatch(/UNSTAGED_VALUE|HIDDEN_VALUE|PRIVATE_CHAT_TITLE/);
    await writeFile(join(f.root, 'outside.txt'), 'newly staged\n');
    f.git('add', 'outside.txt');
    await expect(host.localGit.mutate(project.id, randomUUID(), 'commit', current.snapshotId, 'Stale message', f.signal)).rejects.toThrow('R3_STALE_VIEW');
    const audit = new DatabaseSync(join(profile, 'codryn.sqlite'), { readOnly: true, allowExtension: false });
    try {
      expect(audit.prepare("SELECT action,status FROM local_git_actions WHERE snapshot_id=? ORDER BY rowid DESC LIMIT 1").get(current.snapshotId))
        .toMatchObject({ action: 'commit', status: 'rejected' });
    } finally { audit.close(); }
    expect(f.git('log', '-1', '--format=%s').trim()).toBe('initial');
    const newest = await host.localGit.status(project.id, f.signal);
    if (!newest.snapshotId) throw new Error('Missing snapshot.');
    await host.localGit.mutate(project.id, randomUUID(), 'commit', newest.snapshotId, 'Edited message', f.signal);
    expect(f.git('log', '-1', '--format=%s').trim()).toBe('Edited message');
    expect(f.git('show', 'HEAD:project/file.ts').trim()).toBe('STAGED_VALUE');
  } finally { host.close(); }
});

it('keeps Git unavailable when a configured external filter could execute', async () => {
  const f = await fixture();
  f.git('config', 'filter.codryn-test.clean', 'false');
  const local = new LocalGitOperations(f.root);
  const view = await local.read(f.signal);
  expect(view.mode).toBe('unavailable');
  expect(view.snapshotId).toBeNull();
  expect(f.git('log', '-1', '--format=%s').trim()).toBe('initial');
});

it('admits only one of two concurrent Git mutations against the same reviewed worktree snapshot', async () => {
  const f=await fixture(),profile=await mkdtemp(join(tmpdir(),'codryn-r4-git-concurrent-'));
  roots.push(profile);
  const host=await createR3Infrastructure({userDataPath:profile,
    runtimeFactory:()=>async()=>{throw new Error('Git fixture must not start an agent.');}});
  try{
    const project=await host.projects.open(f.root,f.signal);
    await writeFile(f.path,'export const value = 2;\n');
    await writeFile(join(f.root,'project','second.ts'),'export const second = 3;\n');
    const paths=['project/file.ts','project/second.ts'];
    const view=await host.localGit.status(project.id,f.signal);
    if(!view.snapshotId)throw new Error('Missing snapshot.');
    const snapshotId=view.snapshotId;
    const outcomes=await Promise.allSettled(paths.map(path=>
      host.localGit.mutate(project.id,randomUUID(),'stage',snapshotId,path,f.signal)));
    expect(outcomes.filter(item=>item.status==='fulfilled')).toHaveLength(1);
    const refused=outcomes.find(item=>item.status==='rejected');
    expect(refused?.status==='rejected'&&refused.reason instanceof Error?refused.reason.message:'').toMatch(/^R3_(PROJECT_BUSY|STALE_VIEW)$/u);
    const accepted=outcomes.findIndex(item=>item.status==='fulfilled');
    expect(f.git('diff','--cached','--name-only','-z').split('\0').filter(Boolean)).toEqual([paths[accepted]]);
    expect(f.git('ls-files','--unmerged')).toBe('');
    expect(f.git('diff','--cached','--check')).toBe('');
    expect(await readFile(f.path,'utf8')).toBe('export const value = 2;\n');
    expect(await readFile(join(f.root,'project','second.ts'),'utf8')).toBe('export const second = 3;\n');
    expect(f.git('log','-1','--format=%s').trim()).toBe('initial');
  }finally{await host.shutdown(AbortSignal.timeout(10000));host.close();}
},60000);
