import type { VerificationRecord } from '@codryn/shared';
import type { WorkspaceSnapshot } from '../workspace/ports.js';

export interface VerificationStore {
  append(record: VerificationRecord, coverage?: VerificationCoverage): Promise<void>;
  current(runId: string, snapshot: WorkspaceSnapshot): Promise<VerificationRecord | null>;
  list?(runId: string, snapshot: WorkspaceSnapshot, currentInputs?: Readonly<Record<string, string>>): readonly ProfiledVerificationRecord[];
}

export interface VerificationCoverage {
  readonly profileId: string;
  readonly coveredPaths: readonly string[];
  readonly inputHashes?: Readonly<Record<string, string>>;
  readonly toolPaths?: Readonly<Record<string, string>>;
}

export interface ProfiledVerificationRecord extends VerificationCoverage {
  readonly record: VerificationRecord;
}
