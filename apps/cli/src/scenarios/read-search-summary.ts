import type { FakeScenario } from '@codryn/infrastructure';
import type { ModelRequest, Uuid } from '@codryn/shared';

const firstCall = '00000000-0000-4000-8000-000000000001' as Uuid;
const secondCall = '00000000-0000-4000-8000-000000000002' as Uuid;
const finalText = 'Funkce formatGreeting je definovaná v src/greeting.ts a používá se v src/index.ts.';
const greetingContent = 'export function formatGreeting(name: string): string {\n  return `Ahoj, ${name}!`;\n}\n';
const greetingHash = '03eff74d58afc51d8466df100644f491bbf6716854b785848c0650053e4774c2';
const matches = [
  { path: 'src/greeting.ts', line: 1, column: 17, preview: 'export function formatGreeting(name: string): string {' },
  { path: 'src/index.ts', line: 1, column: 10, preview: "import { formatGreeting as greeting } from './greeting.js';" },
  { path: 'src/preview.ts', line: 1, column: 10, preview: "import { formatGreeting as greeting } from './greeting.js';" }
];

function assertContext(request: ModelRequest): void {
  if (request.context.length !== 1 || request.context[0]?.path !== 'README.md' || request.context[0]?.content !== '# R1 fixture\n\nMalý TypeScriptový projekt pro ověření čtení zdrojů a hledání symbolů.\n') throw new Error('scenario');
}

function output(request: ModelRequest, index: number): Record<string, unknown> {
  const result = request.previousToolResults[index];
  if (!result?.ok || typeof result.output !== 'object' || result.output === null || Array.isArray(result.output)) throw new Error('scenario');
  return result.output as Record<string, unknown>;
}

export function readSearchSummaryScenario(): FakeScenario {
  return {
    id: 'read-search-summary',
    steps: [
      { assertRequest: assertContext, events: [{ type: 'tool_call', call: { callId: firstCall, toolId: 'text.search', toolVersion: 1, arguments: { query: 'formatGreeting', path: 'src' } } }, { type: 'completed' }] },
      { assertRequest(request) { const search = output(request, 0); if (JSON.stringify(search.matches) !== JSON.stringify(matches) || search.truncated !== false) throw new Error('scenario'); }, events: [{ type: 'tool_call', call: { callId: secondCall, toolId: 'file.read', toolVersion: 1, arguments: { path: 'src/greeting.ts' } } }, { type: 'completed' }] },
      { assertRequest(request) { const read = output(request, 1); if (request.previousToolResults.length !== 2 || read.path !== 'src/greeting.ts' || read.content !== greetingContent || read.contentHash !== greetingHash || read.startLine !== 1 || read.endLine !== 4 || read.totalLines !== 4 || read.truncated !== false) throw new Error('scenario'); }, events: [{ type: 'text_delta', text: finalText }, { type: 'completed' }] }
    ]
  };
}

export { finalText };
