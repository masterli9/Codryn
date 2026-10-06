import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateTrialCostUsd,
  readProviderPricing,
  selectProvider,
} from './r2-provider-eval-selection.mjs';

const trialPlan = [
  ['git', 'simple'],
  ['non-git', 'simple'],
  ['git', 'stale-hash'],
  ['non-git', 'stale-hash'],
  ['git', 'test-failure'],
  ['non-git', 'test-failure'],
];

function makeCandidate(provider, { successful = true, unknownCostAt = -1 } = {}) {
  const pricing = provider === 'openai'
    ? { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.2, source: 'https://openai.example/pricing' }
    : { inputUsdPerMillion: 0.3, outputUsdPerMillion: 0.4, source: 'https://gemini.example/pricing' };

  return {
    provider,
    model: `${provider}-model`,
    status: 'complete',
    pricing,
    trials: trialPlan.map(([mode, variant], index) => ({
      mode,
      variant,
      successful,
      durationMs: 100 + index,
      usage: index === unknownCostAt ? null : { inputTokens: 1_000, outputTokens: 500 },
      costUsd: index === unknownCostAt ? null : 0.0002,
    })),
  };
}

const comparablePair = (overrides = {}) => [
  makeCandidate('openai', overrides.openai),
  makeCandidate('gemini', overrides.gemini),
];

test('keeps selection pending when either provider has an incomplete six-trial sample', () => {
  const candidates = comparablePair();
  candidates[1].trials.pop();

  assert.equal(selectProvider(candidates).status, 'pending');
});

test('keeps selection pending when every trial failed for both providers', () => {
  const candidates = comparablePair({
    openai: { successful: false },
    gemini: { successful: false },
  });

  assert.equal(selectProvider(candidates).status, 'pending');
});

test('keeps selection pending when one provider has no successful trial', () => {
  const candidates = comparablePair({ openai: { successful: false } });

  assert.equal(selectProvider(candidates).status, 'pending');
});

test('keeps selection pending when any trial has unknown usage or cost', () => {
  const candidates = comparablePair({ gemini: { unknownCostAt: 2 } });

  assert.equal(selectProvider(candidates).status, 'pending');
});

test('keeps selection pending when candidates tie on every ranking metric', () => {
  const selection = selectProvider(comparablePair());

  assert.equal(selection.status, 'pending');
});

test('selects the candidate with more successful trials when the samples are otherwise comparable', () => {
  const candidates = comparablePair();
  candidates[0].trials[0].successful = false;
  const selection = selectProvider(candidates);

  assert.equal(selection.status, 'selected');
  assert.equal(selection.provider, 'gemini');
});

test('reads and calculates each provider pricing profile independently', () => {
  const args = [
    '--openai-input-usd-per-million', '0.1',
    '--openai-output-usd-per-million', '0.2',
    '--openai-pricing-source', 'https://openai.example/pricing',
    '--gemini-input-usd-per-million', '0.3',
    '--gemini-output-usd-per-million', '0.4',
    '--gemini-pricing-source', 'https://gemini.example/pricing',
  ];
  const openai = readProviderPricing('openai', args);
  const gemini = readProviderPricing('gemini', args);

  assert.deepEqual(openai, {
    inputUsdPerMillion: 0.1,
    outputUsdPerMillion: 0.2,
    source: 'https://openai.example/pricing',
  });
  assert.deepEqual(gemini, {
    inputUsdPerMillion: 0.3,
    outputUsdPerMillion: 0.4,
    source: 'https://gemini.example/pricing',
  });
  const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
  assert.equal(calculateTrialCostUsd(usage, openai), 0.3);
  assert.equal(calculateTrialCostUsd(usage, gemini), 0.7);
});

test('removes credentials, query and fragment from the pricing source URL', () => {
  const pricing = readProviderPricing('openai', [
    '--openai-input-usd-per-million', '0.1',
    '--openai-output-usd-per-million', '0.2',
    '--openai-pricing-source',
    'https://eval-user:fixture-password@openai.example/pricing?token=fixture-token&region=eu#fixture-fragment',
  ]);

  assert.equal(pricing.source, 'https://openai.example/pricing');
});
