import { test } from 'node:test';
import assert from 'node:assert/strict';
import { link, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeR4EvalOutput } from './r4-safe-output.mjs';

test('replaces a regular eval report and rejects a symlink destination without changing its target', async t => {
  const root = await mkdtemp(join(tmpdir(), 'codryn-r4-safe-output-'));
  const evalDirectory = join(root, 'evals'), outside = join(root, 'outside.json'), target = join(evalDirectory, 'report.json');
  try {
    await mkdir(evalDirectory);
    await writeFile(outside, 'outside marker');
    await writeFile(target, 'old report');
    await writeR4EvalOutput(evalDirectory, target, 'new report');
    assert.equal(await readFile(target, 'utf8'), 'new report');

    await rm(target);
    try { await symlink(outside, target, 'file'); }
    catch (error) {
      if (error instanceof Error && ['EPERM', 'EACCES'].includes(Reflect.get(error, 'code'))) {
        t.skip('Host does not permit creating a test file symlink.');
        return;
      }
      throw error;
    }
    await assert.rejects(writeR4EvalOutput(evalDirectory, target, 'must not follow'), { message: 'R4_EVAL_OUTPUT_SYMLINK' });
    assert.equal(await readFile(outside, 'utf8'), 'outside marker');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rejects targets outside the eval directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codryn-r4-safe-output-root-'));
  try {
    const evalDirectory = join(root, 'evals');
    await mkdir(evalDirectory);
    await assert.rejects(writeR4EvalOutput(evalDirectory, join(root, 'outside.json'), 'blocked'), { message: 'R4_EVAL_OUTPUT_INVALID' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('replaces a hard-linked report without truncating the linked file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codryn-r4-safe-hardlink-'));
  const evalDirectory = join(root, 'evals'), outside = join(root, 'outside.json'), target = join(evalDirectory, 'report.json');
  try {
    await mkdir(evalDirectory);
    await writeFile(outside, 'outside marker');
    await link(outside, target);
    await writeR4EvalOutput(evalDirectory, target, 'new report');
    assert.equal(await readFile(outside, 'utf8'), 'outside marker');
    assert.equal(await readFile(target, 'utf8'), 'new report');
  } finally { await rm(root, { recursive: true, force: true }); }
});
