import type {
  CommandSpec,
  PermissionDecisionInput,
  PermissionView
} from '@codryn/shared';

export interface PermissionCallBinding {
  readonly callId: string;
  readonly runId: string;
  readonly projectId: string;
}

export interface PermissionCallLookup {
  findBinding(callId: string): Promise<PermissionCallBinding | null>;
}

export interface PermissionStore {
  create(request: PermissionView): Promise<void>;
  get(id: string): Promise<PermissionView | null>;
  decide(input: PermissionDecisionInput): Promise<'accepted' | 'duplicate' | 'rejected'>;
  claim(id: string, digest: string): Promise<boolean>;
  closePending(id: string, state: 'expired' | 'cancelled'): Promise<boolean>;
  listPending?(projectId: string): Promise<readonly PermissionView[]>;
  expireAllowedUnclaimed?(projectId: string): Promise<readonly string[]>;
}

export interface PermissionRequestSpec {
  readonly callId: string;
  readonly command: CommandSpec;
  readonly reason: string;
  readonly impact: string;
}
