import type { DatabaseSync } from 'node:sqlite';
import type { ConversationHistoryReader, ConversationPair } from '@codryn/core';
import { uuidSchema } from '@codryn/shared';
import type { Uuid } from '@codryn/shared';

function invalid(): never {
  throw new Error('R4_CONVERSATION_INVALID');
}

export class SqliteConversationReader implements ConversationHistoryReader {
  constructor(private readonly database: DatabaseSync) {}

  async readCandidates(chatId: Uuid, currentRequestId: Uuid): Promise<readonly ConversationPair[]> {
    const current = this.database.prepare(`
      SELECT j.chat_id, m.sequence, m.chat_id AS message_chat, m.request_id, m.role, m.state
      FROM desktop_jobs j LEFT JOIN chat_messages m ON m.id=j.message_id
      WHERE j.request_id=?
    `).get(uuidSchema.parse(currentRequestId));
    if (!current) throw new Error('R3_NOT_FOUND');
    if (current.chat_id !== uuidSchema.parse(chatId)) throw new Error('R3_CHAT_PROJECT_MISMATCH');
    const currentSequence = current.sequence;
    if (current.message_chat !== chatId || current.request_id !== currentRequestId || current.role !== 'user' ||
      current.state !== 'complete' || typeof currentSequence !== 'number') invalid();

    const candidates = this.database.prepare(`
      SELECT j.request_id, j.run_id, json_extract(j.result_json, '$.runId') AS result_run_id,
        json_extract(j.result_json, '$.stepCount') AS final_step,
        u.id AS user_id, u.text AS user_text, u.chat_id AS user_chat, u.request_id AS user_request,
        u.sequence AS user_sequence, u.role AS user_role, u.state AS user_state
      FROM desktop_jobs j LEFT JOIN chat_messages u ON u.id=j.message_id
      WHERE j.chat_id=? AND j.request_id<>? AND j.state='finished'
        AND json_extract(j.result_json, '$.status')='completed' AND (u.sequence IS NULL OR u.sequence<?)
      ORDER BY u.sequence IS NOT NULL, u.sequence DESC LIMIT 9
    `).all(chatId, currentRequestId, currentSequence);
    const terminal = this.database.prepare(`
      SELECT id, text, chat_id, run_id, sequence, state
      FROM chat_messages WHERE request_id=? AND role='assistant' AND step=?
    `);
    return candidates.map(job => {
      if (job.user_chat !== chatId || job.user_request !== job.request_id || job.user_role !== 'user' ||
        job.user_state !== 'complete' || typeof job.user_text !== 'string' || typeof job.user_sequence !== 'number' ||
        typeof job.final_step !== 'number' || !Number.isInteger(job.final_step) || job.final_step < 1 ||
        !uuidSchema.safeParse(job.run_id).success || job.run_id !== job.result_run_id) invalid();
      const assistant = terminal.get(uuidSchema.parse(job.request_id), job.final_step);
      if (!assistant || assistant.chat_id !== chatId || assistant.run_id !== job.run_id || assistant.state !== 'complete' ||
        typeof assistant.text !== 'string' || typeof assistant.sequence !== 'number' ||
        assistant.sequence <= job.user_sequence || assistant.sequence >= currentSequence) invalid();
      return {
        user: { id: uuidSchema.parse(job.user_id), text: job.user_text },
        assistant: { id: uuidSchema.parse(assistant.id), text: assistant.text }
      };
    });
  }
}
