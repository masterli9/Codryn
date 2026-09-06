import type { CommandSpec } from '@codryn/shared';

export interface CommandResult {
  readonly status: 'succeeded' | 'failed' | 'timed_out' | 'cancelled' | 'termination_failed';
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly truncated: boolean;
  readonly durationMs: number;
  readonly treeStopped: boolean;
}

export interface CommandRunner {
  run(spec: CommandSpec, signal: AbortSignal): Promise<CommandResult>;
}
