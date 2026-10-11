import { describe, expect, it } from 'vitest';
import { r3SubmitInputSchema, r3IpcRequestSchema, r3ResponseSchemas, r3ProviderSettingsSchema, r3RunViewSchema } from '../src/index.js';

const id = '11111111-1111-4111-8111-111111111111';
const submit = { requestId: id, chatId: id, task: ' Oprav součet ', maxSteps: 16, mode: 'demo' };
describe('R3 boundary contracts', () => {
  it('normalizes task and rejects invalid or privileged submit inputs', () => {
    expect(r3SubmitInputSchema.parse(submit).task).toBe('Oprav součet');
    for (const change of [{ task: '' }, { task: 'x'.repeat(16385) }, { task: 'x\0y' }, { maxSteps: 0 }, { maxSteps: 33 }, { requestId: 'bad' }, { projectRoot: 'C:/' }, { argv: [] }, { mode: 'remote' }]) {
      expect(r3SubmitInputSchema.safeParse({ ...submit, ...change }).success).toBe(false);
    }
  });
  it('rejects unknown operations, extra paths, oversized bytes and invalid cursors', () => {
    for (const input of [{ operation: 'exec', requestId: id }, { operation: 'project.open', requestId: id, root: 'C:/' }, { operation: 'stream.attach', requestId: id, chatId: id, afterCursor: NaN }, { operation: 'chat.create', requestId: id, projectId: id, title: 'x'.repeat(121) }, { operation: 'settings.saveKey', requestId: id, key: 'x'.repeat(4097) }]) {
      expect(r3IpcRequestSchema.safeParse(input).success).toBe(false);
    }
    expect(r3IpcRequestSchema.safeParse({ operation: 'run.submit', ...submit }).success).toBe(true);
    // Character-valid command whose UTF-8 envelope exceeds the wire limit.
    expect(r3IpcRequestSchema.safeParse({ operation: 'permission.answer', requestId: id, projectId: id, chatId: id, decision: { id, digest: 'a'.repeat(64), decision: 'allow_once' }, extra: '😀'.repeat(40000) }).success).toBe(false);
  });
  it('has explicit response schemas for every operation and excludes secrets', () => {
    expect(Object.keys(r3ResponseSchemas).sort()).toEqual(['project.open', 'project.list', 'chat.create', 'chat.list', 'chat.rename', 'chat.archive', 'chat.snapshot', 'chat.history', 'run.submit', 'run.stop', 'run.inspect', 'run.activity', 'permission.answer', 'changes.diff', 'changes.revert', 'command.output', 'settings.get', 'settings.saveKey', 'settings.removeKey', 'settings.testKey', 'settings.select', 'settings.consent', 'stream.attach', 'stream.detach'].sort());
    expect(r3ResponseSchemas['chat.archive'].safeParse({ ok: true, value: { archived: true, key: 'secret' } }).success).toBe(false);
    expect(r3ResponseSchemas['settings.get'].safeParse({ ok: true, value: { key: 'secret' } }).success).toBe(false);
  });
  it('preserves unsupported capabilities and separates phase from desktop state', () => {
    const model = { adapterId: 'demo', modelId: 'demo', capabilities: { streaming: 'supported', toolCalling: 'supported', structuredOutput: 'unsupported', imageInput: 'unknown', usageMetadata: 'unknown', contextLimit: 'unknown', compaction: 'unsupported' } };
    const view = { jobId: id, requestId: id, runId: null, state: 'running', phase: 'waiting_for_approval', mode: 'demo', model, maxSteps: 16, result: null, failure: null, stepCount: 0, startedAt: null, endedAt: null, usage: null, providerError: null };
    expect(r3RunViewSchema.parse(view).phase).toBe('waiting_for_approval');
    expect(r3RunViewSchema.safeParse({ ...view, buffer: Buffer.from('x') }).success).toBe(false);
    expect(r3RunViewSchema.safeParse({ ...view, signal: new AbortController().signal }).success).toBe(false);
    expect(r3ProviderSettingsSchema.safeParse({ mode: 'demo', modelId: 'different', model, maxSteps: 16, keyState: 'missing', keyVersion: 0, testedAt: null, testResult: 'not_tested', dataPolicyVersion: '1', consentVersion: null, dataPolicy: { version: '1', requiresConfirmation: true, notice: 'Notice', sourceUrls: [] } }).success).toBe(false);
  });
});
