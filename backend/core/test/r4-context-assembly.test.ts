import { expect, it } from 'vitest';
import { assembleR4Context } from '../src/agent/context-assembler.js';

const hash = 'a'.repeat(64);
const text = 'ě'.repeat(9_000);

it('gives explicit excerpts precedence over the map and keeps each UTF-8 excerpt within its limit', () => {
  const references = Array.from({ length: 8 }, (_, index) => ({
    path: `src/${index}.ts`, hash, content: text, kind: 'file' as const
  }));
  const result = assembleR4Context({
    task: 'Zkontroluj soubory', references, projectRules: [], history: [],
    map: [{ path: 'src/map.ts', hash, content: 'metadata' }], mapOmissions: []
  });
  expect(result.modelContent).toHaveLength(4);
  expect(result.modelContent.every(source => source.byteLength === 16_384 && !source.content.includes('�'))).toBe(true);
  expect(result.audit).toContainEqual(expect.objectContaining({ source: 'loaded_excerpt', path: 'src/0.ts', bytes: 16_384, status: 'truncated', startLine: 1, endLine: 1 }));
  expect(result.audit).toContainEqual(expect.objectContaining({ source: 'repo_map', path: 'src/map.ts', bytes: 0, status: 'omitted', reason: 'byte_budget' }));
});

it('keeps project rules, prior history, file excerpts and folder metadata distinguishable', () => {
  const result = assembleR4Context({
    task: 'Inspect', history: [{ path: 'chat-history', hash, content: 'Earlier conversation' }],
    projectRules: [{ path: 'AGENTS.md', hash, content: 'Project instructions' }],
    references: [
      { path: 'src', hash, content: 'file src/current.ts', kind: 'directory' },
      { path: 'src/current.ts', hash, content: 'first line\nsecond line\n', kind: 'file' }
    ],
    map: [{ path: 'src/current.ts', hash, content: 'source metadata' }], mapOmissions: []
  });
  expect(result.modelContent.map(source => source.reason)).toEqual(['chat_history', 'project_rules', 'directory_reference', 'loaded_excerpt', 'repo_map']);
  expect(result.audit).toContainEqual(expect.objectContaining({ source: 'loaded_excerpt', path: 'src/current.ts', startLine: 1, endLine: 2 }));
  expect(result.audit).toContainEqual(expect.objectContaining({ source: 'project_reference', path: 'src', bytes: 19, status: 'used' }));
  expect(JSON.stringify(result.audit)).not.toContain('second line');
});
