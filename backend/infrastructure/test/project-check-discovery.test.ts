import { mkdtemp, mkdir, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { discoverProjectChecks } from '../src/typescript/project-check-discovery.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const discover = (root: string) => discoverProjectChecks(root, process.execPath, AbortSignal.timeout(5000));
async function fixture(pkg: object = { scripts: { test: 'node --test' } }) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'codryn-project-checks-')));
  roots.push(root);
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src', 'app.ts'), 'export const a = 1;');
  await writeFile(join(root, 'app.test.mjs'), 'import { test } from "node:test"; test("fixture", () => {});');
  await writeFile(join(root, 'package.json'), JSON.stringify(pkg));
  await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ include: ['src/**/*.ts'] }));
  return root;
}

for (const [framework, dependencies] of [['node', {}], ['react', { react: '19.2.0' }], ['next', { next: '16.0.0' }]] as const) {
  it(`recognizes ${framework} and derives exact checks without installing anything`, async () => {
    const root = await fixture({ dependencies, scripts: { test: 'node --test' } });
    const before = await readdir(root);
    const profile = await discover(root);
    expect(profile).toMatchObject({ level: 'supported', framework, configPaths: ['tsconfig.json'], includedFiles: ['src/app.ts'] });
    expect(profile.checks).toEqual([
      { kind: 'typecheck', available: true, reason: expect.any(String), command: { executable: process.execPath, cwd: root,
        args: [expect.stringMatching(/typescript[\\/]bin[\\/]tsc$/), '--noEmit', '-p', join(root, 'tsconfig.json')], timeoutMs: 60000, maxOutputBytes: 262144 } },
      { kind: 'test', available: true, reason: expect.any(String), command: { executable: process.execPath, cwd: root,
        args: ['--test', '--test-reporter=tap'], timeoutMs: 120000, maxOutputBytes: 262144 } }
    ]);
    expect(await readdir(root)).toEqual(before);
  });
}

it('reads a bounded local config chain and rejects external, ignored and oversized config', async () => {
  const root = await fixture();
  await mkdir(join(root, 'config'));
  await writeFile(join(root, 'config', 'base.json'), '{"compilerOptions":{"strict":true}}');
  const config = join(root, 'tsconfig.json');
  await writeFile(config, '{"extends":"./config/base.json","include":["src"]}');
  expect((await discover(root)).configPaths).toEqual(['config/base.json', 'tsconfig.json']);
  await writeFile(join(root, '.codrynignore'), 'config/\n');
  expect((await discover(root)).level).toBe('limited');
  await writeFile(config, '{"extends":"../outside.json"}');
  expect((await discover(root)).level).toBe('limited');
  await writeFile(config, ' '.repeat(65537));
  expect((await discover(root)).level).toBe('limited');
});

it('refuses junction configuration aliases before reading the target', async () => {
  const root = await fixture(), other = await fixture();
  await symlink(other, join(root, 'alias'), 'junction');
  await writeFile(join(root, 'tsconfig.json'), '{"extends":"./alias/tsconfig.json","include":["src"]}');
  expect(await discover(root)).toMatchObject({ level: 'limited', configPaths: ['tsconfig.json'] });
});

it.each(['echo OK', 'vitest run'])('keeps the test candidate unavailable for %s', async script => {
  const profile = await discover(await fixture({ scripts: { test: script } }));
  expect(profile.checks.find(candidate => candidate.kind === 'test')).toMatchObject({ available: false, command: null });
});
