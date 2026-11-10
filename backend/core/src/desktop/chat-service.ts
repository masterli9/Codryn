import { r3TitleSchema, uuidSchema } from '@codryn/shared';
import type { R3Chat, R3Project, Uuid } from '@codryn/shared';
import type { ChatStore } from './ports.js';
export class ChatService {
  constructor(private readonly dependencies: { chats: ChatStore; projects: { get(id: Uuid): Promise<R3Project | null> } }) {}
  private async project(id: Uuid): Promise<void> {
    if (!uuidSchema.safeParse(id).success) throw new Error('R3_INPUT_INVALID');
    if (!await this.dependencies.projects.get(id)) throw new Error('R3_NOT_FOUND');
  }
  private title(title: string): string {
    const parsed = r3TitleSchema.safeParse(title);
    if (!parsed.success) throw new Error('R3_INPUT_INVALID');
    return parsed.data;
  }
  private async owned(projectId: Uuid, chatId: Uuid): Promise<R3Chat> {
    await this.project(projectId);
    if (!uuidSchema.safeParse(chatId).success) throw new Error('R3_INPUT_INVALID');
    const chat = await this.dependencies.chats.get(chatId);
    if (!chat) throw new Error('R3_NOT_FOUND');
    if (chat.projectId !== projectId) throw new Error('R3_CHAT_PROJECT_MISMATCH');
    return chat;
  }
  async create(projectId: Uuid, title: string): Promise<R3Chat> { await this.project(projectId); return this.dependencies.chats.create(projectId, this.title(title)); }
  async list(projectId: Uuid, archived: boolean): Promise<readonly R3Chat[]> { await this.project(projectId); return this.dependencies.chats.list(projectId, archived); }
  async rename(projectId: Uuid, chatId: Uuid, title: string): Promise<R3Chat> { await this.owned(projectId, chatId); await this.dependencies.chats.rename(chatId, this.title(title)); return this.owned(projectId, chatId); }
  async archive(projectId: Uuid, chatId: Uuid): Promise<void> { await this.owned(projectId, chatId); await this.dependencies.chats.archive(chatId); }
}
