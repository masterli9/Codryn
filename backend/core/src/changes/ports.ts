import type { PatchInput } from '@codryn/shared';

export interface ChangeActor {
  projectId: string;
  runId: string;
  callId: string;
}

export type { PatchInput };

export interface ChangeEntry extends ChangeActor {
  id: string;
  setId: string;
  sequence: number;
  path: string;
  beforeHash: string;
  afterHash: string;
  beforeBlob: string;
  afterBlob: string;
  kind: 'patch' | 'revert';
  reversesId: string | null;
}

export type MutationResult =
  | { status: 'applied'; entry: ChangeEntry; revision: number }
  | { status: 'rejected'; code: string }
  | { status: 'recovery_required'; operationId: string };

export interface WriteIntent {
  operationId: string;
  entry: ChangeEntry;
  state: 'prepared' | 'applied' | 'not_applied' | 'conflicted';
}

export interface MutationJournal {
  prepare(intent: WriteIntent): Promise<void>;
  confirm(operationId: string): Promise<number>;
  resolve(operationId: string, state: 'not_applied' | 'conflicted'): Promise<void>;
  pending(projectId: string): Promise<readonly WriteIntent[]>;
  entries(setId: string): Promise<readonly ChangeEntry[]>;
}

export interface BlobStore {
  put(bytes: Uint8Array): Promise<string>;
  get(hash: string): Promise<Uint8Array>;
}

export interface GuardedFile {
  readonly bytes: Uint8Array;
  publish(bytes: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export interface GuardedWriter {
  open(path: string, expectedHash: string, signal: AbortSignal): Promise<GuardedFile>;
}

export interface FileHashReader {
  readHash(path: string, signal: AbortSignal): Promise<string | null>;
}
