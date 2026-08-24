import { isR1SensitiveRelativePath } from '@codryn/core';

export interface SensitivePathDecision {
  readonly allowed: boolean;
  readonly code?: 'R1_PATH_SENSITIVE';
  readonly reason?: string;
}

export function decideSensitivePath(relativePath: string): SensitivePathDecision {
  if (isR1SensitiveRelativePath(relativePath)) return { allowed: false, code: 'R1_PATH_SENSITIVE', reason: 'Path has a fixed sensitive name or directory.' };
  return { allowed: true };
}
