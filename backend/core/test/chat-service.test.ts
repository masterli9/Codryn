import { expect, it } from 'vitest';
import { ChatService } from '../src/desktop/chat-service.js';
import type { ChatStore } from '../src/desktop/ports.js';
import type { R3Chat, R3Project } from '@codryn/shared';

const projectA = '11111111-1111-4111-8111-111111111111';
const projectB = '22222222-2222-4222-8222-222222222222';
const chatId = '33333333-3333-4333-8333-333333333333';
it('rejects cross-project mutation before changing the stored chat', async () => {
  let chat: R3Chat = { id: chatId, projectId: projectB, title: 'Original', archived: false, createdAt: '2026-10-11T10:00:00Z' };
  const chats: ChatStore = { create: async () => chat, list: async () => [chat], get: async () => chat, rename: async (_id, title) => { chat = { ...chat, title }; }, archive: async () => { chat = { ...chat, archived: true }; } };
  const project: R3Project = { id: projectA, displayName: 'A', available: true, mode: 'non-git', limitations: [] };
  const service = new ChatService({ chats, projects: { get: async () => project } });
  await expect(service.rename(projectA, chatId, 'Changed')).rejects.toThrow('R3_CHAT_PROJECT_MISMATCH');
  await expect(service.archive(projectA, chatId)).rejects.toThrow('R3_CHAT_PROJECT_MISMATCH');
  expect(chat.title).toBe('Original');
  expect(chat.archived).toBe(false);
});
it('normalizes names, returns persisted rename and rejects missing projects', async () => {
  let chat: R3Chat = { id: chatId, projectId: projectA, title: 'Old', archived: false, createdAt: '2026-10-11T10:00:00Z' };
  const chats: ChatStore = { create: async () => chat, list: async () => [chat], get: async () => chat, rename: async (_id, title) => { chat = { ...chat, title }; }, archive: async () => undefined };
  const service = new ChatService({ chats, projects: { get: async (id) => id === projectA ? { id, displayName: 'A', available: true, mode: 'non-git', limitations: [] } : null } });
  expect((await service.rename(projectA, chatId, ' New ')).title).toBe('New');
  await expect(service.create(projectB, 'x')).rejects.toThrow('R3_NOT_FOUND');
  await expect(service.create(projectA, ' ')).rejects.toThrow('R3_INPUT_INVALID');
});
