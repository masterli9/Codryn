import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileReadInputSchema } from '@codryn/core';
import { diagnoseFileReadArguments, summarizeStaleResultsByTurn } from './r4-model-eval-diagnostics.mjs';

test('diagnoses file.read shape without serializing argument values or unknown field names', () => {
  const canary = 'SYNTHETIC_PRIVATE_PATH_CANARY';
  const result = diagnoseFileReadArguments({ path: canary, startLine: 1.5, extra_secret_canary: 'hidden' }, fileReadInputSchema);

  assert.deepEqual(result, {
    fields: [{ name: 'path', type: 'string' }, { name: 'startLine', type: 'number' }],
    unknownFieldCount: 1,
    reasons: ['startLine_not_integer', 'unknown_field']
  });
  assert.equal(JSON.stringify(result).includes(canary), false);
  assert.equal(JSON.stringify(result).includes('extra_secret_canary'), false);
});

test('labels only the exact redacted-history placeholder without exposing its field or value', () => {
  const exact = diagnoseFileReadArguments({ historical: true }, fileReadInputSchema);
  assert.deepEqual(exact, {
    fields: [],
    unknownFieldCount: 1,
    reasons: ['redacted_history_marker_echo']
  });
  assert.equal(JSON.stringify(exact).includes('historical'), false);
  assert.equal(JSON.stringify(exact).includes('true'), false);

  for (const nearMiss of [
    { historical: false },
    { historical: true, extra_secret_canary: 'NEAR_MISS_VALUE' }
  ]) {
    const result = diagnoseFileReadArguments(nearMiss, fileReadInputSchema);
    assert.equal(result.reasons.includes('redacted_history_marker_echo'), false);
    assert.equal(JSON.stringify(result).includes('historical'), false);
    assert.equal(JSON.stringify(result).includes('extra_secret_canary'), false);
    assert.equal(JSON.stringify(result).includes('NEAR_MISS_VALUE'), false);
  }
});

test('reports bounded schema failure classes for missing, wrong-type, and out-of-range arguments', () => {
  assert.deepEqual(diagnoseFileReadArguments({ startLine: '2', maxLines: 401 }, fileReadInputSchema).reasons,
    ['maxLines_above_maximum', 'missing_path', 'startLine_wrong_type']);
  assert.deepEqual(diagnoseFileReadArguments({ path: '../outside' }, fileReadInputSchema).reasons, ['path_invalid']);
  assert.deepEqual(diagnoseFileReadArguments(null, fileReadInputSchema).reasons, ['arguments_not_object']);
  assert.deepEqual(diagnoseFileReadArguments({ path: 'src/file.ts', startLine: 2, maxLines: 10 }, fileReadInputSchema).reasons, []);
});

test('counts stale historical results separately for every captured model turn', () => {
  const turns = summarizeStaleResultsByTurn([
    { previousToolResults: [] },
    { previousToolResults: [{ ok: true, output: { status: 'stale' } }, { ok: true, output: { status: 'ok' } }] },
    { previousToolResults: [{ ok: false, error: { code: 'R1_TOOL_INPUT_INVALID' } }, { ok: true, output: { status: 'stale' } }, { ok: true, output: { status: 'stale' } }] }
  ]);

  assert.deepEqual(turns, [
    { turn: 1, previousToolResultCount: 0, staleResultCount: 0 },
    { turn: 2, previousToolResultCount: 2, staleResultCount: 1 },
    { turn: 3, previousToolResultCount: 3, staleResultCount: 2 }
  ]);
});
