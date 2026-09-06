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

export function summarizeTrials(trials: readonly Trial[]): EvalSummary {
  return {
    attempts: trials.length,
    successes: trials.filter((trial) => trial.successful).length,
    knownCostUsd: trials.reduce((total, trial) => total + (trial.costUsd ?? 0), 0),
    unknownCostTrials: trials.filter((trial) => trial.costUsd === null).length,
    liveGatePassed: trials.length === 5 && trials.filter((trial) => trial.successful).length >= 4
  };
}
