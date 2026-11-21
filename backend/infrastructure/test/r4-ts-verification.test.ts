import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createR4EvalProjectFixture } from '@codryn/test-support';
import { FileWorkspaceObserver } from '../src/filesystem/workspace-observer.js';
import { createProjectCheckClassifier } from '../src/typescript/project-check-classifier.js';
import { inspectProjectChecks } from '../src/typescript/project-check-discovery.js';

it('compares the exact proposed commands and reclassifies current manifest, config and observed inputs', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'codryn-r4-classify-')));
  const observer = new FileWorkspaceObserver(root);
  const signal = AbortSignal.timeout(15000);
  try {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src', 'main.ts'), 'export const value = 1;');
    await writeFile(join(root, 'test.test.mjs'), 'import "node:test";');
    const manifest = join(root, 'package.json'), config = join(root, 'tsconfig.json');
    await writeFile(manifest, '{"scripts":{"test":"node --test"}}');
    await writeFile(config, '{"include":["src"]}');
    const catalog = await inspectProjectChecks(root, process.execPath, signal);
    const classify = createProjectCheckClassifier(root, catalog, process.execPath);
    const test = catalog.catalog.checks.find(candidate => candidate.kind === 'test')?.command;
    if (!test) throw new Error('Missing exact test candidate.');
    const snapshot = async () => ({ ...await observer.inspect(signal), revision: 1 });
    expect(await classify(test, await snapshot(), signal)).toMatchObject({ kind: 'test', coveredPaths: ['src/main.ts'], evidenceFormat: 'node-tap' });
    expect(await classify({ ...test, args: ['--test'] }, await snapshot(), signal)).toBeNull();
    expect(await classify(test, { ...await snapshot(), complete: false }, signal)).toBeNull();
    await writeFile(manifest, '{"scripts":{"test":"echo OK"}}');
    expect(await classify(test, await snapshot(), signal)).toBeNull();
    await writeFile(manifest, '{"scripts":{"test":"node --test"}}');
    await writeFile(config, '{"compilerOptions":{"strict":true},"include":["src"]}');
    expect(await classify(test, await snapshot(), signal)).toBeNull();
    await writeFile(config, '{"include":["src"]}');
    await writeFile(join(root,'data.txt'),'runtime input');
    await writeFile(join(root,'.codrynignore'),'data.txt\n');
    const ignored=await inspectProjectChecks(root,process.execPath,signal);
    const incomplete=await snapshot();
    expect(incomplete.inputHashes?.['@scope']).toBeUndefined();
    expect(await createProjectCheckClassifier(root,ignored,process.execPath)(test,incomplete,signal)).toBeNull();
    await rm(join(root,'.codrynignore'));
    const reserved=await inspectProjectChecks(root,process.execPath,signal);
    await writeFile(join(root,'@scope'),'reserved metadata name');
    const collision=await snapshot();
    expect(collision.inputHashes?.['@scope']).toBeUndefined();
    expect(await createProjectCheckClassifier(root,reserved,process.execPath)(test,collision,signal)).toBeNull();
  } finally { observer.close(); await rm(root, { recursive: true, force: true }); }
});

it('keeps ignored eval data exclusive to its case so other fixtures remain classifiable', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'codryn-r4-eval-scope-')));
  const ordinaryRoot = join(root, 'ordinary'), ignoredRoot = join(root, 'ignored');
  await mkdir(ordinaryRoot); await mkdir(ignoredRoot);
  const ordinaryObserver = new FileWorkspaceObserver(ordinaryRoot), ignoredObserver = new FileWorkspaceObserver(ignoredRoot);
  const signal = AbortSignal.timeout(15000);
  try {
    const source = 'export function nextCount(value: number) { return value - 1; }\n';
    await createR4EvalProjectFixture(ordinaryRoot, 'change', source);
    await createR4EvalProjectFixture(ignoredRoot, 'ignored', source);

    const ordinaryCatalog = await inspectProjectChecks(ordinaryRoot, process.execPath, signal);
    const ordinarySnapshot = { ...await ordinaryObserver.inspect(signal), revision: 1 };
    const ordinaryCheck = ordinaryCatalog.catalog.checks.find(check => check.kind === 'typecheck')?.command;
    expect(ordinarySnapshot.inputHashes?.['@scope']).toMatch(/^[a-f0-9]{64}$/);
    expect(ordinaryCheck).toBeTruthy();
    if (!ordinaryCheck) throw new Error('Missing ordinary eval typecheck.');
    expect(await createProjectCheckClassifier(ordinaryRoot, ordinaryCatalog, process.execPath)(ordinaryCheck, ordinarySnapshot, signal))
      .toMatchObject({ profileId: 'r4-ts-v1', kind: 'typecheck' });

    const ignoredCatalog = await inspectProjectChecks(ignoredRoot, process.execPath, signal);
    const ignoredSnapshot = { ...await ignoredObserver.inspect(signal), revision: 1 };
    const ignoredCheck = ignoredCatalog.catalog.checks.find(check => check.kind === 'typecheck')?.command;
    expect(ignoredSnapshot.inputHashes?.['@scope']).toBeUndefined();
    expect(await readFile(join(ignoredRoot, 'private/data.txt'), 'utf8')).toBe('SYNTHETIC_IGNORED_MARKER');
    if (!ignoredCheck) throw new Error('Missing ignored eval typecheck candidate.');
    expect(await createProjectCheckClassifier(ignoredRoot, ignoredCatalog, process.execPath)(ignoredCheck, ignoredSnapshot, signal)).toBeNull();
  } finally {
    ordinaryObserver.close(); ignoredObserver.close();
    await rm(root, { recursive: true, force: true });
  }
});
