import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createR2Infrastructure, ScriptedModelAdapter, changeVerifyReturnScenario } from '../src/index.js';
import { createR2Project } from '@codryn/test-support';

describe('R2 infrastructure model composition', () => {
  it('accepts an injected model adapter without requiring a scripted scenario option', async () => {
    const fixture = await createR2Project('non-git');
    const expectedHash = createHash('sha256').update(await readFile(`${fixture.root}\\sum.mjs`)).digest('hex');
    const model = new ScriptedModelAdapter(changeVerifyReturnScenario({ expectedHash, projectRoot: fixture.root }));
    const infrastructure = await createR2Infrastructure({
      projectRoot: fixture.root,
      userDataPath: fixture.userData,
      model,
      permissionResponder: async () => 'allow_once'
    });
    try {
      const result = await infrastructure.agentLoop.executeR2({
        requestId: '11111111-1111-4111-8111-111111111111',
        projectRoot: fixture.root,
        task: 'Oprav sum a ověř opravu.',
        contextReferences: [],
        maxSteps: 8
      }, new AbortController().signal);
      const events = await infrastructure.eventStore.findBySessionId(result.runId);
      expect(result, JSON.stringify({ result, eventTypes: events.map((event) => event.eventType) })).toMatchObject({ status: 'completed', verification: { status: 'verified' } });
    } finally {
      infrastructure.close();
      await fixture.close();
    }
  }, 30_000);

  it('keeps the project line ending style in the scripted change cycle', async () => {
    const fixture = await createR2Project('non-git');
    const originalContent = 'export function sum(a, b) { return a - b; }\r\n';
    await writeFile(`${fixture.root}\\sum.mjs`, originalContent, 'utf8');
    const expectedHash = createHash('sha256').update(Buffer.from(originalContent, 'utf8')).digest('hex');
    const model = new ScriptedModelAdapter(changeVerifyReturnScenario({ expectedHash, originalContent, projectRoot: fixture.root }));
    const infrastructure = await createR2Infrastructure({
      projectRoot: fixture.root,
      userDataPath: fixture.userData,
      model,
      permissionResponder: async () => 'allow_once'
    });
    try {
      const result = await infrastructure.agentLoop.executeR2({
        requestId: '22222222-2222-4222-8222-222222222222',
        projectRoot: fixture.root,
        task: 'Oprav sum v CRLF fixture.',
        contextReferences: [],
        maxSteps: 8
      }, new AbortController().signal);
      expect(result, JSON.stringify(result)).toMatchObject({ status: 'completed', verification: { status: 'verified' } });
      expect((await readFile(`${fixture.root}\\sum.mjs`)).toString('utf8')).toBe('export function sum(a, b) { return a + b; }\r\n');
    } finally {
      infrastructure.close();
      await fixture.close();
    }
  }, 30_000);
});
