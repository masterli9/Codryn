import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { selectConversationContext } from '../src/desktop/conversation-context.js';

const pair = (user: string, assistant = 'odpověď') => ({
  user: { id: randomUUID(), text: user }, assistant: { id: randomUUID(), text: assistant }
});

it('selects eight newest pairs and emits chronological text and message IDs', () => {
  const pairs = Array.from({ length: 9 }, (_, index) => pair(String(index)));
  const expected = pairs.slice(0, 8).reverse();
  expect(selectConversationContext(pairs)).toMatchObject({
    messages: expected.flatMap(({ user, assistant }) => [{ role: 'user', text: user.text }, { role: 'assistant', text: assistant.text }]),
    messageIds: expected.flatMap(({ user, assistant }) => [user.id, assistant.id]), truncated: true, reason: 'count_limit'
  });
});

it('uses UTF-8 lengths and stops at the first pair that cannot fit', () => {
  const latest = pair('ě'.repeat(16_383), 'ok');
  const result = selectConversationContext([latest, pair('block'), pair('tiny')]);
  expect(result).toMatchObject({ byteLength: 32_768, messageIds: [latest.user.id, latest.assistant.id], truncated: true, reason: 'byte_limit' });
});

it('omits all pairs when the newest one exceeds the byte budget', () => {
  expect(selectConversationContext([pair('😀'.repeat(8192)), pair('older')])).toEqual({
    messages: [], messageIds: [], byteLength: 0, truncated: true, reason: 'oversized_latest'
  });
});

it('rejects malformed and duplicate IDs even in a candidate outside the byte budget', () => {
  const latest = pair('😀'.repeat(8192));
  expect(() => selectConversationContext([latest, { ...pair('older'), assistant: latest.assistant }])).toThrow();
  expect(() => selectConversationContext([{ ...latest, user: { ...latest.user, id: 'invalid' } }])).toThrow();
});
