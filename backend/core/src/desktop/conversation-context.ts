import { maxPriorConversationBytes, maxPriorConversationMessages, uuidSchema } from '@codryn/shared';
import type { PriorConversationMessage, Uuid } from '@codryn/shared';

interface ConversationMessage { id: Uuid; text: string }
export interface ConversationPair { user: ConversationMessage; assistant: ConversationMessage }
export interface ConversationSelection {
  messages: PriorConversationMessage[];
  messageIds: Uuid[];
  byteLength: number;
  truncated: boolean;
  reason: 'none' | 'count_limit' | 'byte_limit' | 'oversized_latest';
}

export function selectConversationContext(pairs: readonly ConversationPair[]): ConversationSelection {
  const ids = new Set<Uuid>(), selected: ConversationPair[] = [];
  let byteLength = 0;
  let reason: ConversationSelection['reason'] = 'none';
  for (const pair of pairs) {
    for (const message of [pair.user, pair.assistant]) {
      if (!uuidSchema.safeParse(message.id).success || ids.has(message.id) || typeof message.text !== 'string' || !message.text.length) {
        throw new Error('Invalid conversation message.');
      }
      ids.add(message.id);
    }
    if (reason !== 'none') continue;
    if (selected.length === maxPriorConversationMessages / 2) {
      reason = 'count_limit';
      continue;
    }
    const bytes = Buffer.byteLength(pair.user.text) + Buffer.byteLength(pair.assistant.text);
    if (byteLength + bytes > maxPriorConversationBytes) {
      reason = selected.length === 0 ? 'oversized_latest' : 'byte_limit';
      continue;
    }
    selected.push(pair);
    byteLength += bytes;
  }
  selected.reverse();
  return {
    messages: selected.flatMap(pair => [{ role: 'user', text: pair.user.text }, { role: 'assistant', text: pair.assistant.text }]),
    messageIds: selected.flatMap(pair => [pair.user.id, pair.assistant.id]),
    byteLength, truncated: reason !== 'none', reason
  };
}
