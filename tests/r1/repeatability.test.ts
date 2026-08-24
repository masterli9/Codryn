import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createR1Infrastructure } from '@codryn/infrastructure';
import type { EventEnvelope, Uuid } from '@codryn/shared';
import type { Clock, IdGenerator } from '@codryn/core';
import { readSearchSummaryScenario, finalText } from '../../apps/cli/src/scenarios/read-search-summary.js';

interface SemanticEvent { readonly eventType: string; readonly state?: string; readonly toolId?: string; readonly toolVersion?: number; readonly permissionResult?: string; readonly outcome?: string; }
function semantic(events: readonly EventEnvelope[]): SemanticEvent[] {
  return events.map((event) => {
    const payload = event.payload as Record<string, unknown>;
    return { eventType: event.eventType, ...(typeof payload.to === 'string' ? { state: payload.to } : {}), ...(typeof payload.toolId === 'string' ? { toolId: payload.toolId } : {}), ...(typeof payload.toolVersion === 'number' ? { toolVersion: payload.toolVersion } : {}), ...(typeof payload.permissionResult === 'string' ? { permissionResult: payload.permissionResult } : {}), ...(event.eventType === 'agent_run.completed' ? { outcome: 'completed' } : {}) };
  });
}
const golden: readonly SemanticEvent[] = [
  { eventType: 'agent_run.created' }, { eventType: 'agent_run.state_changed', state: 'preparing_context' }, { eventType: 'context.assembled' }, { eventType: 'agent_run.state_changed', state: 'waiting_for_model' }, { eventType: 'model.requested' }, { eventType: 'model.response_received' }, { eventType: 'agent_run.state_changed', state: 'executing_tool' }, { eventType: 'tool_call.received', toolId: 'text.search', toolVersion: 1 }, { eventType: 'tool_call.schema_validated', state: 'schema_validated' }, { eventType: 'tool_call.permission_decided', state: 'permission_decided', permissionResult: 'allowed_by_rule' }, { eventType: 'tool_call.queued', state: 'queued' }, { eventType: 'tool_call.started', state: 'running' }, { eventType: 'tool_call.succeeded', state: 'succeeded' }, { eventType: 'agent_run.state_changed', state: 'waiting_for_model' }, { eventType: 'model.requested' }, { eventType: 'model.response_received' }, { eventType: 'agent_run.state_changed', state: 'executing_tool' }, { eventType: 'tool_call.received', toolId: 'file.read', toolVersion: 1 }, { eventType: 'tool_call.schema_validated', state: 'schema_validated' }, { eventType: 'tool_call.permission_decided', state: 'permission_decided', permissionResult: 'allowed_by_rule' }, { eventType: 'tool_call.queued', state: 'queued' }, { eventType: 'tool_call.started', state: 'running' }, { eventType: 'tool_call.succeeded', state: 'succeeded' }, { eventType: 'agent_run.state_changed', state: 'waiting_for_model' }, { eventType: 'model.requested' }, { eventType: 'model.response_received' }, { eventType: 'agent_run.completed', state: 'completed', outcome: 'completed' }
];
class FixedClock implements Clock { now() { return '2026-08-24T00:00:00.000Z'; } }
class SequenceIds implements IdGenerator { #value = 0; next(): Uuid { this.#value += 1; return `00000000-0000-4000-8000-${String(this.#value).padStart(12, '0')}` as Uuid; } }
describe('R1 repeatability', () => {
  it('matches ten fresh real compositions against the same hand-authored semantic trace', async () => {
    const traces: SemanticEvent[][] = []; const projectRoot = resolve('tests/support/fixtures/r1-project');
    for (let index = 0; index < 10; index += 1) {
      const userDataPath = await mkdtemp(join(tmpdir(), 'codryn-r1-repeat-'));
      const runtime = await createR1Infrastructure({ userDataPath, projectRoot, scenario: readSearchSummaryScenario(), clock: new FixedClock(), ids: new SequenceIds() });
      try {
        const result = await runtime.agentLoop.execute({ requestId: `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}` as Uuid, projectRoot, task: 'Shrň definici a použití formatGreeting.', contextReferences: ['README.md'], maxSteps: 8 }, new AbortController().signal);
        expect(result).toEqual(expect.objectContaining({ status: 'completed', stepCount: 3, finalText })); traces.push(semantic(await runtime.eventStore.findBySessionId(result.runId)));
      } finally { runtime.close(); await rm(userDataPath, { recursive: true, force: true }); }
    }
    for (const trace of traces) expect(trace).toEqual(traces[0]); expect(traces[0]).toEqual(golden);
  });
});
