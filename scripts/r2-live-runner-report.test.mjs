import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyFailureOwner,
  createGeminiLiveReportSettings,
} from './r2-live-runner-report.mjs';

test('classifies a captured rate_limit as an API failure before unverified harness status', () => {
  assert.equal(classifyFailureOwner({
    failureCode: 'rate_limit',
    verificationStatus: 'unverified',
  }), 'api');
});

test('keeps invalid tool calls attributed to the adapter', () => {
  assert.equal(classifyFailureOwner({ failureCode: 'invalid_tool_call' }), 'adapter');
});

test('keeps other provider adapter failures attributed to the API', () => {
  assert.equal(classifyFailureOwner({
    failureCode: 'provider_error',
    adapterError: true,
  }), 'api');
});

test('keeps runner failures and unverified results attributed to the harness', () => {
  assert.equal(classifyFailureOwner({ harnessError: true }), 'harness');
  assert.equal(classifyFailureOwner({ failureCode: 'R2_LIVE_REQUEST_LIMIT' }), 'harness');
  assert.equal(classifyFailureOwner({ verificationStatus: 'stale' }), 'harness');
});

test('attributes a verified revert conflict after a harness-injected edit to the harness', () => {
  assert.equal(classifyFailureOwner({
    failureCode: 'result_verified_conflicted',
    verificationStatus: 'verified',
  }), 'model');
  assert.equal(classifyFailureOwner({
    failureCode: 'result_verified_conflicted',
    verificationStatus: 'verified',
    harnessInjectedFailure: true,
  }), 'harness');
});

test('keeps an otherwise unexplained failed trial attributed to the model', () => {
  assert.equal(classifyFailureOwner({ verificationStatus: 'verified' }), 'model');
});

test('includes the retry limit in live Gemini report settings only', () => {
  const requestPacing = { maxRequestsPerMinute: 4, minimumSpacingMs: 15_000 };

  assert.deepEqual(createGeminiLiveReportSettings('gemini', 'live', requestPacing), {
    requestPacing,
    maxRateLimitRetries: 4,
  });
  assert.deepEqual(createGeminiLiveReportSettings('openai', 'live', requestPacing), {});
  assert.deepEqual(createGeminiLiveReportSettings('gemini', 'eval', requestPacing), {});
});
