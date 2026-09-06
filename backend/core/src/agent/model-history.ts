import type { ModelToolCall, ModelTurn, ToolResult } from '@codryn/shared';

export function appendAssistantTurn(history: readonly ModelTurn[], text: string, calls: readonly ModelToolCall[]): ModelTurn[] {
  return [...history, { kind: 'assistant', text, calls: [...calls] }];
}

export function appendToolTurn(history: readonly ModelTurn[], result: ToolResult): ModelTurn[] {
  return [...history, { kind: 'tool', result }];
}

export function toolResultsFromHistory(history: readonly ModelTurn[]): ToolResult[] {
  return history.flatMap((turn) => turn.kind === 'tool' ? [turn.result] : []);
}
