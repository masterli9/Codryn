import type { CommandSpec } from '@codryn/shared';
import { VerifyCommand, type ChangeActor, type CommandExecutor, type CommandResult, type VerificationStore, type WorkspaceObserver, type WorkspaceSnapshot, type WorkspaceStore, type Clock, type IdGenerator } from '@codryn/core';

export interface VerifyingCommandExecutorDependencies {
  readonly runner: { run(spec: CommandSpec, signal: AbortSignal): Promise<CommandResult> };
  readonly observer: WorkspaceObserver;
  readonly workspaces: WorkspaceStore;
  readonly verifications: VerificationStore;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly isRelevant?: (command: CommandSpec, snapshot: WorkspaceSnapshot) => boolean | Promise<boolean>;
  readonly onResult?: (result: CommandResult) => Promise<void>;
}

export class VerifyingCommandExecutor implements CommandExecutor {
  private readonly verification: VerifyCommand;

  constructor(private readonly dependencies: VerifyingCommandExecutorDependencies) {
    this.verification = new VerifyCommand({ ...dependencies, store: dependencies.verifications });
  }

  async run(spec: CommandSpec, signal: AbortSignal, context?: ChangeActor): Promise<CommandResult> {
    if (context === undefined) return this.dependencies.runner.run(spec, signal);
    return (await this.verification.executeWithResult(spec, context, signal)).process;
  }
}
