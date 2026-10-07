import { describe, expect, it } from 'vitest';
import { safeToolAudit } from '../src/tools/safe-tool-audit.js';

describe('safeToolAudit', () => {
  it('does not persist raw source text or unexpected secrets', () => {
    const input = {
      path: 'src/a.ts',
      oldText: 'SECRET_CANARY_42',
      newText: 'source',
      apiKey: 'SECRET_CANARY_42'
    };
    expect(JSON.stringify(safeToolAudit('file.patch', input))).not.toContain('SECRET_CANARY_42');
    expect(safeToolAudit('unknown.tool', input)).toEqual({ inputRecorded: false });
  });
});
