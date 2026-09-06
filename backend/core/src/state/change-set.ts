import { transition, type TransitionResult } from './transition.js';

export const changeSetGraph = {
  open: ['sealed', 'recovery_required'],
  sealed: ['reverting', 'conflicted', 'recovery_required'],
  reverting: ['sealed', 'reverted', 'conflicted', 'recovery_required'],
  reverted: [],
  conflicted: [],
  recovery_required: []
} as const;

export type ChangeSetState = keyof typeof changeSetGraph;

export function transitionChangeSet(from: ChangeSetState, to: ChangeSetState): TransitionResult<ChangeSetState> {
  return transition(changeSetGraph, from, to);
}
