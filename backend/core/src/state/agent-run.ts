import { transition, type TransitionResult } from './transition.js';

export const agentRunGraph = {
  idle: ['preparing_context'],
  preparing_context: ['waiting_for_model', 'cancelled', 'failed'],
  waiting_for_model: ['waiting_for_user_input', 'executing_tool', 'waiting_for_approval', 'verifying', 'completed', 'cancelled', 'failed'],
  waiting_for_user_input: ['preparing_context', 'cancelled', 'failed'],
  executing_tool: ['waiting_for_model', 'verifying', 'cancelled', 'failed'],
  waiting_for_approval: ['executing_tool', 'waiting_for_model', 'cancelled', 'failed'],
  verifying: ['waiting_for_model', 'completed', 'cancelled', 'failed'],
  completed: [],
  cancelled: [],
  failed: []
} as const;

export type AgentRunState = keyof typeof agentRunGraph;

export function transitionAgentRun(from: AgentRunState, to: AgentRunState): TransitionResult<AgentRunState> {
  return transition(agentRunGraph, from, to);
}
