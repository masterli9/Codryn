import type { JsonValue } from '@codryn/shared';

export function safeToolAudit(toolId: string, input: unknown): JsonValue {
  if (toolId !== 'file.patch') return { inputRecorded: false };
  if (typeof input !== 'object' || input === null) return { inputRecorded: false };
  return { inputRecorded: false, operation: 'targeted_patch' };
}
