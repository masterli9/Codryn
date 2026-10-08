import { describe, expect, it } from 'vitest';
import { canComplete } from '../src/agent/r2-completion.js';

describe('R2 completion', () => {
  it('does not let final model text override stale verification', () => {
    expect(canComplete({ changed: true, verification: 'stale', recoveryRequired: false, pending: false })).toBe(false);
  });

  it('requires a verified changed workspace without pending effects', () => {
    expect(canComplete({ changed: true, verification: 'verified', recoveryRequired: false, pending: false })).toBe(true);
    expect(canComplete({ changed: false, verification: 'verified', recoveryRequired: false, pending: false })).toBe(false);
    expect(canComplete({ changed: true, verification: 'verified', recoveryRequired: true, pending: false })).toBe(false);
  });
});
