import { describe, expect, it } from 'vitest';
import { shouldAdvance } from '../src/workspace/observe-workspace.js';

describe('workspace observation state', () => {
  it('invalidates confidence when an observation becomes incomplete', () => {
    expect(shouldAdvance(
      { fingerprint: 'x', gitIdentity: null, complete: true },
      { fingerprint: 'x', gitIdentity: null, complete: false }
    )).toBe(true);
  });

  it('keeps a stable complete observation at the same revision input', () => {
    expect(shouldAdvance(
      { fingerprint: 'x', gitIdentity: 'git-root', complete: true },
      { fingerprint: 'x', gitIdentity: 'git-root', complete: true }
    )).toBe(false);
  });
});
