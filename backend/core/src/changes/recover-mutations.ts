import type { FileHashReader, MutationJournal } from './ports.js';

export type RecoveryState = 'not_applied' | 'applied' | 'conflicted';

export function classifyRecovery(
  beforeHash: string,
  afterHash: string,
  actualHash: string | null
): RecoveryState {
  if (actualHash === beforeHash) return 'not_applied';
  if (actualHash === afterHash) return 'applied';
  return 'conflicted';
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('The operation was aborted', 'AbortError');
}

export class RecoverMutations {
  constructor(
    private readonly dependencies: {
      journal: MutationJournal;
      files: FileHashReader;
    }
  ) {}

  async execute(projectId: string, signal: AbortSignal): Promise<void> {
    const pending = await this.dependencies.journal.pending(projectId);
    for (const intent of pending) {
      throwIfAborted(signal);
      let actualHash: string | null;
      try {
        actualHash = await this.dependencies.files.readHash(intent.entry.path, signal);
      } catch {
        // A permission error or an unstable target is not evidence for a resolution.
        continue;
      }
      const state = classifyRecovery(
        intent.entry.beforeHash,
        intent.entry.afterHash,
        actualHash
      );
      if (state === 'applied') {
        await this.dependencies.journal.confirm(intent.operationId);
      } else {
        await this.dependencies.journal.resolve(intent.operationId, state);
      }
    }
  }
}
