import { ContextAssembler } from '@codryn/core';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ContextPathPolicy, FileWorkspaceObserver, ProjectFilesystem } from '../src/index.js';

const actions = ['crawl', 'search', 'typescript_index', 'map', 'deep_init', 'context', 'explicit_file'] as const;
const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'codryn-r4-policy-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('shared project context policy', () => {
  it.each(actions)('guards paths, kind and bounded UTF-8 content for %s', (action) => {
    const policy = new ContextPathPolicy(['private/', '!**/.env.*', '!build/**', 'secrets']);
    for (const path of ['.git/config', 'node_modules/lib/index.d.ts', 'Build/bundle.js', '.cache/x', 'UserData/db',
      'pkg\\.ENV.Local', '.env-local', 'id_ed25519', 'credentials.json', 'certs/key.pem', '.env/child.txt']) {
      expect(policy.decide(path, action, { kind: 'file' })).toMatchObject({ allowed: false, code: 'R1_PATH_SENSITIVE' });
    }
    expect(policy.decide('private', action, { kind: 'file' })).toMatchObject({ allowed: true });
    for (const path of ['private', 'secrets']) {
      expect(policy.decide(path, action, { kind: 'directory' })).toMatchObject({ allowed: false, code: 'R2_CONTEXT_PATH_IGNORED' });
      expect(policy.decide(`${path}/inside.txt`, action)).toMatchObject({ allowed: false, code: 'R2_CONTEXT_PATH_IGNORED' });
    }
    expect(policy.decide('..\\outside.ts', action)).toMatchObject({ allowed: false, code: 'R1_PATH_INVALID' });
    expect(policy.decide('binary', action, { kind: 'file', bytes: Buffer.from([0xff]) })).toMatchObject({ allowed: false, code: 'R1_FILE_NOT_TEXT' });
    expect(policy.decide('large', action, { kind: 'file', size: 1_048_577 })).toMatchObject({ allowed: false, code: 'R1_FILE_TOO_LARGE' });
  });

  it('uses a stable revision and fails closed on a broken rule until repaired', async () => {
    const root = await tempRoot();
    const rules = join(root, '.codrynignore');
    const policy = await ContextPathPolicy.fromProjectRoot(root);
    const original = policy.revision;
    expect(original).toMatch(/^[a-f0-9]{64}$/);
    await writeFile(rules, '# comment\nprivate/\n');
    const revision = await policy.refresh();
    expect(revision).not.toBe(original);
    await writeFile(rules, './private/\r\n');
    expect(await policy.refresh()).toBe(revision);
    await writeFile(rules, '# comment\nC:\\outside\n');
    await expect(policy.refresh()).rejects.toMatchObject({ code: 'R2_CONTEXT_POLICY_INVALID', line: 2, reason: 'absolute_pattern' });
    expect(policy.revision).toBe(revision);
    expect(policy.decide('visible.txt', 'context')).toMatchObject({ allowed: false, code: 'R2_CONTEXT_POLICY_INVALID' });
    await rm(rules);
    expect(await policy.refresh()).toBe(original);
  });

  it('matches Windows ignore paths independently of case and separator', () => {
    const policy = new ContextPathPolicy(['Src\\Generated/']);
    expect(policy.allowed('Src/Generated/code.ts')).toBe(false);
    expect(policy.allowed('SRC\\GENERATED\\code.ts')).toBe(process.platform !== 'win32');
  });

  it('classifies only eligible explicit files for the later permit flow', () => {
    const policy = new ContextPathPolicy(['private/']);
    expect(policy.decide('private/file.txt', 'explicit_file', { kind: 'file' }).permit).toBe('ignored');
    expect(policy.decide('private/.env.local', 'explicit_file', { kind: 'file' }).permit).toBe('sensitive');
    expect(policy.decide('private/.env.local', 'explicit_file', { kind: 'file', size: 1_048_577 }).permit).toBeUndefined();
    expect(policy.decide('private/.env.local', 'crawl', { kind: 'file' }).permit).toBeUndefined();
    expect(policy.decide('private', 'explicit_file', { kind: 'directory' }).permit).toBeUndefined();
    expect(policy.decide('node_modules/.env', 'explicit_file', { kind: 'file' }).permit).toBeUndefined();
    expect(policy.decide('.env/file.txt', 'explicit_file', { kind: 'file' }).permit).toBeUndefined();
  });

  it('discards an observation when rules change before publishing it', async () => {
    const root = await tempRoot();
    await writeFile(join(root, 'visible.txt'), 'Needle');
    const observer = new FileWorkspaceObserver(root, { git: { inspect: async () => {
      await writeFile(join(root, '.codrynignore'), 'visible.txt\n');
      return { mode: 'non-git' as const, reason: 'not_repository' as const };
    } } });
    try {
      await expect(observer.inspect(new AbortController().signal)).resolves.toMatchObject({ complete: false, observedPaths: [] });
    } finally { observer.close(); }
  });

  it('discards context from earlier references when the policy changes between reads', async () => {
    const root = await tempRoot();
    const filesystem = new ProjectFilesystem(root);
    await writeFile(join(root, 'first.txt'), 'Needle');
    await writeFile(join(root, 'second.txt'), 'Other');
    const assembler = new ContextAssembler({
      searchText: filesystem.searchText.bind(filesystem),
      refreshPolicyRevision: filesystem.refreshPolicyRevision.bind(filesystem),
      readFile: async (input, signal) => {
        const result = await filesystem.readFile(input, signal);
        if (input.path === 'first.txt') await writeFile(join(root, '.codrynignore'), 'first.txt\n');
        return result;
      }
    });
    await expect(assembler.assemble({ task: 'fixture', project: { id: 'fixture' }, contextReferences: ['first.txt', 'second.txt'] }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'R4_CONTEXT_POLICY_CHANGED' });
  });

  it('shares exclusion, canonical target checks and rule errors across crawl, search and context', async () => {
    const root = await tempRoot();
    const outside = await tempRoot();
    const fixture = new Map<string, string | Buffer>([
      ['.codrynignore', 'private/\n!.env.local\n'], ['.git/config', 'Needle'], ['node_modules/pkg.d.ts', 'Needle'],
      ['build/out.txt', 'Needle'], ['.cache/cached.txt', 'Needle'], ['.env.local', 'Needle'], ['id_rsa', 'Needle'],
      ['private/hidden.txt', 'Needle'], ['visible.txt', 'Needle'], ['binary.bin', Buffer.from([0, 1])],
      ['large.txt', 'Needle'.padEnd(1_048_577, 'x')]
    ]);
    for (const [path, contents] of fixture) {
      const file = join(root, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, contents);
    }
    await writeFile(join(outside, 'external.txt'), 'Needle');
    await symlink(outside, join(root, 'outside-alias'), 'junction');
    await symlink(join(root, 'private'), join(root, 'private-alias'), 'junction');
    const filesystem = new ProjectFilesystem(root);
    const observer = new FileWorkspaceObserver(root);
    const assembler = new ContextAssembler(filesystem);
    const signal = new AbortController().signal;
    const assemble = (path: string) => assembler.assemble({ task: 'fixture', project: { id: 'fixture' }, contextReferences: [path] }, signal);
    try {
      expect((await observer.inspect(signal)).observedPaths).toEqual(['.codrynignore', 'visible.txt']);
      await expect(filesystem.searchText({ query: 'Needle' }, signal)).resolves.toMatchObject({ matches: [{ path: 'visible.txt' }] });
      await expect(assemble('visible.txt')).resolves.toMatchObject({ modelContent: [{ path: 'visible.txt', content: 'Needle' }] });
      for (const path of ['.env.local', 'private/hidden.txt', 'private-alias/hidden.txt', 'outside-alias/external.txt', 'binary.bin', 'large.txt']) {
        await expect(assemble(path)).rejects.toMatchObject({ code: 'R1_CONTEXT_REFERENCE_INVALID' });
      }
      await writeFile(join(root, '.codrynignore'), '# comment\n[bad]\n');
      for (const read of [() => observer.inspect(signal), () => filesystem.searchText({ query: 'Needle' }, signal), () => assemble('visible.txt')]) {
        await expect(read()).rejects.toMatchObject({ code: 'R2_CONTEXT_POLICY_INVALID', line: 2, reason: 'unsupported_character_class' });
      }
      await writeFile(join(root, '.codrynignore'), 'visible.txt\n');
      expect((await observer.inspect(signal)).observedPaths).toEqual(['.codrynignore', 'private/hidden.txt']);
      await expect(filesystem.searchText({ query: 'Needle' }, signal)).resolves.toMatchObject({ matches: [{ path: 'private/hidden.txt' }] });
      await expect(assemble('visible.txt')).rejects.toMatchObject({ code: 'R1_CONTEXT_REFERENCE_INVALID' });
    } finally { observer.close(); }
  });
});
