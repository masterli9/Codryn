import { transition, type TransitionResult } from './transition.js';

export const toolCallGraph = {
  proposed: ['waiting_for_approval', 'running', 'cancelled'],
  waiting_for_approval: ['running', 'cancelled'],
  running: ['succeeded', 'failed', 'timed_out', 'cancelled'],
  succeeded: [],
  failed: [],
  timed_out: [],
  cancelled: []
} as const;

export type ToolCallState = keyof typeof toolCallGraph;

export function transitionToolCall(from: ToolCallState, to: ToolCallState): TransitionResult<ToolCallState> {
  return transition(toolCallGraph, from, to);
}
