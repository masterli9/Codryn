import type { TypeScriptQueryOutput } from '@codryn/shared';

export function emptyTypeScriptQuery(revision: number, reason: NonNullable<TypeScriptQueryOutput['reason']>, status: TypeScriptQueryOutput['status'] = 'limited'): TypeScriptQueryOutput {
  return { status, mode: 'fallback', revision, targetHash: null, policyRevision: null, items: [], truncated: false, reason };
}
