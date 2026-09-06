import type { PermissionView, Uuid } from '@codryn/shared';
import type { RecoverMutations } from '../changes/recover-mutations.js';
import type { PermissionService } from '../permissions/permission-service.js';

export interface RecoverR2RunDependencies {
  readonly mutations: Pick<RecoverMutations, 'execute'>;
  readonly permissions?: Pick<PermissionService, 'listPending' | 'expireAllowedUnclaimed'>;
  readonly toolCalls?: { recoverInFlight(projectId: Uuid): Promise<number> };
}

export interface R2RecoveryResult {
  readonly pendingPermissions: readonly PermissionView[];
  readonly expiredPermissionIds: readonly string[];
  readonly recoveredToolCalls: number;
}

/**
 * Recovery is deliberately model-free. It only classifies durable file intents
 * against the current bytes and never resumes a conversation or replays a tool.
 */
export class RecoverR2Run {
  constructor(private readonly dependencies: RecoverR2RunDependencies) {}

  async execute(projectId: Uuid, signal: AbortSignal): Promise<R2RecoveryResult> {
    const expiredPermissionIds = this.dependencies.permissions === undefined
      ? []
      : [...await this.dependencies.permissions.expireAllowedUnclaimed(projectId)];
    const pendingPermissions = this.dependencies.permissions === undefined
      ? []
      : [...await this.dependencies.permissions.listPending(projectId)];
    const recoveredToolCalls = this.dependencies.toolCalls === undefined
      ? 0
      : await this.dependencies.toolCalls.recoverInFlight(projectId);
    await this.dependencies.mutations.execute(projectId, signal);
    return { pendingPermissions, expiredPermissionIds, recoveredToolCalls };
  }
}
