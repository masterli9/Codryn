import type { FakeScenario } from '@codryn/infrastructure';
import type { ModelRequest, Uuid } from '@codryn/shared';

const firstCall = '00000000-0000-4000-8000-000000000001' as Uuid;
const secondCall = '00000000-0000-4000-8000-000000000002' as Uuid;
const finalText = 'Funkce formatGreeting je definovaná v src/greeting.ts a používá se v src/index.ts.';

function assertContext(request: ModelRequest): void {
  if (request.context.length !== 1 || request.context[0]?.path !== 'README.md') throw new Error('scenario');
}

export function readSearchSummaryScenario(): FakeScenario {
  return {
    id: 'read-search-summary',
    steps: [
      { assertRequest: assertContext, events: [{ type: 'tool_call', call: { callId: firstCall, toolId: 'text.search', toolVersion: 1, arguments: { query: 'formatGreeting', path: 'src' } } }, { type: 'completed' }] },
      { assertRequest(request) { const output = request.previousToolResults[0]; if (!output?.ok || !Array.isArray((output.output as { matches?: unknown }).matches) || ((output.output as { matches: unknown[] }).matches).length !== 3) throw new Error('scenario'); }, events: [{ type: 'tool_call', call: { callId: secondCall, toolId: 'file.read', toolVersion: 1, arguments: { path: 'src/greeting.ts' } } }, { type: 'completed' }] },
      { assertRequest(request) { if (request.previousToolResults.length !== 2) throw new Error('scenario'); }, events: [{ type: 'text_delta', text: finalText }, { type: 'completed' }] }
    ]
  };
}

export { finalText };
