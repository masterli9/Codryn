import { transition, type TransitionResult } from './transition.js';

export const permissionRequestGraph = {
  pending: ['approved', 'denied', 'expired', 'cancelled'],
  approved: [],
  denied: [],
  expired: [],
  cancelled: []
} as const;

export type PermissionRequestState = keyof typeof permissionRequestGraph;

export function transitionPermissionRequest(
  from: PermissionRequestState,
  to: PermissionRequestState
): TransitionResult<PermissionRequestState> {
  return transition(permissionRequestGraph, from, to);
}
