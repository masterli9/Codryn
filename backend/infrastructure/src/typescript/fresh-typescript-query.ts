import type { WorkspaceSnapshot } from '@codryn/core';
import type { TypeScriptQueryInput } from '@codryn/shared';
import { ContextPathPolicy, ContextPathPolicyError } from '../filesystem/context-path-policy.js';
import { readReferenceIdentity } from '../context/reference-identity.js';
import type { TypeScriptQueryRunner } from './typescript-query-client.js';
import { emptyTypeScriptQuery } from './typescript-query-result.js';

export function freshTypeScriptQuery(root: string, runner: TypeScriptQueryRunner, observe: (signal: AbortSignal) => Promise<WorkspaceSnapshot>) {
  return async (input: TypeScriptQueryInput, signal: AbortSignal) => {
    let revision = 0;
    try {
      const policy = await ContextPathPolicy.fromProjectRoot(root);
      const first = await readReferenceIdentity(root, input.path, policy, 'typescript_index', signal);
      const before = await observe(signal);
      revision = before.revision;
      if (first.status !== 'ready' || first.reference.kind !== 'file') return emptyTypeScriptQuery(revision, 'target_unavailable', 'unsupported');
      if (!before.complete || before.inputHashes?.[input.path] !== first.reference.contentHash ||
        before.inputHashes['@policy'] !== first.reference.policyRevision) return emptyTypeScriptQuery(revision, 'workspace_incomplete');
      const result = await runner.query(root, input, revision, signal);
      signal.throwIfAborted();
      const after = await observe(signal);
      const last = await readReferenceIdentity(root, input.path, policy, 'typescript_index', signal);
      if (after.revision !== revision || after.fingerprint !== before.fingerprint || after.watcherGeneration !== before.watcherGeneration ||
        last.status !== 'ready' || first.reference.policyRevision !== last.reference.policyRevision ||
        first.reference.contentHash !== last.reference.contentHash) return emptyTypeScriptQuery(after.revision, 'workspace_changed', 'stale');
      if (!after.complete) return emptyTypeScriptQuery(after.revision, 'workspace_incomplete');
      if (result.revision !== revision || (result.targetHash !== null && result.targetHash !== first.reference.contentHash) ||
        (result.policyRevision !== null && result.policyRevision !== first.reference.policyRevision)) return emptyTypeScriptQuery(revision, 'workspace_changed', 'stale');
      return result;
    } catch (error) {
      if (signal.aborted) return emptyTypeScriptQuery(revision, 'cancelled');
      if (error instanceof ContextPathPolicyError) return emptyTypeScriptQuery(revision, 'policy_invalid', 'unsupported');
      return emptyTypeScriptQuery(revision, 'worker_failed');
    }
  };
}
