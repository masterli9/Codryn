import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createR4EvalProjectFixture } from '../tests/support/src/r4-eval-project.ts';
import { readR4EvalOptions } from './r4-eval-selection.mjs';
import { evaluateStorageQuestion, isStorageScopeQuestion, isCompleteStorageTap } from './r4-storage-question.mjs';

test('storage question is selected from a separately frozen dataset', async () => {
  const options = readR4EvalOptions(['--dataset', 'v2', '--case', 'storage-question']);
  assert.equal(options.datasetVersion, 'v2');
  const dataset = JSON.parse(await readFile('tests/support/r4-eval/dataset-v2.json', 'utf8'));
  assert.equal(dataset.frozenBeforeLive, true);
  assert.equal(dataset.cases[0].id, 'storage-question');
  assert.throws(() => readR4EvalOptions(['--dataset', '../v2']), /R4_EVAL_DATASET_ARGUMENT_INVALID/u);
  assert.throws(() => readR4EvalOptions(['--dataset', 'v1', '--dataset', 'v2']), /R4_EVAL_DATASET_ARGUMENT_INVALID/u);
});

test('storage scope question tolerates labels, descriptions and both option orders', () => {
  assert.equal(isStorageScopeQuestion({
    prompt: 'Jak se má hodnota ukládat?',
    options: [{label:'B',description:'synchronizace mezi zařízeními'}, {label:'A',description:'v prohlížeči'}]
  }), true);
  assert.equal(isStorageScopeQuestion({
    prompt: 'Lokálně v prohlížeči, nebo sdílet přes účet?',
    options: [{label:'První možnost'}, {label:'Druhá možnost'}]
  }), true);
  assert.equal(isStorageScopeQuestion({
    prompt: 'Má hodnota zůstat na tomto zařízení, nebo se přenášet mezi počítači?',
    options: [{label:'První možnost'}, {label:'Druhá možnost'}]
  }), true);
  assert.equal(isStorageScopeQuestion({
    prompt: 'Jaký formát má hodnota mít?',
    options: [{label:'Číslo'}, {label:'Text'}]
  }), false);
  assert.equal(isStorageScopeQuestion({
    prompt: 'Jaký formát má hodnota mít?',
    options: [{label:'Místní JSON s vypnutým sdílením'}, {label:'Místní text s vypnutým sdílením'}]
  }), false);
});

test('frozen storage tests reread serialized data from a fresh module', async t => {
  const root = await mkdtemp(join(tmpdir(), 'codryn-storage-question-test-'));
  t.after(() => rm(root, {recursive:true,force:true}));
  await createR4EvalProjectFixture(root, 'storage-question', 'export const nextCount = (value: number) => value + 1;\n');
  const modulePath = join(root, 'src/counter-storage.ts');
  const environment = {...process.env};
  delete environment.NODE_TEST_CONTEXT;
  const run = () => spawnSync(process.execPath, ['--test','--test-reporter=tap'], {
    cwd:root,encoding:'utf8',timeout:15_000,windowsHide:true,env:environment
  });
  const contract = 'interface Store { getItem(key: string): string | null; setItem(key: string, value: string): void; }\n';
  await writeFile(modulePath, contract + `
    const counts = new Map<string, number>();
    export function saveCount(store: Store, value: number) {
      const id = store.getItem('key') || String(counts.size + 1);
      counts.set(id, value);
      store.setItem('key', id);
    }
    export function loadCount(store: Store) {
      return counts.get(store.getItem('key') ?? '') ?? 0;
    }
  `);
  assert.equal(run().status, 1, 'retaining values only in module memory must fail');
  await writeFile(modulePath, contract + `
    globalThis.JSON = { ...JSON };
    export function saveCount(store: Store, value: number) { store.setItem('count', String(value)); }
    export function loadCount(store: Store) { return Number(store.getItem('count') ?? 0); }
  `);
  assert.equal(run().status, 1, 'replacing the verifier’s global JSON binding must fail');
  await writeFile(modulePath, contract + `
    const key = 'count';
    const write = (store: Store, value: number) => store.setItem(key, JSON.stringify({ count: value }));
    const read = (store: Store): number => JSON.parse(store.getItem(key) ?? '{"count":0}').count;
    export { write as saveCount, read as loadCount };
  `);
  const completed = run();
  assert.equal(completed.status, 0, completed.stdout);
  assert.equal(isCompleteStorageTap(completed.stdout), true);
});

test('storage acceptance rejects partial or skipped fixture test output', () => {
  const output = [
    'TAP version 13', 'ok 1 - increments', 'ok 2 - an empty store has the default count',
    'ok 3 - a new reader can load a previously stored count',
    'ok 4 - saving replaces the count and keeps different stores independent',
    '# tests 4', '# pass 4', '# fail 0', '# skipped 0', '# todo 0'
  ].join('\n');
  assert.equal(isCompleteStorageTap(output), true);
  assert.equal(isCompleteStorageTap(output.replace('ok 3 - a new reader can load a previously stored count\n', '')), false);
  assert.equal(isCompleteStorageTap(output.replace('ok 3 -', 'not ok 3 -')), false);
  assert.equal(isCompleteStorageTap(output.replace('# skipped 0', '# skipped 1')), false);
});

test('storage question gate requires behavior, same-run continuation and separate approved checks', () => {
  const good = {
    taskCompleted:true, verificationStatus:'verified', questionTotal:1, scopeQuestion:true, answerDelivered:true,
    answeredAt:10, resumedAt:12, firstMutationAt:14, lastMutationAt:21,
    editedOnlyStorage:true, protectedFilesIntact:true, storageChanged:true,
    checks:[{kind:'test',approvedAt:25,exitCode:0,completeOutput:true},{kind:'typecheck',approvedAt:34,exitCode:0,completeOutput:true}]
  };
  assert.equal(evaluateStorageQuestion(good).success, true);
  for (const [field,value] of [
    ['taskCompleted', false], ['verificationStatus','unverified'], ['questionTotal', 0],
    ['scopeQuestion',false], ['answerDelivered',false], ['answeredAt',null], ['resumedAt',null], ['firstMutationAt',9],
    ['lastMutationAt',26], ['editedOnlyStorage',false], ['protectedFilesIntact',false], ['storageChanged',false],
    ['checks',[{kind:'typecheck',approvedAt:34,exitCode:0,completeOutput:true},{kind:'typecheck',approvedAt:45,exitCode:0,completeOutput:true}]],
    ['checks',[{kind:'test',approvedAt:25,exitCode:1,completeOutput:true},good.checks[1]]],
    ['checks',[{kind:'test',approvedAt:null,exitCode:0,completeOutput:true},good.checks[1]]],
    ['checks',[{kind:'test',approvedAt:25,exitCode:0,completeOutput:false},good.checks[1]]]
  ]) assert.equal(evaluateStorageQuestion({...good,[field]:value}).success, false, field);
});
