import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
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
