export interface WorkspaceObservation {
  fingerprint: string;
  gitIdentity: string | null;
  complete: boolean;
}

export interface WorkspaceSnapshot extends WorkspaceObservation {
  revision: number;
}

export interface WorkspaceObserver {
  inspect(signal: AbortSignal): Promise<WorkspaceObservation>;
}

export interface WorkspaceStore {
  observe(projectId: string, observation: WorkspaceObservation): Promise<WorkspaceSnapshot>;
  current(projectId: string): Promise<WorkspaceSnapshot>;
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
