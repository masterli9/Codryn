import { transition, type TransitionResult } from './transition.js';

export const gitOperationGraph = {
  proposed: ['preflight', 'cancelled'],
  preflight: ['waiting_for_approval', 'executing', 'stale', 'failed', 'cancelled'],
  waiting_for_approval: ['preflight', 'cancelled'],
  executing: ['succeeded', 'failed', 'stale'],
  succeeded: [],
  failed: [],
  stale: [],
  cancelled: []
} as const;

export type GitOperationState = keyof typeof gitOperationGraph;

export function transitionGitOperation(
  from: GitOperationState,
  to: GitOperationState
): TransitionResult<GitOperationState> {
  return transition(gitOperationGraph, from, to);
}
