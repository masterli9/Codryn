import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { URL } from 'node:url';
import { checkDataset, validateResults } from './eval-r4-typescript.mjs';

const dataset = JSON.parse(await readFile(new URL('../docs/evals/r4-ts-queries-v1.json', import.meta.url), 'utf8'));
const fixture = new URL('../tests/support/fixtures/r4-ts-queries/', import.meta.url);

test('rejects a changed fixture hash, a missing case, or a duplicate ID', async () => {
  await assert.doesNotReject(checkDataset(dataset, fixture));
  await assert.rejects(checkDataset({ ...dataset, fixtureFiles: { ...dataset.fixtureFiles, 'tsconfig.json': '0'.repeat(64) } }, fixture));
  await assert.rejects(checkDataset({ ...dataset, cases: dataset.cases.slice(1) }, fixture));
  await assert.rejects(checkDataset({ ...dataset, cases: [dataset.cases[1], ...dataset.cases.slice(1)] }, fixture));
});

test('rejects missing mismatches and selected-only results', () => {
  const results = dataset.cases.map((item, i) => ({ id: item.id, expected: item.expected, observed: i ? item.expected : null, match: i > 0, reason: i ? null : 'different_output' }));
  assert.equal(validateResults(dataset, results), 19);
  assert.throws(() => validateResults(dataset, results.filter(item => item.match)));
  assert.throws(() => validateResults(dataset, [{ ...results[0], reason: null }, ...results.slice(1)]));
});
