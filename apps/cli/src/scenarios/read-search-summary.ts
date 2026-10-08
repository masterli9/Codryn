import { createHash } from 'node:crypto';
import type { FakeScenario } from '@codryn/infrastructure';
import type { ModelRequest, Uuid } from '@codryn/shared';

const defaultCallIds = Object.freeze({
  first: '00000000-0000-4000-8000-000000000001' as Uuid,
  second: '00000000-0000-4000-8000-000000000002' as Uuid
});
const finalText = 'Funkce formatGreeting je definovaná v src/greeting.ts a používá se v src/index.ts.';
const greetingContent = 'export function formatGreeting(name: string): string {\n  return `Ahoj, ${name}!`;\n}\n';
const matches = [
  { path: 'src/greeting.ts', line: 1, column: 17, preview: 'export function formatGreeting(name: string): string {' },
  { path: 'src/index.ts', line: 1, column: 10, preview: "import { formatGreeting as greeting } from './greeting.js';" },
  { path: 'src/preview.ts', line: 1, column: 10, preview: "import { formatGreeting as greeting } from './greeting.js';" }
];

function assertContext(request: ModelRequest): void {
  const content = request.context[0]?.content.replace(/\r\n/g, '\n');
  if (request.context.length !== 1 || request.context[0]?.path !== 'README.md' || content !== '# R1 fixture\n\nMalý TypeScriptový projekt pro ověření čtení zdrojů a hledání symbolů.\n') throw new Error('scenario');
}

function output(request: ModelRequest, index: number): Record<string, unknown> {
  const result = request.previousToolResults[index];
  if (!result?.ok || typeof result.output !== 'object' || result.output === null || Array.isArray(result.output)) throw new Error('scenario');
  return result.output as Record<string, unknown>;
}

export function readSearchSummaryScenario(callIds: Readonly<{ first: Uuid; second: Uuid }> = defaultCallIds): FakeScenario {
  return {
    id: 'read-search-summary',
    steps: [
      { assertRequest: assertContext, events: [{ type: 'tool_call', call: { callId: callIds.first, toolId: 'text.search', toolVersion: 1, arguments: { query: 'formatGreeting', path: 'src' } } }, { type: 'completed' }] },
      { assertRequest(request) { const search = output(request, 0); if (JSON.stringify(search.matches) !== JSON.stringify(matches) || search.truncated !== false) throw new Error('scenario'); }, events: [{ type: 'tool_call', call: { callId: callIds.second, toolId: 'file.read', toolVersion: 1, arguments: { path: 'src/greeting.ts' } } }, { type: 'completed' }] },
      { assertRequest(request) { const read = output(request, 1); const content = typeof read.content === 'string' ? read.content : ''; const contentHash = createHash('sha256').update(content, 'utf8').digest('hex'); if (request.previousToolResults.length !== 2 || read.path !== 'src/greeting.ts' || content.replace(/\r\n/g, '\n') !== greetingContent || read.contentHash !== contentHash || read.startLine !== 1 || read.endLine !== 4 || read.totalLines !== 4 || read.truncated !== false) throw new Error('scenario'); }, events: [{ type: 'text_delta', text: finalText }, { type: 'completed' }] }
    ]
  };
}

export { finalText };
