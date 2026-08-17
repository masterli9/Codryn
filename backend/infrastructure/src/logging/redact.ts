import type { JsonValue } from '@codryn/shared';

export interface RedactionPolicy {
  readonly sensitiveRoots: readonly string[];
}

const sensitiveKeyPattern = /token|password|secret|authorization|credential|api[-_]?key/i;
const bearerPattern = /Bearer\s+[^\s]+/gi;

function redactString(value: string, policy: RedactionPolicy): string {
  let redacted = value.replace(bearerPattern, 'Bearer <redacted>');
  for (const root of policy.sensitiveRoots) {
    if (root.length > 0) redacted = redacted.replaceAll(root, '<redacted-path>');
  }
  return redacted;
}

export function redactLogValue(value: JsonValue, policy: RedactionPolicy): JsonValue {
  if (typeof value === 'string') return redactString(value, policy);
  if (Array.isArray(value)) return value.map((item) => redactLogValue(item, policy));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      sensitiveKeyPattern.test(key) ? '<redacted>' : redactLogValue(item, policy)
    ]));
  }
  return value;
}
