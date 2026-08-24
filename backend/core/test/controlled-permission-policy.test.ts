import { describe, expect, it } from 'vitest';
import { ControlledPermissionPolicy } from '../src/index.js';

describe('ControlledPermissionPolicy', () => {
  it('allows only validated safe project reads through the explicit R1 rule', () => {
    const policy = new ControlledPermissionPolicy();
    expect(policy.decide({ risk: 'read_project', pathEvidence: { path: 'README.md', withinProject: true, sensitive: false } })).toEqual({
      result: 'allowed_by_rule', ruleId: 'R1_SAFE_READ_WITHIN_PROJECT', reason: 'Validated read-only path is within the open project.'
    });
  });

  it.each([
    { risk: 'unknown', pathEvidence: { path: 'README.md', withinProject: true, sensitive: false } },
    { risk: 'read_project', pathEvidence: { path: 'README.md', withinProject: true, sensitive: false, unvalidated: true } },
    { risk: 'read_project', pathEvidence: { path: '', withinProject: true, sensitive: false } },
    { risk: 'read_project', pathEvidence: { path: 'outside.txt', withinProject: false, sensitive: false } },
    { risk: 'read_project', pathEvidence: { path: '.env', withinProject: true, sensitive: true } }
  ])('denies unknown or unsafe evidence: %#', (input) => {
    expect(new ControlledPermissionPolicy().decide(input)).toEqual({
      result: 'denied', ruleId: 'R1_PERMISSION_DENIED', reason: 'Read permission requires validated non-sensitive project path evidence.'
    });
  });
});
