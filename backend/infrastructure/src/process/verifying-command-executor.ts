import { verificationRecordSchema, type CommandSpec, type VerificationRecord } from '@codryn/shared';
import type { ChangeActor, CommandExecutor, CommandResult, VerificationStore, WorkspaceObserver, WorkspaceSnapshot, WorkspaceStore } from '@codryn/core';
import { assessVerification } from '@codryn/core';
import type { Clock, IdGenerator } from '@codryn/core';

export interface VerifyingCommandExecutorDependencies {
  readonly runner: { run(spec: CommandSpec, signal: AbortSignal): Promise<CommandResult> };
  readonly observer: WorkspaceObserver;
  readonly workspaces: WorkspaceStore;
  readonly verifications: VerificationStore;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

function processReason(result: VerificationRecord['result'], process: CommandResult): string {
  if (result === 'passed') return 'Process succeeded and the complete project snapshot stayed unchanged.';
  if (result === 'failed') return 'The test process exited with a non-zero exit code.';
  if (!process.treeStopped) return 'The complete process tree was not proven stopped.';
  if (process.truncated) return 'Process output exceeded the configured limit.';
  return 'Workspace verification was incomplete.';
}

export class VerifyingCommandExecutor implements CommandExecutor {
  constructor(private readonly dependencies: VerifyingCommandExecutorDependencies) {}

  async run(spec: CommandSpec, signal: AbortSignal, context?: ChangeActor): Promise<CommandResult> {
    if (context === undefined) return this.dependencies.runner.run(spec, signal);
    const before = await this.snapshot(context.projectId, signal);
    const process = await this.dependencies.runner.run(spec, signal);
    const after = await this.snapshot(context.projectId, signal);
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
      runId: context.runId,
      callId: context.callId,
      projectId: context.projectId,
      kind: 'test',
      command: spec,
      scope: 'project',
      revision: after.revision,
      fingerprint: after.fingerprint,
      occurredAt: this.dependencies.clock.now(),
      result,
      stale: false,
      reason: processReason(result, process),
      exitCode: process.exitCode
    });
    await this.dependencies.verifications.append(record);
    return process;
  }

  private async snapshot(projectId: string, signal: AbortSignal): Promise<WorkspaceSnapshot> {
    return this.dependencies.workspaces.observe(projectId, await this.dependencies.observer.inspect(signal));
  }
}
