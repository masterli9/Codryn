import { describe, expect, it } from 'vitest';
import { appendAssistantTurn, appendToolTurn, toolResultsFromHistory } from '../src/agent/model-history.js';

const call = { callId: '81111111-1111-4111-8111-111111111111', toolId: 'file.read', toolVersion: 1, arguments: { path: 'README.md' } } as const;
const result = { ok: true as const, callId: call.callId, output: { content: 'ok' } };

describe('R2 model history', () => {
  it('keeps assistant calls and their following tool result in order', () => {
    const history = appendAssistantTurn([], 'Čtu soubor.', [call]);
    const next = appendToolTurn(history, result);
    expect(next).toEqual([{ kind: 'assistant', text: 'Čtu soubor.', calls: [call] }, { kind: 'tool', result }]);
    expect(toolResultsFromHistory(next)).toEqual([result]);
  });
});
