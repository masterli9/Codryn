import type { VerificationRecord } from '@codryn/shared';
import type { WorkspaceSnapshot } from '../workspace/ports.js';

export interface VerificationStore {
  append(record: VerificationRecord, coverage?: { readonly profileId: string; readonly coveredPaths: readonly string[] }): Promise<void>;
  current(runId: string, snapshot: WorkspaceSnapshot): Promise<VerificationRecord | null>;
}
