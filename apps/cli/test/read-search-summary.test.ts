import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { ModelRequest, Uuid } from '@codryn/shared';
import { readSearchSummaryScenario } from '../src/scenarios/read-search-summary.js';

const fixtureEol = process.platform === 'win32' ? '\r\n' : '\n';
const greetingContent = `export function formatGreeting(name: string): string {${fixtureEol}  return \`Ahoj, \${name}!\`;${fixtureEol}}${fixtureEol}`;
const greetingHash = createHash('sha256').update(greetingContent, 'utf8').digest('hex');
const request = (previousToolResults: ModelRequest['previousToolResults'] = []): ModelRequest => ({ runId: '11111111-1111-4111-8111-111111111111' as Uuid, task: 'x', project: { id: 'project' }, context: [{ path: 'README.md', content: `# R1 fixture${fixtureEol}${fixtureEol}Malý TypeScriptový projekt pro ověření čtení zdrojů a hledání symbolů.${fixtureEol}`, contentHash: 'a'.repeat(64), byteLength: 7, reason: 'explicit_reference' }], tools: [], previousToolResults });

describe('read-search-summary scenario', () => {
  it('requires the exact ordered search audit and greeting file evidence', () => {
    const steps = readSearchSummaryScenario().steps;
    expect(() => steps[0]?.assertRequest(request())).not.toThrow();
    const search = { ok: true as const, callId: '00000000-0000-4000-8000-000000000001' as Uuid, output: { matches: [{ path: 'src/greeting.ts', line: 1, column: 17, preview: 'export function formatGreeting(name: string): string {' }, { path: 'src/index.ts', line: 1, column: 10, preview: "import { formatGreeting as greeting } from './greeting.js';" }, { path: 'src/preview.ts', line: 1, column: 10, preview: "import { formatGreeting as greeting } from './greeting.js';" }], truncated: false, filesSearched: 3, bytesSearched: 0 } };
    expect(() => steps[1]?.assertRequest(request([search]))).not.toThrow();
    const read = { ok: true as const, callId: '00000000-0000-4000-8000-000000000002' as Uuid, output: { path: 'src/greeting.ts', content: greetingContent, startLine: 1, endLine: 4, totalLines: 4, truncated: false, contentHash: greetingHash } };
    expect(() => steps[2]?.assertRequest(request([search, read]))).not.toThrow();
  });

  it('rejects reordered search results and altered greeting evidence', () => {
    const steps = readSearchSummaryScenario().steps;
    const invalidSearch = { ok: true as const, callId: '00000000-0000-4000-8000-000000000001' as Uuid, output: { matches: [], truncated: false, filesSearched: 0, bytesSearched: 0 } };
    expect(() => steps[1]?.assertRequest(request([invalidSearch]))).toThrow();
    const validSearch = { ok: true as const, callId: '00000000-0000-4000-8000-000000000001' as Uuid, output: { matches: [{ path: 'src/greeting.ts', line: 1, column: 17, preview: 'export function formatGreeting(name: string): string {' }, { path: 'src/index.ts', line: 1, column: 10, preview: "import { formatGreeting as greeting } from './greeting.js';" }, { path: 'src/preview.ts', line: 1, column: 10, preview: "import { formatGreeting as greeting } from './greeting.js';" }], truncated: false, filesSearched: 3, bytesSearched: 0 } };
    const alteredRead = { ok: true as const, callId: '00000000-0000-4000-8000-000000000002' as Uuid, output: { path: 'src/greeting.ts', content: 'altered', startLine: 1, endLine: 1, totalLines: 1, truncated: false, contentHash: 'a'.repeat(64) } };
    expect(() => steps[2]?.assertRequest(request([validSearch, alteredRead]))).toThrow();
  });
});
