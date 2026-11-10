import type { DatabaseSync } from 'node:sqlite';
import type { ChatStore, Clock, IdGenerator } from '@codryn/core';
import { r3ChatSchema, r3TitleSchema, uuidSchema } from '@codryn/shared';
import type { R3Chat, Uuid } from '@codryn/shared';
export class SqliteChatStore implements ChatStore {
  constructor(private readonly database: DatabaseSync, private readonly clock: Clock, private readonly ids: IdGenerator) {}
  async create(projectId: Uuid, title: string): Promise<R3Chat> {
    const chat = r3ChatSchema.parse({ id: this.ids.next(), projectId, title: r3TitleSchema.parse(title), archived: false, createdAt: this.clock.now() });
    this.database.prepare('INSERT INTO chats(id,project_id,title,archived,created_at,updated_at) VALUES(?,?,?,0,?,?)').run(chat.id, projectId, chat.title, chat.createdAt, chat.createdAt);
    return chat;
  }
  async get(chatId: Uuid): Promise<R3Chat | null> {
    const row = this.database.prepare('SELECT * FROM chats WHERE id=?').get(uuidSchema.parse(chatId));
    return row ? r3ChatSchema.parse({ id: row.id, projectId: row.project_id, title: row.title, archived: row.archived === 1, createdAt: row.created_at }) : null;
  }
  async list(projectId: Uuid, archived: boolean): Promise<readonly R3Chat[]> {
    return this.database.prepare('SELECT * FROM chats WHERE project_id=? AND archived=? ORDER BY created_at,id').all(uuidSchema.parse(projectId), archived ? 1 : 0).map(row => r3ChatSchema.parse({ id: row.id, projectId: row.project_id, title: row.title, archived: row.archived === 1, createdAt: row.created_at }));
  }
  async rename(chatId: Uuid, title: string): Promise<void> {
    if (!this.database.prepare('UPDATE chats SET title=?,updated_at=? WHERE id=?').run(r3TitleSchema.parse(title), this.clock.now(), uuidSchema.parse(chatId)).changes) throw new Error('R3_NOT_FOUND');
  }
  async archive(chatId: Uuid): Promise<void> {
    if (!this.database.prepare('UPDATE chats SET archived=1,updated_at=? WHERE id=?').run(this.clock.now(), uuidSchema.parse(chatId)).changes) throw new Error('R3_NOT_FOUND');
  }
}
