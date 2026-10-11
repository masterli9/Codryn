import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { openR0Database, runMigrations, SqliteWorkspaceStore, SqliteChatStore, SqliteDesktopProjectStore, SqliteDesktopRequestStore, SqliteAgentRunStore, SqliteToolCallStore, SqlitePermissionStore, SqliteVerificationStore } from '../src/index.js';
import { SqliteDesktopProjectionStore } from '../src/persistence/sqlite-desktop-projection-store.js';
import { SqliteDesktopActionStore } from '../src/persistence/sqlite-desktop-action-store.js';
import { SqliteOwnedCommandStore } from '../src/persistence/sqlite-owned-command-store.js';
import type { ModelDescriptor, R3SubmitInput } from '@codryn/shared';
const now = '2026-10-11T10:00:00Z', clock = { now: () => now }, ids = { next: () => randomUUID() };
const model: ModelDescriptor = { adapterId: 'demo', modelId: 'demo', capabilities: { streaming: 'supported', toolCalling: 'supported', structuredOutput: 'unsupported', imageInput: 'unsupported', usageMetadata: 'unknown', contextLimit: 'unknown', compaction: 'unsupported' } };
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'codryn-r3-projection-')); const db = openR0Database(join(root, 'codryn.sqlite')); runMigrations(db, now);
  cleanup.push(async () => { db.close(); await rm(root, { recursive: true, force: true }); });
  const projectId = new SqliteWorkspaceStore(db).open(root, randomUUID()); await new SqliteDesktopProjectStore(db, clock).remember(projectId, root, 'Project');
  const chats = new SqliteChatStore(db, clock, ids), chat = await chats.create(projectId, 'Chat');
  const requests = new SqliteDesktopRequestStore(db, clock, ids), projection = new SqliteDesktopProjectionStore(db, clock, ids);
  const input: R3SubmitInput = { requestId: randomUUID(), chatId: chat.id, task: 'Inspect', maxSteps: 16, mode: 'demo' };
  const accepted = await requests.accept(input, projectId, model), runId = randomUUID();
  await new SqliteAgentRunStore(db).createWithInitialEvent({ runId, requestId: input.requestId, state: 'idle', task: input.task, maxSteps: 16, stepCount: 0, adapterId: 'demo', modelId: 'demo', createdAt: now, updatedAt: now }, { eventId: randomUUID(), eventType: 'agent_run.created', eventVersion: 1, correlationId: input.requestId, occurredAt: now, source: 'core', sessionId: runId, payload: { state: 'idle' } });
  await requests.attachRun(input.requestId, runId);
  const callId = randomUUID();
  await new SqliteToolCallStore(db, { clock, ids }).createWithInitialEvent({ callId, runId, projectId, toolId: 'command.run', toolVersion: 1, state: 'received', arguments: { command: { executable: 'node', args: ['--test', 'sum.test.mjs'], cwd: '.', timeoutMs: 5000, maxOutputBytes: 1000 }, reason: 'Test', impact: 'Local' }, createdAt: now, updatedAt: now }, { eventId: randomUUID(), eventType: 'tool_call.received', eventVersion: 1, correlationId: input.requestId, occurredAt: now, source: 'core', sessionId: runId, payload: { callId, toolId: 'command.run' } });
  return { db, root, projectId, chats, chat, requests, projection, input, accepted, runId, callId };
}
it('projects real permission and verification store events once with their actual correlation IDs', async () => {
  const f = await fixture();
  await new SqliteWorkspaceStore(f.db).observe(f.projectId, { fingerprint: 'a'.repeat(64), gitIdentity: null, complete: true });
  const before = (await f.projection.snapshot(f.chat.id)).cursor;
  const permissions = new SqlitePermissionStore(f.db, clock, ids), permissionId = randomUUID();
  await permissions.create({ id: permissionId, callId: f.callId, digest: 'a'.repeat(64), command: { executable: 'node', args: ['--test', 'sum.test.mjs'], cwd: '.', timeoutMs: 5000, maxOutputBytes: 1000 }, reason: 'Test', impact: 'Local', state: 'pending' });
  const pending = await f.projection.snapshot(f.chat.id); expect(pending.cursor).toBe(before + 1); expect(pending.permissions[0]?.id).toBe(permissionId);
  await permissions.decide({ id: permissionId, digest: 'a'.repeat(64), decision: 'allow_once' });
  await new SqliteVerificationStore(f.db).append({ id: randomUUID(), runId: f.runId, callId: f.callId, projectId: f.projectId, kind: 'test', command: { executable: 'node', args: ['--test', 'sum.test.mjs'], cwd: '.', timeoutMs: 5000, maxOutputBytes: 1000 }, scope: 'project', revision: 1, fingerprint: 'a'.repeat(64), occurredAt: now, result: 'passed', stale: false, reason: 'Passed', exitCode: 0 });
  const snapshot = await f.projection.snapshot(f.chat.id); expect(snapshot.cursor).toBe(before + 3); expect(snapshot.permissions).toEqual([]);
  expect(snapshot.activity.map(a => a.type)).toContain('permission.decided');
  expect(snapshot.verification?.status).toBe('unverified'); // Missing coverage must never become complete.
  expect(JSON.stringify(snapshot)).not.toContain('payload_json');
});
it('rolls back a source event and its cursor together and isolates chat cursors', async () => {
  const f = await fixture(); const second = await f.chats.create(f.projectId, 'Other');
  const before = (await f.projection.snapshot(f.chat.id)).cursor;
  f.db.exec('BEGIN IMMEDIATE');
  f.db.prepare('INSERT INTO events(event_id,event_type,event_version,correlation_id,occurred_at,source,session_id,payload_json) VALUES(?,?,1,?,?,?, ?,?)').run(randomUUID(), 'agent_run.state_changed', f.input.requestId, now, 'core', f.runId, '{}');
  f.db.exec('ROLLBACK');
  expect((await f.projection.snapshot(f.chat.id)).cursor).toBe(before);
  expect((await f.projection.snapshot(second.id)).cursor).toBe(0);
});
it('persists idempotent assistant chunks, pages history and requests resync after retention expires', async () => {
  const f = await fixture();
  await f.projection.appendAssistant(f.input.requestId, 1, 1, 'Hello');
  await f.projection.appendAssistant(f.input.requestId, 1, 1, 'Hello');
  await expect(f.projection.appendAssistant(f.input.requestId, 1, 1, 'Different')).rejects.toThrow('R3_REQUEST_MISMATCH');
  await f.projection.appendAssistant(f.input.requestId, 1, 2, ' world'); await f.projection.sealAssistant(f.input.requestId, 1, 'complete');
  expect((await f.projection.snapshot(f.chat.id)).messages.at(-1)?.text).toBe('Hello world');
  for (let step = 2; step <= 103; step++) { await f.projection.appendAssistant(f.input.requestId, step, 1, String(step)); await f.projection.sealAssistant(f.input.requestId, step, 'complete'); }
  const snapshot = await f.projection.snapshot(f.chat.id); expect(snapshot.messages).toHaveLength(100); expect(snapshot.beforeMessageSequence).toBeGreaterThan(1);
  expect((await f.projection.messages(f.chat.id, snapshot.beforeMessageSequence)).length).toBe(4);
  for (let step = 104; step < 1200; step++) await f.projection.appendAssistant(f.input.requestId, step, 1, 'x');
  expect((await f.projection.updates(f.chat.id, 0, 256))[0]?.kind).toBe('resync_required');
  expect(f.db.prepare('SELECT count(*) AS n FROM desktop_updates WHERE chat_id=?').get(f.chat.id)?.n).toBe(1024);
});
it('enforces historical run and output ownership, preserves interrupted prefixes after restart', async () => {
  const f = await fixture(); const other = await f.chats.create(f.projectId, 'Other');
  await f.projection.appendAssistant(f.input.requestId, 1, 1, 'Prefix');
  await f.projection.appendOutput(f.input.requestId, f.callId, 'stdout', 'žluťoučký', false);
  expect((await f.projection.output(f.chat.id, f.callId, null)).chunks[0]?.text).toBe('žluťoučký');
  await expect(f.projection.output(other.id, f.callId, null)).rejects.toThrow('R3_CHAT_PROJECT_MISMATCH');
  await expect(f.projection.inspectRun(other.id, f.input.requestId)).rejects.toThrow('R3_CHAT_PROJECT_MISMATCH');
  await f.requests.interruptUnfinished(f.projectId);
  expect((await f.projection.snapshot(f.chat.id)).messages.at(-1)).toMatchObject({ text: 'Prefix', state: 'interrupted' });
});
it('records idempotent revert intents and refuses a changed digest', async () => {
  const f = await fixture(); const store = new SqliteDesktopActionStore(f.db);
  const input = { requestId: randomUUID(), chatId: f.chat.id, setId: randomUUID(), expectedSetSequence: 0, expectedWorkspaceRevision: 0 };
  await store.begin(input, 'a'.repeat(64)); await store.begin(input, 'a'.repeat(64));
  await expect(store.begin(input, 'b'.repeat(64))).rejects.toThrow('R3_REQUEST_MISMATCH');
  await store.finish(input.requestId, { status: 'conflicted', revertedIds: [], blockedIds: [] });
  expect((await store.get(input.requestId))?.state).toBe('finished');
});
it('persists exact command ownership before start and only clears a confirmed stopped tree',async()=>{
  const f=await fixture(),store=new SqliteOwnedCommandStore(f.db),actor={projectId:f.projectId,runId:f.runId,callId:f.callId};
  const evidence={jobName:`Codryn-R3-${randomUUID()}`,worker:{pid:10,creationTime:'638000000000000000'},target:{pid:11,creationTime:'638000000000000001'}};
  await store.recordOwned(actor,evidence);expect(await store.pending(f.projectId)).toHaveLength(1);await store.recordOwned(actor,evidence);await expect(store.recordOwned(actor,{...evidence,target:{...evidence.target,pid:12}})).rejects.toThrow('R3_REQUEST_MISMATCH');
  await store.recordResult(actor,{status:'termination_failed',exitCode:null,stdout:'',stderr:'',durationMs:10,truncated:false,treeStopped:false});expect(await store.pending(f.projectId)).toHaveLength(1);
  await store.recordResult(actor,{status:'cancelled',exitCode:null,stdout:'',stderr:'',durationMs:20,truncated:false,treeStopped:true});expect(await store.pending(f.projectId)).toEqual([]);
});
