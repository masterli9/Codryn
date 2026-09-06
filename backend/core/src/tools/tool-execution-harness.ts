import type { EventEnvelope, JsonValue, ModelToolCall, ToolResult, Uuid } from '@codryn/shared';
import type { Clock, IdGenerator } from '../diagnostics/ports.js';
import type { ToolCallStore, ToolExecutionContext } from '../agent/ports.js';
import { R1PersistenceFailure } from '../agent/model.js';
import type { ControlledPermissionPolicy } from './controlled-permission-policy.js';
import { ToolRegistryFailure } from './tool-registry.js';
import type { ToolRegistry, ToolDefinition } from './tool-registry.js';
import { safeToolAudit } from './safe-tool-audit.js';
import type { ToolCallState } from '../state/tool-call.js';
import type { PermissionResponder } from '../agent/ports.js';
import type { PermissionService } from '../permissions/permission-service.js';

export interface ToolExecutionHarnessDependencies {
  readonly registry: ToolRegistry;
  readonly permissionPolicy: ControlledPermissionPolicy;
  readonly toolCallStore: ToolCallStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly permissionService?: PermissionService;
  readonly permissionResponder?: PermissionResponder;
}

const messages = Object.freeze({
  R1_TOOL_UNKNOWN: 'Tool is not registered.',
  R1_TOOL_INPUT_INVALID: 'Tool input is invalid.',
  R1_TOOL_PERMISSION_DENIED: 'Tool permission was denied.',
  R1_TOOL_OUTPUT_INVALID: 'Tool output is invalid.',
  R1_TOOL_EXECUTION_FAILED: 'Tool execution failed.',
  R1_CANCELLED: 'Tool execution cancelled.',
  R1_PERSISTENCE_FAILED: 'Tool execution could not be persisted.',
  R2_TOOL_CONTEXT_INVALID: 'Tool execution context is invalid.',
  R2_PERMISSION_PENDING: 'Tool permission is pending.',
  R2_PERMISSION_CLAIM_FAILED: 'Tool permission could not be claimed.',
  R2_RECOVERY_REQUIRED: 'Tool execution requires recovery.'
});
type HarnessCode = keyof typeof messages;

function failed(callId: Uuid, code: HarnessCode): ToolResult {
  return { ok: false, callId, error: { code, message: messages[code] } };
}

function safeResult(result: ToolResult): JsonValue {
  return result.ok
    ? { ok: true, outputType: Array.isArray(result.output) ? 'array' : typeof result.output }
    : { ok: false, code: result.error.code };
}

function pathEvidence(input: unknown): { readonly path: string; readonly withinProject: boolean; readonly sensitive: boolean } | undefined {
  if (typeof input !== 'object' || input === null || !Object.hasOwn(input, 'path')) return undefined;
  const candidate = input as { readonly path: unknown };
  if (typeof candidate.path !== 'string') return undefined;
  const path = candidate.path;
  const leaf = path.replaceAll('\\', '/').split('/').at(-1)?.toLowerCase() ?? '';
  return { path, withinProject: true, sensitive: leaf === '.env' || leaf.startsWith('.env.') || leaf.includes('credential') || leaf.includes('private_key') };
}

export class ToolExecutionHarness {
  constructor(private readonly dependencies: ToolExecutionHarnessDependencies) {}

  async execute(call: ModelToolCall, runId: Uuid, signal: AbortSignal, context?: ToolExecutionContext): Promise<ToolResult> {
    let state: ToolCallState = 'received';
    try {
      await this.dependencies.toolCallStore.createWithInitialEvent({
        callId: call.callId, runId, ...(context === undefined ? {} : { projectId: context.projectId }),
        toolId: call.toolId, toolVersion: call.toolVersion, state, arguments: safeToolAudit(call.toolId, call.arguments),
        createdAt: this.timestamp(), updatedAt: this.timestamp()
      }, this.event(runId, 'tool_call.received', { callId: call.callId, toolId: call.toolId, toolVersion: call.toolVersion }));
      if (signal.aborted) return await this.reject(call, runId, state, 'cancelled', 'R1_CANCELLED');

      let definition: ToolDefinition;
      try { definition = this.dependencies.registry.lookup(call.toolId, call.toolVersion); }
      catch (error) {
        if (error instanceof ToolRegistryFailure) return await this.reject(call, runId, state, 'failed', 'R1_TOOL_UNKNOWN');
        throw error;
      }
      const toolContext: ToolExecutionContext = context ?? { projectId: 'project', runId, callId: call.callId };
      if (context === undefined && (definition.risk === 'write_project' || definition.risk === 'command_project')) {
        return await this.reject(call, runId, state, 'failed', 'R2_TOOL_CONTEXT_INVALID');
      }
      if (toolContext.runId !== runId || toolContext.callId !== call.callId) {
        return await this.reject(call, runId, state, 'failed', 'R2_TOOL_CONTEXT_INVALID');
      }
      const parsed = definition.inputSchema.safeParse(call.arguments);
      if (!parsed.success) return await this.reject(call, runId, state, 'failed', 'R1_TOOL_INPUT_INVALID');
      state = await this.transition(call.callId, runId, state, 'schema_validated');

      if (definition.risk === 'command_project') {
        if (this.dependencies.permissionService === undefined) {
          return await this.reject(call, runId, state, 'denied', 'R1_TOOL_PERMISSION_DENIED');
        }
        const commandInput = parsed.data as { readonly command: unknown; readonly reason: unknown; readonly impact: unknown };
        const permission = await this.dependencies.permissionService.request({
          callId: call.callId,
          command: commandInput.command as never,
          reason: commandInput.reason as string,
          impact: commandInput.impact as string
        });
        state = await this.transition(call.callId, runId, state, 'waiting_for_approval');
        if (this.dependencies.permissionResponder === undefined) {
          return await this.reject(call, runId, state, 'failed', 'R2_PERMISSION_PENDING');
        }
        if (signal.aborted) {
          await this.dependencies.permissionService.closePending(permission.id, 'cancelled');
          return await this.reject(call, runId, state, 'cancelled', 'R1_CANCELLED');
        }
        let answer: 'allow_once' | 'deny';
        try { answer = await this.dependencies.permissionResponder(permission); }
        catch { return await this.reject(call, runId, state, 'failed', 'R2_PERMISSION_PENDING'); }
        if (signal.aborted) {
          await this.dependencies.permissionService.closePending(permission.id, 'cancelled');
          return await this.reject(call, runId, state, 'cancelled', 'R1_CANCELLED');
        }
        const decisionResult = await this.dependencies.permissionService.decide({ id: permission.id, digest: permission.digest, decision: answer });
        if (answer === 'deny') return await this.reject(call, runId, state, 'denied', 'R1_TOOL_PERMISSION_DENIED');
        if (decisionResult !== 'accepted' || !(await this.dependencies.permissionService.claim(permission.id, permission.digest))) {
          return await this.reject(call, runId, state, 'failed', 'R2_PERMISSION_CLAIM_FAILED');
        }
        state = await this.transition(call.callId, runId, state, 'permission_decided', {
          permissionResult: 'allowed_once',
          permissionRuleId: 'R2_EXPLICIT_COMMAND_APPROVAL',
          permissionReason: 'Command was explicitly approved for this call.'
        });
      } else {
        const evidence = pathEvidence(parsed.data);
        const decision = this.dependencies.permissionPolicy.decide({ risk: definition.risk, pathEvidence: evidence ?? {}, canonicalGuard: definition.requiresCanonicalGuard === true });
        state = await this.transition(call.callId, runId, state, 'permission_decided', {
          permissionResult: decision.result,
          permissionRuleId: decision.ruleId,
          permissionReason: decision.reason
        });
        if (decision.result === 'denied') return await this.reject(call, runId, state, 'denied', 'R1_TOOL_PERMISSION_DENIED');
      }
      if (signal.aborted) return await this.reject(call, runId, state, 'cancelled', 'R1_CANCELLED');

      state = await this.transition(call.callId, runId, state, 'queued');
      state = await this.transition(call.callId, runId, state, 'running');
      let output: unknown;
      try { output = await definition.handler(parsed.data, signal, toolContext); }
      catch { return await this.reject(call, runId, state, signal.aborted ? 'cancelled' : 'failed', signal.aborted ? 'R1_CANCELLED' : 'R1_TOOL_EXECUTION_FAILED'); }
      if (signal.aborted) return await this.reject(call, runId, state, 'cancelled', 'R1_CANCELLED');
      const validated = definition.outputSchema.safeParse(output);
      if (!validated.success) return await this.reject(call, runId, state, 'failed', 'R1_TOOL_OUTPUT_INVALID');
      const result: ToolResult = { ok: true, callId: call.callId, output: validated.data as JsonValue };
      await this.transition(call.callId, runId, state, 'succeeded', { safeResult: safeResult(result) });
      return result;
    } catch (error) {
      if (error instanceof R1PersistenceFailure) throw error;
      return failed(call.callId, 'R1_TOOL_EXECUTION_FAILED');
    }
  }

  private async reject(call: ModelToolCall, runId: Uuid, from: ToolCallState, to: Extract<ToolCallState, 'failed' | 'denied' | 'cancelled'>, code: HarnessCode): Promise<ToolResult> {
    const result = failed(call.callId, code);
    await this.transition(call.callId, runId, from, to, { errorCode: code, ...(to === 'denied' ? { permissionResult: 'denied' as const } : {}), safeResult: safeResult(result) });
    return result;
  }

  private async transition(callId: Uuid, runId: Uuid, from: ToolCallState, to: ToolCallState, data: { readonly permissionResult?: 'allowed_by_rule' | 'allowed_once' | 'denied'; readonly permissionRuleId?: string; readonly permissionReason?: string; readonly safeResult?: JsonValue; readonly errorCode?: string } = {}): Promise<ToolCallState> {
    const eventType = to === 'failed' || to === 'denied' || to === 'cancelled' ? 'tool_call.rejected' : to === 'running' ? 'tool_call.started' : `tool_call.${to}`;
    await this.dependencies.toolCallStore.transitionWithEvent({ callId, from, to, updatedAt: this.timestamp(), ...data, event: this.event(runId, eventType, {
      callId,
      from,
      to,
      ...('permissionResult' in data ? { permissionResult: data.permissionResult ?? null } : {}),
      ...('permissionRuleId' in data ? { permissionRuleId: data.permissionRuleId ?? null } : {}),
      ...('permissionReason' in data ? { permissionReason: data.permissionReason ?? null } : {}),
      ...('errorCode' in data ? { errorCode: data.errorCode ?? null } : {})
    }) });
    return to;
  }

  private event(runId: Uuid, eventType: string, payload: JsonValue): EventEnvelope {
    return { eventId: this.dependencies.ids.next(), eventType, eventVersion: 1, correlationId: runId, occurredAt: this.timestamp(), source: 'core', sessionId: runId, payload };
  }

  private timestamp() { return this.dependencies.clock.now() as EventEnvelope['occurredAt']; }
}
