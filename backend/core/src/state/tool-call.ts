import { transition, type TransitionResult } from './transition.js';

export const toolCallGraph = {
  received: ['schema_validated', 'failed'],
  schema_validated: ['permission_decided', 'waiting_for_approval', 'failed'],
  waiting_for_approval: ['permission_decided', 'denied', 'cancelled', 'failed'],
  permission_decided: ['queued', 'denied'],
  queued: ['running', 'cancelled'],
  running: ['succeeded', 'failed', 'timed_out', 'cancelled'],
  succeeded: [],
  failed: [],
  denied: [],
  timed_out: [],
  cancelled: []
} as const;

export type ToolCallState = keyof typeof toolCallGraph;

export function transitionToolCall(from: ToolCallState, to: ToolCallState): TransitionResult<ToolCallState> {
  return transition(toolCallGraph, from, to);
}
