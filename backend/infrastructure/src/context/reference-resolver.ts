import { realpath } from 'node:fs/promises';
import type { R4Reference } from '@codryn/shared';
import { ContextPathPolicy } from '../filesystem/context-path-policy.js';
import { readReferenceIdentity } from './reference-identity.js';
import type { ReferenceIdentity } from './reference-identity.js';

interface ReferenceInput { requestId: string; chatId?: string; references?: readonly R4Reference[] | undefined }
interface PermitInput { requestId: string; chatId: string; path: string; kind: 'ignored' | 'sensitive' }
interface Permit extends PermitInput { root: string; reference: R4Reference; expiresAt: number }
export type ResolvedReference = ReferenceIdentity & { selected: R4Reference };
export class ReferencePreparationFailure extends Error {
  readonly code = 'R1_CONTEXT_REFERENCE_INVALID';
  constructor(message: string) {
    super(message);
    this.name = 'ReferencePreparationFailure';
  }
}

export function requireReadyReferences(results: readonly ResolvedReference[]): void {
  const blocked = results.find(result => result.status !== 'ready');
  if (blocked) {
    throw new ReferencePreparationFailure(`${blocked.selected.path}: ${blocked.reason}`);
  }
}
const maxPermits = 100;
const permitLifetime = 10 * 60 * 1000;

export class ReferenceResolver {
  private readonly permits = new Map<string, Permit>();

  async grant(root: string, input: PermitInput, signal: AbortSignal): Promise<R4Reference> {
    if (await realpath(root) !== root) throw new Error('R3_PROJECT_UNAVAILABLE');
    const policy = await ContextPathPolicy.fromProjectRoot(root);
    const initial = await readReferenceIdentity(root, input.path, policy, 'context', signal);
    if (initial.status !== input.kind) throw new Error('R4_REFERENCE_PERMIT_INVALID');
    const allowed = await readReferenceIdentity(root, input.path, policy, 'explicit_file', signal, { allow: input.kind });
    if (allowed.status !== 'ready' || allowed.reference.kind !== 'file' || allowed.reference.policyRevision !== policy.revision) {
      throw new Error('R4_REFERENCE_PERMIT_INVALID');
    }
    const now = Date.now();
    for (const [id, permit] of this.permits) if (permit.expiresAt < now) this.permits.delete(id);
    if (this.permits.size >= maxPermits && !this.permits.has(input.requestId)) throw new Error('R4_REFERENCE_PERMIT_INVALID');
    this.permits.set(input.requestId, { ...input, root, reference: allowed.reference, expiresAt: now + permitLifetime });
    return allowed.reference;
  }

  async resolve(root: string, input: ReferenceInput, signal: AbortSignal, consume = false): Promise<{ results: ResolvedReference[]; policyRevision: string }> {
    signal.throwIfAborted();
    if (await realpath(root) !== root) throw new Error('R3_PROJECT_UNAVAILABLE');
    const policy = await ContextPathPolicy.fromProjectRoot(root);
    const revision = policy.revision, results: ResolvedReference[] = [];
    const permit = this.permits.get(input.requestId);
    const valid = permit?.chatId === input.chatId && permit?.root === root && permit.expiresAt >= Date.now() ? permit : undefined;
    if (consume && valid) this.permits.delete(input.requestId);
    for (const selected of input.references ?? []) {
      const allowed = valid?.path === selected.path && valid.reference.contentHash === selected.contentHash &&
        valid.reference.policyRevision === selected.policyRevision ? valid.kind : undefined;
      const current = allowed === undefined
        ? await readReferenceIdentity(root, selected.path, policy, 'context', signal)
        : await readReferenceIdentity(root, selected.path, policy, 'explicit_file', signal, { allow: allowed });
      const checked = current.status === 'ready' && (
        selected.kind !== current.reference.kind || selected.contentHash !== current.reference.contentHash ||
        selected.policyRevision !== current.reference.policyRevision
      ) ? changed() : current;
      results.push({ ...checked, selected });
    }
    if (await policy.refresh() !== revision) return {
      results: results.map(result => ({ ...changed(), selected: result.selected })), policyRevision: policy.revision
    };
    return { results, policyRevision: revision };
  }
}

function changed() {
  return { status: 'changed' as const, reason: 'Obsah, druh nebo pravidla projektu se změnily. Vyberte referenci znovu.' };
}
