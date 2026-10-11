import type { CommandSpec } from '@codryn/shared';
import type { ChangeActor } from '../changes/ports.js';

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
  run(spec: CommandSpec, signal: AbortSignal, onOutput?: (output: CommandOutput) => void): Promise<CommandResult>;
}

export interface CommandOutput {
  readonly stream: 'stdout' | 'stderr';
  readonly sequence: number;
  readonly bytes: Uint8Array;
}

export interface CommandOwnership {
  readonly jobName: string;
  readonly worker: { readonly pid: number; readonly creationTime: string };
  readonly target: { readonly pid: number; readonly creationTime: string };
}
export interface OwnedCommandStore {
  recordOwned(actor: ChangeActor, evidence: CommandOwnership): Promise<void>;
  recordResult(actor: ChangeActor, result: CommandResult): Promise<void>;
  pending(projectId?: string): Promise<readonly (CommandOwnership & ChangeActor)[]>;
  markStopped(callId: string): Promise<void>;
}
