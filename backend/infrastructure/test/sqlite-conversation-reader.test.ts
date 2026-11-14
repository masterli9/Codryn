import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it } from 'vitest';
import { r3ModelDescriptor } from '@codryn/core';
import { runMigrations, SqliteAgentRunStore, SqliteChatStore, SqliteWorkspaceStore } from '../src/index.js';
import { SqliteDesktopProjectionStore } from '../src/persistence/sqlite-desktop-projection-store.js';
import { SqliteDesktopRequestStore } from '../src/persistence/sqlite-desktop-request-store.js';
import { SqliteConversationReader } from '../src/persistence/sqlite-conversation-reader.js';

const now = '2026-11-14T10:00:00Z';
const clock = { now: () => now }, ids = { next: randomUUID }, model = r3ModelDescriptor('demo');
const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

async function setup() {
  const db = new DatabaseSync(':memory:');
  databases.push(db);
  runMigrations(db, now);
  const projectId = new SqliteWorkspaceStore(db).open('fixture', randomUUID());
  const chats = new SqliteChatStore(db, clock, ids);
  const requests = new SqliteDesktopRequestStore(db, clock, ids);
  const projection = new SqliteDesktopProjectionStore(db, clock, ids);
  async function accept(chatId: string, task: string, retryOfRequestId?: string) {
    return requests.accept({ chatId, task, requestId: randomUUID(), mode: 'demo', maxSteps: 8, retryOfRequestId }, projectId, model);
  }
  async function start(chatId: string, task: string, retryOfRequestId?: string) {
    const accepted = await accept(chatId, task, retryOfRequestId), runId = randomUUID();
    await new SqliteAgentRunStore(db).createWithInitialEvent(
      { runId, requestId: accepted.requestId, state: 'idle', task, maxSteps: 8, stepCount: 0, adapterId: 'demo', modelId: 'demo', createdAt: now, updatedAt: now },
      { eventId: randomUUID(), eventType: 'agent_run.created', eventVersion: 1, correlationId: accepted.requestId, occurredAt: now, source: 'core', sessionId: runId, payload: {} }
    );
    await requests.attachRun(accepted.requestId, runId);
    return { ...accepted, runId };
  }
  async function finish(job: Awaited<ReturnType<typeof start>>, status: 'completed' | 'failed', stepCount = 2) {
    await requests.finish(job.jobId, { schemaVersion: 2, runId: job.runId, stepCount, status, finalText: '', changeSetId: null,
      verification: { status: 'unverified', reason: 'Fixture.', recordId: null }, recoveryRequired: false });
  }
  async function add(chatId: string, task: string, final: string, status: 'completed' | 'failed' = 'completed', retryOfRequestId?: string) {
    const job = await start(chatId, task, retryOfRequestId);
    await projection.appendAssistant(job.requestId, 1, 1, 'Průběžný komentář');
    await projection.sealAssistant(job.requestId, 1, 'complete');
    await projection.appendAssistant(job.requestId, 2, 1, final);
    await projection.sealAssistant(job.requestId, 2, 'complete');
    await finish(job, status);
    return job;
  }
  const chat = await chats.create(projectId, 'Main'), other = await chats.create(projectId, 'Other');
  return { db, chat, other, accept, start, finish, add, projection, projectId, reader: new SqliteConversationReader(db) };
}

it('pairs only earlier terminal answers in the accepted chat, including a successful retry', async () => {
  const f = await setup();
  const first = await f.add(f.chat.id, 'První otázka', 'První konečná odpověď');
  await f.add(f.other.id, 'Cizí otázka', 'Cizí odpověď');
  const stopped = await f.start(f.chat.id, 'Přerušená otázka');
  await f.projection.appendAssistant(stopped.requestId, 1, 1, 'Nedokončený stream');
  const restarted = new SqliteDesktopRequestStore(f.db, clock, ids);
  await restarted.interruptUnfinished(f.projectId);
  const failed = await f.add(f.chat.id, 'Neúspěšná otázka', 'Neúspěšná odpověď', 'failed');
  const retried = await f.add(f.chat.id, 'Nový pokus', 'Dokončený nový pokus', 'completed', failed.requestId);
  const current = await f.accept(f.chat.id, 'Aktuální zadání');
  expect(await f.reader.readCandidates(f.chat.id, current.requestId)).toEqual([
    { user: { id: retried.messageId, text: 'Nový pokus' }, assistant: { id: expect.any(String), text: 'Dokončený nový pokus' } },
    { user: { id: first.messageId, text: 'První otázka' }, assistant: { id: expect.any(String), text: 'První konečná odpověď' } }
  ]);
  await expect(f.reader.readCandidates(f.other.id, current.requestId)).rejects.toThrow('R3_CHAT_PROJECT_MISMATCH');
});

it('limits candidates to nine and refuses a completed job whose terminal assistant step is absent', async () => {
  const f = await setup();
  for (let index = 0; index < 10; index++) await f.add(f.chat.id, `Otázka ${index}`, `Odpověď ${index}`);
  const corrupt = await f.start(f.chat.id, 'Bez konečné odpovědi');
  await f.projection.appendAssistant(corrupt.requestId, 1, 1, 'Průběžný komentář');
  await f.finish(corrupt, 'failed');
  const current = await f.accept(f.chat.id, 'Aktuální zadání');
  const candidates = await f.reader.readCandidates(f.chat.id, current.requestId);
  expect(candidates.map(pair => pair.user.text)).toEqual(Array.from({ length: 9 }, (_, index) => `Otázka ${9 - index}`));
  await f.finish(corrupt, 'completed');
  await expect(f.reader.readCandidates(f.chat.id, current.requestId)).rejects.toThrow('R4_CONVERSATION_INVALID');
});

it('preserves a terminal answer made of whitespace without substituting a tool-step comment', async () => {
  const f = await setup();
  const finished = await f.add(f.chat.id, 'Otázka', '  \n');
  const current = await f.accept(f.chat.id, 'Pokračuj');
  expect(await f.reader.readCandidates(f.chat.id, current.requestId)).toMatchObject([
    { user: { id: finished.messageId }, assistant: { text: '  \n' } }
  ]);
});
