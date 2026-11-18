import { createHash } from 'node:crypto';
import { assembleR4Context } from '@codryn/core';
import type { ConversationSelection } from '@codryn/core';
import { r4ReferencePathSchema } from '@codryn/shared';
import type { R3SubmitInput, R4ContextAuditSource } from '@codryn/shared';
import type { R3InfrastructureResources } from '../create-r3-infrastructure.js';
import { ContextPathPolicyError } from '../filesystem/context-path-policy.js';
import { requireReadyReferences } from './reference-resolver.js';

type Resources = Pick<R3InfrastructureResources, 'references' | 'repoMap' | 'recordContextAudit'>;

export async function prepareDesktopContext(options: Resources, input: R3SubmitInput, projectId: string, root: string, runId: string, safe: (text: string) => string, signal: AbortSignal, prior: ConversationSelection, step = 1) {
  const task = input.task;
  const selected = input.references ?? [];
  const paths = selected.map(item => item.path);
  const safePath = (path: string) => r4ReferencePathSchema.safeParse(path).success && safe(path) === path;
  const blockedAudit = (reason: string, references: readonly R4ContextAuditSource[] = selected.map(item => ({
    source: 'project_reference', path: item.path, hash: item.contentHash, bytes: 0, status: 'omitted', reason
  }))) => options.recordContextAudit(input.requestId, runId, [
    { source: 'user_text', sourceId: input.requestId, bytes: 0, status: 'omitted', reason }, ...references
  ], step);
  let result: ReturnType<typeof assembleR4Context>;
  let referenceOmissions: R4ContextAuditSource[] = [];
  try {
    const [map, rules] = await Promise.all([
      options.repoMap.deepen(projectId, task, paths, signal),
      options.repoMap.instructions(projectId, signal, paths)
    ]);
    const resolved = await options.references.resolve(root, input, signal, step === 1);
    const failed = resolved.results.some(item => item.status !== 'ready');
    if(step>1)referenceOmissions=resolved.results.flatMap(item=>item.status==='ready'?[]:[{
      source:'project_reference',path:item.selected.path,hash:item.selected.contentHash,bytes:0,status:'omitted',reason:item.status
    }]);
    if (failed && step === 1) {
      await blockedAudit('blocked_reference', resolved.results.map(item => ({
        source: 'project_reference', path: item.selected.path, hash: item.selected.contentHash, bytes: 0,
        status: 'omitted', reason: item.status === 'ready' ? 'blocked_reference' : item.status
      })));
      requireReadyReferences(resolved.results);
    }
    const currentMap = map.policyRevision === resolved.policyRevision;
    const mapOmissions: R4ContextAuditSource[] = map.omitted.slice(0, 24).map(item => ({
      source: 'repo_map', bytes: 0, status: 'omitted', reason: item.reason,
      ...(item.path !== null && safePath(item.path) ? { path: item.path } : {})
    }));
    if (!currentMap && map.items.length) mapOmissions.push({ source: 'repo_map', bytes: 0, status: 'omitted', reason: 'policy_changed' });
    const mapStatus = options.repoMap.statusIfOpen(projectId);
    if (mapStatus?.state !== 'ready') {
      const reason = mapStatus?.state === 'indexing' ? 'map_building' : mapStatus?.reason ?? 'unavailable';
      if (!mapOmissions.some(item => item.reason === reason)) mapOmissions.push({ source: 'repo_map', bytes: 0, status: 'omitted', reason });
    }
    const priorConversationAudit: R4ContextAuditSource[] = prior.messages.map(({ text }, index) => ({
      source: 'chat_history', sourceId: prior.messageIds[index], hash: createHash('sha256').update(text).digest('hex'),
      bytes: Buffer.byteLength(text), status: 'used'
    }));
    if (prior.truncated) priorConversationAudit.push({ source: 'chat_history', bytes: 0, status: 'omitted', reason: prior.reason });
    result = assembleR4Context({
      task, history: [], mapOmissions, priorConversationAudit,
      projectRules: rules.filter(item => item.policyRevision === resolved.policyRevision && safePath(item.path))
        .map(item => ({ path: item.path, hash: item.contentHash, content: safe(item.text), truncated: item.truncated })),
      references: resolved.results.flatMap(item => {
        if (item.status !== 'ready') return [];
        const { path, kind, contentHash } = item.reference;
        const children = item.children ?? [];
        const summary = children.slice(0, 80).map(child => `${child.kind} ${child.path}`).join('\n');
        return [{ path, kind, hash: contentHash, content: safe(item.bytes?.toString('utf8') ?? summary), truncated: children.length > 80 }];
      }),
      map: currentMap ? map.items.filter(item => safePath(item.path)).map(item => ({
        path: item.path, hash: item.contentHash, content: safe(JSON.stringify({ kind: item.kind, role: item.role, symbols: item.symbols, imports: item.imports }))
      })) : []
    });
  } catch (error) {
    if (error instanceof ContextPathPolicyError || signal.aborted) {
      await blockedAudit(signal.aborted ? 'cancelled' : 'policy_invalid');
    }
    throw error;
  }
  result.audit.push(...referenceOmissions);
  await options.recordContextAudit(input.requestId, runId, result.audit, step);
  return result.modelContent;
}
