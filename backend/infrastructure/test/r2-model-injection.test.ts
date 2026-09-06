import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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
});
