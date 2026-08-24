import type { ToolRisk } from './tool-registry.js';
import { z } from 'zod';

export interface PermissionDecision {
  readonly result: 'allowed_by_rule' | 'denied';
  readonly ruleId: 'R1_SAFE_READ_WITHIN_PROJECT' | 'R1_PERMISSION_DENIED';
  readonly reason: string;
}

export interface PermissionInput {
  readonly risk: ToolRisk | string;
  readonly pathEvidence: { readonly path: string; readonly withinProject: boolean; readonly sensitive: boolean } | unknown;
}

const denied: PermissionDecision = Object.freeze({
  result: 'denied',
  ruleId: 'R1_PERMISSION_DENIED',
  reason: 'Read permission requires validated non-sensitive project path evidence.'
});

const permissionInputSchema = z.object({
  risk: z.literal('read_project'),
  pathEvidence: z.object({ path: z.string().min(1), withinProject: z.literal(true), sensitive: z.literal(false) }).strict()
}).strict();

export class ControlledPermissionPolicy {
  decide(input: PermissionInput): PermissionDecision {
    if (!permissionInputSchema.safeParse(input).success) return denied;
    return {
      result: 'allowed_by_rule',
      ruleId: 'R1_SAFE_READ_WITHIN_PROJECT',
      reason: 'Validated read-only path is within the open project.'
    };
  }
}
