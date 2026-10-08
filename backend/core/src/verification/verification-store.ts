import type { VerificationRecord } from '@codryn/shared';
import type { WorkspaceSnapshot } from '../workspace/ports.js';

export interface VerificationStore {
  append(record: VerificationRecord): Promise<void>;
  current(runId: string, snapshot: WorkspaceSnapshot): Promise<VerificationRecord | null>;
}
