import { expect, it } from 'vitest';
import { typescriptQueryTool } from '../src/index.js';

it('exposes seven bounded query kinds through a read-only descriptor', () => {
  const tool = typescriptQueryTool(async () => ({ status: 'limited', mode: 'fallback', revision: 0, targetHash: null,
    policyRevision: null, items: [], truncated: false, reason: 'worker_failed' }));
  expect(tool).toMatchObject({ toolId: 'typescript.query', toolVersion: 1, risk: 'read_project' });
  const descriptor = JSON.stringify(tool.inputSchema.toJSONSchema());
  for (const kind of ['definition', 'references', 'type', 'signature', 'exports', 'diagnostics', 'imports']) {
    expect(descriptor).toContain(`"${kind}"`);
  }
});
