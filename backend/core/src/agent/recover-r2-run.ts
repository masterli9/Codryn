import type { Uuid } from '@codryn/shared';
import type { RecoverMutations } from '../changes/recover-mutations.js';

export interface RecoverR2RunDependencies {
  readonly mutations: Pick<RecoverMutations, 'execute'>;
}

/**
 * Recovery is deliberately model-free. It only classifies durable file intents
 * against the current bytes and never resumes a conversation or replays a tool.
 */
export class RecoverR2Run {
  constructor(private readonly dependencies: RecoverR2RunDependencies) {}

  async execute(projectId: Uuid, signal: AbortSignal): Promise<void> {
    await this.dependencies.mutations.execute(projectId, signal);
  }
}
