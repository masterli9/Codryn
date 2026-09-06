import { describe, expect, it } from 'vitest';
import { summarizeTrials } from '../src/agent/provider-eval.js';

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
});
