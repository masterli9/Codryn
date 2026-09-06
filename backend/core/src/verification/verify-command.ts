import { verificationRecordSchema, type VerificationRecord, type CommandSpec } from '@codryn/shared';
import type { ChangeActor } from '../changes/ports.js';
import type { CommandResult, CommandRunner } from '../process/ports.js';
import type { Clock, IdGenerator } from '../diagnostics/ports.js';
import type { WorkspaceObserver, WorkspaceSnapshot, WorkspaceStore } from '../workspace/ports.js';
import type { VerificationStore } from './verification-store.js';

export interface VerificationAssessment {
  readonly exitCode: number | null;
  readonly treeStopped: boolean;
  readonly truncated: boolean;
  readonly processStatus: CommandResult['status'];
  readonly before: WorkspaceSnapshot;
  readonly after: WorkspaceSnapshot;
  readonly watcherChanged: boolean;
  readonly relevant: boolean;
}

export function assessVerification(input: VerificationAssessment): VerificationRecord['result'] {
  if (!input.relevant || !input.treeStopped || input.truncated
    || !input.before.complete || !input.after.complete || input.watcherChanged
    || input.before.revision !== input.after.revision
    || input.before.fingerprint !== input.after.fingerprint) return 'incomplete';
  if (input.processStatus === 'succeeded' && input.exitCode === 0) return 'passed';
  if (input.processStatus === 'failed' && input.exitCode !== null) return 'failed';
  return 'incomplete';
}

function reasonFor(result: VerificationRecord['result'], process: CommandResult, before: WorkspaceSnapshot, after: WorkspaceSnapshot): string {
  if (result === 'passed') return 'Process succeeded and the complete project snapshot stayed unchanged.';
  if (result === 'failed') return 'The test process exited with a non-zero exit code.';
  if (!process.treeStopped) return 'The complete process tree was not proven stopped.';
  if (process.truncated) return 'Process output exceeded the configured limit.';
  if (!before.complete || !after.complete) return 'Workspace observation was incomplete.';
  if (before.revision !== after.revision || before.fingerprint !== after.fingerprint) return 'The project changed during or after the test.';
  return 'Verification conditions were not all satisfied.';
}

export interface VerifyCommandDependencies {
  readonly runner: CommandRunner;
  readonly observer: WorkspaceObserver;
  readonly workspaces: WorkspaceStore;
  readonly store: VerificationStore;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export class VerifyCommand {
  constructor(private readonly dependencies: VerifyCommandDependencies) {}

  async execute(command: CommandSpec, actor: ChangeActor, signal: AbortSignal): Promise<VerificationRecord> {
    const before = await this.snapshot(actor.projectId, signal);
    const process = await this.dependencies.runner.run(command, signal);
    const after = await this.snapshot(actor.projectId, signal);
    const result = assessVerification({
      exitCode: process.exitCode,
      treeStopped: process.treeStopped,
      truncated: process.truncated,
      processStatus: process.status,
      before,
      after,
      watcherChanged: false,
      relevant: true
    });
    const record = verificationRecordSchema.parse({
      id: this.dependencies.ids.next(),
      runId: actor.runId,
      callId: actor.callId,
      projectId: actor.projectId,
      kind: 'test',
      command,
      scope: 'project',
      revision: after.revision,
      fingerprint: after.fingerprint,
      occurredAt: this.dependencies.clock.now(),
      result,
      stale: false,
      reason: reasonFor(result, process, before, after),
      exitCode: process.exitCode
    });
    await this.dependencies.store.append(record);
    return record;
  }

  private async snapshot(projectId: string, signal: AbortSignal): Promise<WorkspaceSnapshot> {
    return this.dependencies.workspaces.observe(projectId, await this.dependencies.observer.inspect(signal));
  }
}
