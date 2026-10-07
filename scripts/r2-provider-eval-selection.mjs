import { URL } from 'node:url';

const trialPlan = [
  ['git', 'simple'],
  ['non-git', 'simple'],
  ['git', 'stale-hash'],
  ['non-git', 'stale-hash'],
  ['git', 'test-failure'],
  ['non-git', 'test-failure'],
];

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
}

function sanitizePricingSource(source) {
  if (typeof source !== 'string' || !/^https:\/\//.test(source)) return undefined;

  try {
    const url = new URL(source);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

export function readProviderPricing(provider, args) {
  if (provider !== 'openai' && provider !== 'gemini') return undefined;

  const prefix = `--${provider}`;
  const inputUsdPerMillion = Number(valueAfter(args, `${prefix}-input-usd-per-million`));
  const outputUsdPerMillion = Number(valueAfter(args, `${prefix}-output-usd-per-million`));
  const source = sanitizePricingSource(valueAfter(args, `${prefix}-pricing-source`));
  if (!Number.isFinite(inputUsdPerMillion) || inputUsdPerMillion <= 0
    || !Number.isFinite(outputUsdPerMillion) || outputUsdPerMillion <= 0
    || typeof source !== 'string') return undefined;

  return { inputUsdPerMillion, outputUsdPerMillion, source };
}

export function calculateTrialCostUsd(usage, pricing) {
  if (usage === null || typeof usage !== 'object'
    || !Number.isSafeInteger(usage.inputTokens) || usage.inputTokens < 0
    || !Number.isSafeInteger(usage.outputTokens) || usage.outputTokens < 0
    || !Number.isFinite(pricing?.inputUsdPerMillion) || pricing.inputUsdPerMillion <= 0
    || !Number.isFinite(pricing?.outputUsdPerMillion) || pricing.outputUsdPerMillion <= 0) return null;

  return (usage.inputTokens * pricing.inputUsdPerMillion
    + usage.outputTokens * pricing.outputUsdPerMillion) / 1_000_000;
}

function hasExpectedTrialSet(trials) {
  if (!Array.isArray(trials) || trials.length !== trialPlan.length) return false;
  const actual = trials.map((trial) => `${trial.mode}:${trial.variant}`);
  const expected = trialPlan.map(([mode, variant]) => `${mode}:${variant}`);
  return new Set(actual).size === trialPlan.length
    && expected.every((key) => actual.includes(key));
}

function hasMeasuredTrial(trial) {
  return trial !== null && typeof trial === 'object'
    && trial.usage !== null && typeof trial.usage === 'object'
    && Number.isSafeInteger(trial.usage.inputTokens) && trial.usage.inputTokens >= 0
    && Number.isSafeInteger(trial.usage.outputTokens) && trial.usage.outputTokens >= 0
    && Number.isFinite(trial.costUsd) && trial.costUsd >= 0
    && Number.isFinite(trial.durationMs) && trial.durationMs >= 0;
}

function isComparableCandidate(candidate) {
  return candidate?.status === 'complete'
    && hasExpectedTrialSet(candidate.trials)
    && candidate.trials.every(hasMeasuredTrial);
}

function compareCandidates(left, right) {
  const leftSuccesses = left.trials.filter((trial) => trial.successful === true).length;
  const rightSuccesses = right.trials.filter((trial) => trial.successful === true).length;
  if (leftSuccesses !== rightSuccesses) return rightSuccesses - leftSuccesses;

  const leftRepairs = left.trials.filter((trial) => trial.repairedAfterError === true).length;
  const rightRepairs = right.trials.filter((trial) => trial.repairedAfterError === true).length;
  if (leftRepairs !== rightRepairs) return rightRepairs - leftRepairs;

  const leftCost = left.trials.reduce((total, trial) => total + trial.costUsd, 0);
  const rightCost = right.trials.reduce((total, trial) => total + trial.costUsd, 0);
  if (leftCost !== rightCost) return leftCost - rightCost;

  const leftLatency = left.trials.reduce((total, trial) => total + trial.durationMs, 0);
  const rightLatency = right.trials.reduce((total, trial) => total + trial.durationMs, 0);
  return leftLatency - rightLatency;
}

export function selectProvider(candidates) {
  if (!Array.isArray(candidates) || candidates.length !== 2
    || !candidates.every(isComparableCandidate)) {
    return {
      status: 'pending',
      reason: 'Selection requires the same complete six-trial sample with measured usage, cost and latency for both candidates.',
    };
  }

  if (candidates.some((candidate) => !candidate.trials.some((trial) => trial.successful === true))) {
    return {
      status: 'pending',
      reason: 'Each candidate must complete at least one trial successfully before the evaluation can select a provider.',
    };
  }

  const ranked = [...candidates].sort(compareCandidates);
  if (compareCandidates(ranked[0], ranked[1]) === 0) {
    return {
      status: 'pending',
      reason: 'Candidates are tied on successful completion, recovery, cost and latency; the evaluation has no evidence to choose between them.',
    };
  }

  const winner = ranked[0];
  return {
    status: 'selected',
    provider: winner.provider,
    model: winner.model,
    rationale: 'Complete equal-size sample ranked by successful completion, recovery after failure, provider-specific cost and latency.',
  };
}
