import { describe, expect, it } from 'vitest';
import { modelToolCallSchema, toolResultSchema } from '../src/index.js';

const callId = '33333333-3333-4333-8333-333333333333';

describe('R1 tool contracts', () => {
  it('accepts a strict JSON model tool call', () => {
    const call = {
      callId,
      toolId: 'text.search',
      toolVersion: 1,
      arguments: { query: 'summary', paths: ['README.md'] }
    };

    expect(modelToolCallSchema.parse(call)).toEqual(call);
  });

  it('rejects non-JSON model tool arguments and unknown fields', () => {
    expect(() => modelToolCallSchema.parse({
      callId,
      toolId: 'text.search',
      toolVersion: 1,
      arguments: { sequence: 1n }
    })).toThrow();
    expect(() => modelToolCallSchema.parse({
      callId,
      toolId: 'text.search',
      toolVersion: 1,
      arguments: {},
      unexpected: true
    })).toThrow();
  });

  it('accepts normalized successful and failed tool results', () => {
    expect(toolResultSchema.parse({ ok: true, callId, output: { matches: 2 } })).toEqual({
      ok: true,
      callId,
      output: { matches: 2 }
    });
    expect(toolResultSchema.parse({
      ok: false,
      callId,
      error: { code: 'R1_TOOL_INPUT_INVALID', message: 'Neplatný vstup nástroje.' }
    })).toEqual({
      ok: false,
      callId,
      error: { code: 'R1_TOOL_INPUT_INVALID', message: 'Neplatný vstup nástroje.' }
    });
  });

  it('rejects non-JSON tool result output and malformed failure data', () => {
    expect(() => toolResultSchema.parse({ ok: true, callId, output: { value: Number.POSITIVE_INFINITY } })).toThrow();
    expect(() => toolResultSchema.parse({ ok: false, callId, error: { code: '', message: '' } })).toThrow();
  });
});
