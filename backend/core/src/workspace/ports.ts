import type { WorkspaceChangeSource } from '@codryn/shared';

export interface WorkspaceObservation {
  fingerprint: string;
  gitIdentity: string | null;
  complete: boolean;
  watcherGeneration?: string;
  /** Files actually hashed by this observation; absent on persisted-only snapshots. */
  observedPaths?: readonly string[];
  /** Per-file hashes from this same complete observation. */
  inputHashes?: Readonly<Record<string, string>>;
}

export interface WorkspaceSnapshot extends WorkspaceObservation {
  revision: number;
  observedAt?: string | null;
  changeSource?: WorkspaceChangeSource;
}

export interface WorkspaceObserver {
  inspect(signal: AbortSignal): Promise<WorkspaceObservation>;
}

export interface WorkspaceStore {
  observe(projectId: string, observation: WorkspaceObservation): Promise<WorkspaceSnapshot>;
  current(projectId: string): Promise<WorkspaceSnapshot>;
  advance?(projectId: string, source: { changeSource: 'patch' | 'revert' | 'git'; mutationId: string }, expectedRevision?: number, observation?: WorkspaceObservation): Promise<WorkspaceSnapshot>;
}

export interface Lease {
  key: string;
  owner: string;
  fence: number;
  expiresAt: number;
}

export interface LeaseStore {
  acquire(key: string, owner: string, now: number): Promise<Lease | null>;
  renew(lease: Lease, now: number): Promise<Lease | null>;
  release(lease: Lease): Promise<boolean>;
  markEffect(lease: Lease, active: boolean): Promise<boolean>;
}
