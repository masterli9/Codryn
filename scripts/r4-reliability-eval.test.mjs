import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { r4EvalDatasetPath, readR4EvalOptions } from './r4-eval-selection.mjs';
import { evaluateRepair, evaluateContinuation, isCompleteRepairTap } from './r4-reliability-eval.mjs';

test('reliability cases are selected without changing the v2 dataset', async () => {
  const options = readR4EvalOptions(['--dataset', 'v3', '--case', 'repair-git']);
  const dataset = JSON.parse(await readFile(r4EvalDatasetPath(options.datasetVersion), 'utf8'));
  const v2 = JSON.parse(await readFile(r4EvalDatasetPath('v2'), 'utf8'));
  assert.deepEqual(dataset.cases.map(item => item.id), ['storage-question', 'repair-git', 'continuation-current']);
  assert.deepEqual(dataset.cases[0], v2.cases[0]);
  assert.equal(dataset.frozenBeforeLive, true);
});

const repair = {
  taskCompleted: true, verificationStatus: 'verified', firstMutationAt: 15, lastMutationAt: 20,
  editedOnlyTarget: true, protectedFilesIntact: true, targetChanged: true,
  checks: [
    { kind: 'test', approvedAt: 5, recordedAt: 10, outcome: 'failed', exitCode: 1, coversTarget: true, expectedFailure: true },
    { kind: 'test', approvedAt: 21, recordedAt: 22, outcome: 'passed', exitCode: 0, completeOutput: true, coversTarget: true },
    { kind: 'typecheck', approvedAt: 23, recordedAt: 25, outcome: 'passed', exitCode: 0, completeOutput: true, coversTarget: true }
  ]
};

test('repair acceptance requires a completed failure before the first write and both final checks', () => {
  assert.equal(evaluateRepair(repair).success, true);
  for (const [field, value] of [
    ['taskCompleted', false], ['verificationStatus', 'stale'], ['firstMutationAt', 9], ['lastMutationAt', 21],
    ['editedOnlyTarget', false], ['protectedFilesIntact', false], ['targetChanged', false],
    ['checks', repair.checks.slice(1)], ['checks', [repair.checks[0], repair.checks[2]]],
    ['checks', [{ ...repair.checks[0], expectedFailure: false }, ...repair.checks.slice(1)]],
    ['checks', [{ ...repair.checks[0], outcome: 'incomplete' }, ...repair.checks.slice(1)]],
    ['checks', [repair.checks[0], { ...repair.checks[1], completeOutput: false }, repair.checks[2]]],
    ['checks', [repair.checks[0], { ...repair.checks[1], coversTarget: false }, repair.checks[2]]],
    ['checks', [repair.checks[0], repair.checks[1], { ...repair.checks[2], approvedAt: null }]]
  ]) assert.equal(evaluateRepair({ ...repair, [field]: value }).success, false, field);
});

test('repair acceptance requires every fixture test and rejects skipped or substituted tests', () => {
  const tap = ['ok 1 - increments 1', 'ok 2 - increments 0', 'ok 3 - increments a negative count',
    '# tests 3', '# pass 3', '# fail 0', '# skipped 0', '# todo 0'].join('\n');
  assert.equal(isCompleteRepairTap(tap), true);
  assert.equal(isCompleteRepairTap(tap.replace('ok 2 - increments 0', 'ok 2 - unrelated')), false);
  assert.equal(isCompleteRepairTap(tap.replace('# skipped 0', '# skipped 1')), false);
});

test('continuation accepts the new value only with the prior exchange and no model writes', () => {
  const good = { firstCompleted: true, secondCompleted: true, distinctRuns: true, priorExchange: true, freshSource: true,
    firstReply: '`build-kedrov-194`', secondReply: 'build-vesper-872',
    priorValue: 'build-kedrov-194', currentValue: 'build-vesper-872',
    noMutations: true, protectedFilesIntact: true };
  assert.equal(evaluateContinuation(good).success, true);
  for (const [field, value] of [
    ['firstCompleted', false], ['secondCompleted', false], ['distinctRuns', false], ['priorExchange', false], ['freshSource', false],
    ['firstReply', ''], ['secondReply', good.priorValue], ['secondReply', `${good.priorValue} or ${good.currentValue}`],
    ['noMutations', false], ['protectedFilesIntact', false]
  ]) assert.equal(evaluateContinuation({ ...good, [field]: value }).success, false, field);
});
