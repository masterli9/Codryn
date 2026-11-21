import { ContextAssemblyFailure } from '@codryn/core';
import type { WorkspaceSnapshot } from '@codryn/core';
import type { ModelRequest, ModelToolCall, ModelTurn, ToolResult } from '@codryn/shared';
import { typescriptQueryOutputSchema } from '@codryn/shared';
import type { ContextPathPolicy } from '../filesystem/context-path-policy.js';
import { readReferenceIdentity } from './reference-identity.js';

const sourceTools = new Set(['file.read', 'text.search', 'typescript.query']);
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
type ContextStamp = Pick<WorkspaceSnapshot, 'complete'|'fingerprint'|'watcherGeneration'>;
function sameWorkspace(left: ContextStamp, right: ContextStamp): boolean {
  return left.complete && right.complete && left.fingerprint === right.fingerprint
    && left.watcherGeneration === right.watcherGeneration;
}
function emptyWorkerFailure(result: ToolResult): boolean {
  if(!result.ok)return false;
  const parsed=typescriptQueryOutputSchema.safeParse(result.output);
  if(!parsed.success)return false;
  const output=parsed.data;
  return output.status==='limited' && output.mode==='fallback' && output.items.length===0
    && output.targetHash===null && output.policyRevision===null && !output.truncated
    && (output.reason==='worker_failed'||output.reason==='worker_timeout'||output.reason==='cancelled');
}

/** Revalidates previously obtained data. It never executes a model tool. */
export class ModelTurnFreshness {
  private readonly searches = new Map<string, ContextStamp | null>();
  private readonly invalidatedResultIds = new Set<string>();
  private redactedHistoryLength = 0;
  private revision: string | null = null;
  private first = true;
  private allowPriorConversation = true;
  private contextIdentity: string | null = null;
  constructor(private readonly root: string, private readonly policy: ContextPathPolicy,
    private readonly observe: (signal: AbortSignal) => Promise<WorkspaceSnapshot>) {}
  initializePolicy(revision: string): void {
    this.revision ??= revision;
  }
  recordSearch(callId: string, before: WorkspaceSnapshot, after: WorkspaceSnapshot): void {
    this.searches.set(callId, sameWorkspace(before, after) ? {
      complete:after.complete,fingerprint:after.fingerprint,...(after.watcherGeneration===undefined?{}:{watcherGeneration:after.watcherGeneration})
    } : null);
  }
  async refresh(request: ModelRequest, signal: AbortSignal): Promise<ModelRequest> {
    const policyRevision = await this.policy.refresh();
    const policyChanged = this.revision !== null && policyRevision !== this.revision;
    if(policyChanged)this.allowPriorConversation=false;
    const before = await this.observe(signal);
    const history = request.history ?? [];
    const calls = new Map(history.flatMap(turn => turn.kind === 'assistant' ? turn.calls.map(call => [call.callId, call] as const) : []));
    const staleIds = new Set<string>();
    const safeDiagnostics = new Set<string>();
    let recoveredStaleMarker=false;
    for (const [index,turn] of history.entries()) {
      if (turn.kind !== 'tool' || !this.isStaleMarker(turn.result)) continue;
      const call = calls.get(turn.result.callId);
      if (call && call.toolId!=='ask_user') {
        recoveredStaleMarker=true;
        this.redactedHistoryLength=Math.max(this.redactedHistoryLength,index+1);
        this.invalidatedResultIds.add(call.callId);
      }
    }
    for (const [index,turn] of history.entries()) {
      if (turn.kind !== 'tool') continue;
      const call = calls.get(turn.result.callId);
      if (!call || call.toolId === 'ask_user') continue;
      if (index < this.redactedHistoryLength && sourceTools.has(call.toolId)) {
        if(call.toolId==='typescript.query'&&emptyWorkerFailure(turn.result))safeDiagnostics.add(call.callId);
        continue;
      }
      if(call.toolId==='typescript.query'&&emptyWorkerFailure(turn.result)){
        safeDiagnostics.add(call.callId);continue;
      }
      const output = turn.result.ok ? object(turn.result.output) : {};
      if (policyChanged) staleIds.add(call.callId);
      else if (call.toolId === 'file.read' && turn.result.ok) {
        const path = object(call.arguments).path;
        if (typeof path !== 'string' || !this.policy.decide(path, 'context', { kind: 'file' }).allowed
          || typeof output.contentHash !== 'string' || before.inputHashes?.[path] !== output.contentHash) staleIds.add(call.callId);
      } else if (call.toolId === 'text.search' && turn.result.ok) {
        const evidence = this.searches.get(call.callId);
        if (!evidence || !sameWorkspace(evidence, before)) staleIds.add(call.callId);
      } else if (call.toolId === 'typescript.query' && turn.result.ok) {
        if (!before.complete || output.revision !== before.revision || output.policyRevision !== policyRevision) staleIds.add(call.callId);
      }
    }
    const context: ModelRequest['context'] = [];
    let contextInvalidated=false;
    for (const source of request.context) {
      // A confirmed exception authorizes its initial assembly only. Later turns
      // reassemble under current policy and never reuse the consumed permit.
      const decision=this.policy.decide(source.path,'explicit_file',{kind:'file'});
      const initiallyPermitted = this.first && !policyChanged && source.reason === 'loaded_excerpt' && !decision.allowed && decision.permit;
      if (source.reason === 'directory_reference' || initiallyPermitted) {
        const identity = await readReferenceIdentity(this.root, source.path, this.policy, initiallyPermitted?'explicit_file':'context', signal,
          initiallyPermitted?{allow:initiallyPermitted}:undefined);
        if (identity.status === 'ready' && identity.reference.contentHash === source.contentHash) context.push(source);
        else contextInvalidated=true;
      } else if (this.policy.decide(source.path, 'context', {kind:'file'}).allowed
        && before.inputHashes?.[source.path] === source.contentHash) context.push(source);
      else contextInvalidated=true;
    }
    const after = await this.observe(signal);
    const raced = before.fingerprint!==after.fingerprint || before.watcherGeneration!==after.watcherGeneration;
    if (await this.policy.refresh() !== policyRevision) throw new ContextAssemblyFailure('R4_CONTEXT_POLICY_CHANGED');
    if (raced) for (const call of calls.values()) if (sourceTools.has(call.toolId)&&!safeDiagnostics.has(call.callId)) staleIds.add(call.callId);
    for(const callId of staleIds)this.invalidatedResultIds.add(callId);
    const contextIdentity=JSON.stringify(context.map(source=>[source.path,source.contentHash,source.reason]));
    const contextChanged=this.contextIdentity!==null&&this.contextIdentity!==contextIdentity;
    const stale = policyChanged || contextChanged || raced || staleIds.size > 0 || context.length !== request.context.length;
    const sourceInvalidated=recoveredStaleMarker||staleIds.size>0||contextInvalidated
      || (policyChanged&&Boolean(request.priorConversation?.length))
      || (stale&&[...calls.values()].some(call=>sourceTools.has(call.toolId)));
    if (sourceInvalidated) this.allowPriorConversation=false;
    if (stale) this.redactedHistoryLength=Math.max(this.redactedHistoryLength,history.length);
    const cleaned: ModelTurn[] = history.map((turn,index) => {
      if (turn.kind === 'assistant') return {
        ...turn,
        ...(index < this.redactedHistoryLength ? {text:''} : {}),
        calls: turn.calls.map(call => index < this.redactedHistoryLength || call.toolId==='file.patch'
          ? {...call,arguments:{historical:true}} : call)
      };
      return this.invalidatedResultIds.has(turn.result.callId)
        ? {kind:'tool',result:this.staleResult(turn.result,calls.get(turn.result.callId),policyChanged)} : turn;
    });
    this.revision = policyRevision;
    this.first = false;
    this.contextIdentity = raced ? '[]' : contextIdentity;
    const {priorConversation,...base} = request;
    return { ...base, context: raced ? [] : context, history: cleaned,
      previousToolResults: cleaned.flatMap(turn => turn.kind === 'tool' ? [turn.result] : []),
      ...(this.allowPriorConversation && priorConversation ? {priorConversation} : {}) };
  }
  private isStaleMarker(result: ToolResult): boolean {
    if (!result.ok) return false;
    const output=object(result.output);
    return output.status==='stale';
  }
  private staleResult(result: ToolResult, call: ModelToolCall | undefined, policyChanged: boolean): ToolResult {
    return { ok:true,callId:result.callId,output:{status:'stale',reason:policyChanged?'policy_changed':'source_changed_or_unproven',
      toolId:call?.toolId??'unknown',...(call&&sourceTools.has(call.toolId)?{needsFreshRead:true}:{needsFreshExecution:true})} };
  }
}
