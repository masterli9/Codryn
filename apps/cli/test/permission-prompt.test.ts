import { describe, expect, it } from 'vitest';
import { formatPermissionPrompt, parsePermissionAnswer } from '../src/permission-prompt.js';

describe('permission prompt', () => {
  it('requires an explicit allow answer and shows the exact safe command', () => {
    const view = {
      id: '40000000-0000-4000-8000-000000000401',
      callId: '40000000-0000-4000-8000-000000000402',
      digest: 'a'.repeat(64),
      command: { executable: 'node', args: ['--test', 'sum.test.mjs'], cwd: 'C:\\project', timeoutMs: 30_000, maxOutputBytes: 1024 },
      reason: 'Run the project test.',
      impact: 'The process may read project files.',
      state: 'pending' as const
    };
    expect(formatPermissionPrompt(view)).toContain('node --test sum.test.mjs');
    expect(parsePermissionAnswer('')).toBe('deny');
    expect(parsePermissionAnswer('yes')).toBe('allow_once');
    expect(parsePermissionAnswer('allow')).toBe('allow_once');
    expect(parsePermissionAnswer('no')).toBe('deny');
  });
});
