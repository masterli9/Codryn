export interface Trial {
  readonly id: string;
  readonly provider: string;
  readonly model: string;
  readonly successful: boolean;
  readonly failureOwner: 'model' | 'adapter' | 'harness' | 'api' | null;
  readonly validCalls: number;
  readonly invalidCalls: number;
  readonly repairedAfterError: boolean;
  readonly durationMs: number;
  readonly costUsd: number | null;
}

export interface EvalSummary {
  readonly attempts: number;
  readonly successes: number;
  readonly knownCostUsd: number;
  readonly unknownCostTrials: number;
  readonly liveGatePassed: boolean;
}

export interface ProviderPricing {
  readonly inputUsdPerMillion: number;
  readonly outputUsdPerMillion: number;
  readonly maxOutputTokens: number;
}

export interface UsageTotals {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

function validPricing(pricing: ProviderPricing): boolean {
  return Number.isFinite(pricing.inputUsdPerMillion)
    && pricing.inputUsdPerMillion >= 0
    && Number.isFinite(pricing.outputUsdPerMillion)
    && pricing.outputUsdPerMillion >= 0
    && Number.isSafeInteger(pricing.maxOutputTokens)
    && pricing.maxOutputTokens > 0;
}

/** Reserve input plus the configured maximum output before a network request. */
export function reserveRequestCost(inputTokens: number, pricing: ProviderPricing): number | null {
  if (!validPricing(pricing) || !Number.isSafeInteger(inputTokens) || inputTokens < 0) return null;
  return (inputTokens * pricing.inputUsdPerMillion + pricing.maxOutputTokens * pricing.outputUsdPerMillion) / 1_000_000;
}

/** Output usage is already provider-total output, so reasoning is not added twice. */
export function calculateUsageCost(usage: UsageTotals | null, pricing: ProviderPricing): number | null {
  if (usage === null || !validPricing(pricing) || !Number.isSafeInteger(usage.inputTokens) || usage.inputTokens < 0 || !Number.isSafeInteger(usage.outputTokens) || usage.outputTokens < 0) return null;
  return (usage.inputTokens * pricing.inputUsdPerMillion + usage.outputTokens * pricing.outputUsdPerMillion) / 1_000_000;
}

export function canPublishLiveGate(summary: EvalSummary, maxCostUsd: number): boolean {
  return summary.liveGatePassed && summary.unknownCostTrials === 0 && Number.isFinite(maxCostUsd) && maxCostUsd > 0 && summary.knownCostUsd <= maxCostUsd;
}

export function summarizeTrials(trials: readonly Trial[]): EvalSummary {
  return {
    attempts: trials.length,
    successes: trials.filter((trial) => trial.successful).length,
    knownCostUsd: trials.reduce((total, trial) => total + (trial.costUsd ?? 0), 0),
    unknownCostTrials: trials.filter((trial) => trial.costUsd === null).length,
    liveGatePassed: trials.length === 5 && trials.filter((trial) => trial.successful).length >= 4
  };
}
