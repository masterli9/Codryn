import { expect, it } from 'vitest';
import { assessProjectChecks } from '../src/verification/project-check-policy.js';
import type { VerificationRecord } from '@codryn/shared';

const ts = 'src/app.ts', other = 'notes.md', config = 'tsconfig.json';
const inputs = { [ts]: 'a'.repeat(64), [config]: 'b'.repeat(64), 'demo.test.mjs': 'c'.repeat(64) };
const record = (kind: VerificationRecord['kind'], result: VerificationRecord['result'] = 'passed') => ({
  record: { kind, result, stale: false } as VerificationRecord, profileId: 'r4-ts-v1', coveredPaths: [ts], inputHashes: inputs
});
const records = [record('test'), record('typecheck')];
const input = { records, changedPaths: [ts], includedFiles: [ts], snapshot: { complete: true, revision: 4, fingerprint: 'f', gitIdentity: null }, currentInputHashes: inputs };

it('requires both passing current checks and all changed paths', () => {
  expect(assessProjectChecks(input).status).toBe('verified');
  expect(assessProjectChecks({ ...input, records: [record('test')] })).toMatchObject({ status: 'partially_verified', missingChecks: ['typecheck'] });
  expect(assessProjectChecks({ ...input, changedPaths: [ts, other] })).toMatchObject({ status: 'partially_verified', uncoveredPaths: [other] });
  expect(assessProjectChecks({ ...input, changedPaths: [] }).status).toBe('unverified');
});

it('retains verification after an unrelated edit but refuses changed, absent or incompletely observed inputs', () => {
  expect(assessProjectChecks({ ...input, currentInputHashes: { ...inputs, [other]: 'edited' } }).status).toBe('verified');
  expect(assessProjectChecks({ ...input, currentInputHashes: { ...inputs, [config]: 'edited' } }).status).toBe('stale');
  expect(assessProjectChecks({ ...input, currentInputHashes: { [ts]: inputs[ts] } }).status).toBe('stale');
  expect(assessProjectChecks({ ...input, snapshot: { ...input.snapshot, complete: false } }).status).toBe('stale');
});

it('gives the latest failure effect until rerunning the same check', () => {
  expect(assessProjectChecks({ ...input, records: [record('test', 'failed'), ...records] }).status).toBe('partially_verified');
  expect(assessProjectChecks({ ...input, records: [...records, record('test', 'failed')] }).status).toBe('verified');
});
