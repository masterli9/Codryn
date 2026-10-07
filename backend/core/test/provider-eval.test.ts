import { describe, expect, it } from 'vitest';
import { canPublishLiveGate, calculateUsageCost, reserveRequestCost, summarizeTrials } from '../src/agent/provider-eval.js';

describe('provider evaluation', () => {
  it('does not pass a live gate for an empty or incomplete series', () => {
    expect(summarizeTrials([])).toEqual({ attempts: 0, successes: 0, knownCostUsd: 0, unknownCostTrials: 0, liveGatePassed: false });
    expect(summarizeTrials([{
      id: 'trial-1', provider: 'offline', model: 'fixture', successful: true, failureOwner: null,
      validCalls: 1, invalidCalls: 0, repairedAfterError: false, durationMs: 1, costUsd: null
    }])).toMatchObject({ attempts: 1, successes: 1, unknownCostTrials: 1, liveGatePassed: false });
  });

  it('counts known cost without turning unknown usage into zero trials', () => {
    const trials = Array.from({ length: 5 }, (_, index) => ({
      id: `trial-${index}`, provider: 'fixture', model: 'fixture', successful: index < 4, failureOwner: index < 4 ? null : 'adapter' as const,
      validCalls: 1, invalidCalls: 0, repairedAfterError: false, durationMs: 5, costUsd: index === 4 ? null : 0.01
    }));
    expect(summarizeTrials(trials)).toEqual({ attempts: 5, successes: 4, knownCostUsd: 0.04, unknownCostTrials: 1, liveGatePassed: true });
  });

  it('reserves a conservative request budget and rejects missing pricing', () => {
    const pricing = { inputUsdPerMillion: 1, outputUsdPerMillion: 2, maxOutputTokens: 4096 };
    expect(reserveRequestCost(1_000, pricing)).toBe(0.009192);
    expect(reserveRequestCost(1_000, { ...pricing, inputUsdPerMillion: Number.NaN })).toBeNull();
    expect(canPublishLiveGate({ attempts: 5, successes: 4, knownCostUsd: 0.04, unknownCostTrials: 0, liveGatePassed: true }, 0.05)).toBe(true);
    expect(canPublishLiveGate({ attempts: 5, successes: 4, knownCostUsd: 0.04, unknownCostTrials: 1, liveGatePassed: true }, 0.05)).toBe(false);
    expect(canPublishLiveGate({ attempts: 5, successes: 4, knownCostUsd: 0.06, unknownCostTrials: 0, liveGatePassed: true }, 0.05)).toBe(false);
  });

  it('calculates usage once using total output tokens, including provider reasoning', () => {
    expect(calculateUsageCost({ inputTokens: 100, outputTokens: 50 }, { inputUsdPerMillion: 1, outputUsdPerMillion: 2, maxOutputTokens: 4096 })).toBe(0.0002);
    expect(calculateUsageCost(null, { inputUsdPerMillion: 1, outputUsdPerMillion: 2, maxOutputTokens: 4096 })).toBeNull();
  });
});
