import { runAgentRequestSchema, type AgentRunFailureCode, type EventEnvelope, type ModelRequest, type RunAgentRequest, type RunAgentResult, type ToolResult, type Uuid } from '@codryn/shared';
import type { Clock, DiagnosticLogger, EventStore, IdGenerator } from '../diagnostics/ports.js';
import { collectModelResponse, ModelResponseFailure } from './model-response-collector.js';
import type { ContextAssembler } from './context-assembler.js';
import type { AgentRunStore, ModelAdapter } from './ports.js';
import { R1PersistenceFailure } from './model.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { ToolExecutionHarness } from '../tools/tool-execution-harness.js';
import type { AgentRunState } from '../state/agent-run.js';

export interface RunAgentLoopDependencies {
  readonly contextAssembler: Pick<ContextAssembler, 'assemble'>;
  readonly model: ModelAdapter;
  readonly registry: ToolRegistry;
  readonly toolExecutionHarness: Pick<ToolExecutionHarness, 'execute'>;
  readonly agentRunStore: AgentRunStore;
  readonly eventStore: EventStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: DiagnosticLogger;
}

const messages: Readonly<Record<AgentRunFailureCode, string>> = Object.freeze({
  R1_INPUT_INVALID: 'Agent run input is invalid.', R1_CONTEXT_REFERENCE_INVALID: 'Context reference is invalid.', R1_CONTEXT_LIMIT_EXCEEDED: 'Context limit exceeded.', R1_MODEL_CAPABILITY_MISSING: 'Model tool calling capability is missing.', R1_MODEL_ADAPTER_FAILED: 'Model adapter failed.', R1_MODEL_RESPONSE_UNSUPPORTED: 'Model response is unsupported.', R1_FAKE_SCENARIO_MISMATCH: 'Scripted model scenario mismatch.', R1_TOOL_UNKNOWN: 'Tool is not registered.', R1_TOOL_INPUT_INVALID: 'Tool input is invalid.', R1_TOOL_PERMISSION_DENIED: 'Tool permission was denied.', R1_TOOL_OUTPUT_INVALID: 'Tool output is invalid.', R1_TOOL_EXECUTION_FAILED: 'Tool execution failed.', R1_STEP_LIMIT_EXCEEDED: 'Agent run step limit exceeded.', R1_CANCELLED: 'Agent run cancelled.', R1_PERSISTENCE_FAILED: 'Agent run persistence failed.', R1_INTERNAL_ERROR: 'Agent run failed unexpectedly.'
});

function code(error: unknown): AgentRunFailureCode {
  if (error instanceof ModelResponseFailure || error instanceof R1PersistenceFailure) return error.code;
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' && error.code in messages) return error.code as AgentRunFailureCode;
  return 'R1_INTERNAL_ERROR';
}

export class RunAgentLoop {
  constructor(private readonly dependencies: RunAgentLoopDependencies) {}

  async execute(input: RunAgentRequest, signal: AbortSignal): Promise<RunAgentResult> {
    const parsed = runAgentRequestSchema.safeParse(input);
    if (!parsed.success) return this.unpersisted(this.dependencies.ids.next(), 'R1_INPUT_INVALID');
    const request = parsed.data;
    const runId = this.dependencies.ids.next();
    let state: AgentRunState = 'idle';
    let steps = 0;
    try {
      const timestamp = this.timestamp();
      await this.dependencies.agentRunStore.createWithInitialEvent({ runId, requestId: request.requestId, state, task: request.task, maxSteps: request.maxSteps, stepCount: 0, adapterId: this.dependencies.model.descriptor.adapterId, modelId: this.dependencies.model.descriptor.modelId, createdAt: timestamp, updatedAt: timestamp }, this.event(runId, request.requestId, 'agent_run.created', { runId, maxSteps: request.maxSteps }));
      state = await this.transition(runId, request.requestId, state, 'preparing_context', steps);
      this.abort(signal);
      const context = await this.dependencies.contextAssembler.assemble({ task: request.task, project: { id: 'project' }, contextReferences: request.contextReferences }, signal);
      this.abort(signal);
      await this.append(runId, request.requestId, 'context.assembled', { sources: context.sources.map((source) => ({ path: source.path, contentHash: source.contentHash, byteLength: source.byteLength, reason: source.reason })), totalBytes: context.totalBytes });
      if (this.dependencies.model.descriptor.capabilities.toolCalling !== 'supported') throw { code: 'R1_MODEL_CAPABILITY_MISSING' };
      const results: ToolResult[] = [];
      const observedCallIds = new Set<Uuid>();
      while (true) {
        this.abort(signal);
        if (steps >= request.maxSteps) throw { code: 'R1_STEP_LIMIT_EXCEEDED' };
        state = await this.transition(runId, request.requestId, state, 'waiting_for_model', steps);
        const modelRequest: ModelRequest = { runId, task: request.task, project: { id: 'project' }, context: [...context.modelContent], tools: [...this.dependencies.registry.descriptors], previousToolResults: [...results] };
        await this.append(runId, request.requestId, 'model.requested', { step: steps + 1, toolCount: modelRequest.tools.length, contextSourceCount: modelRequest.context.length, previousToolResultCount: modelRequest.previousToolResults.length });
        let response;
        try { response = await collectModelResponse(this.dependencies.model.stream(modelRequest, signal), signal); }
        catch (error) {
          const failure = code(error);
          await this.append(runId, request.requestId, 'model.failed', { step: steps + 1, code: failure });
          throw error;
        }
        await this.append(runId, request.requestId, 'model.response_received', { step: steps + 1, kind: response.kind, ...(response.kind === 'final' ? { textLength: response.text.length } : { toolCallCount: response.calls.length }) });
        steps++;
        this.abort(signal);
        if (response.kind === 'final') {
          if (response.text.trim().length === 0) throw { code: 'R1_MODEL_RESPONSE_UNSUPPORTED' };
          state = await this.transition(runId, request.requestId, state, 'completed', steps);
          return { schemaVersion: 1, status: 'completed', runId, stepCount: steps, finalText: response.text, verification: { status: 'not_applicable', reason: 'R1_READ_ONLY_RUN' } };
        }
        state = await this.transition(runId, request.requestId, state, 'executing_tool', steps);
        for (const toolCall of response.calls) {
          if (observedCallIds.has(toolCall.callId)) throw { code: 'R1_MODEL_RESPONSE_UNSUPPORTED' };
          observedCallIds.add(toolCall.callId);
          this.abort(signal);
          results.push(await this.dependencies.toolExecutionHarness.execute(toolCall, runId, signal));
          this.abort(signal);
        }
      }
    } catch (error) {
      const failure = signal.aborted || code(error) === 'R1_CANCELLED' ? 'R1_CANCELLED' : code(error);
      if (failure === 'R1_INTERNAL_ERROR') await this.logUnknownFailure(request.requestId);
      if (failure === 'R1_PERSISTENCE_FAILED') return this.unpersisted(request.requestId, failure, runId, steps);
      try {
        const terminal = failure === 'R1_CANCELLED' ? 'cancelled' : 'failed';
        await this.transition(runId, request.requestId, state, terminal, steps, failure === 'R1_CANCELLED' ? undefined : failure);
      } catch { return this.unpersisted(request.requestId, 'R1_PERSISTENCE_FAILED', runId, steps); }
      return failure === 'R1_CANCELLED'
        ? { schemaVersion: 1, status: 'cancelled', runId, stepCount: steps, failure: { code: failure, message: messages[failure] }, verification: { status: 'not_applicable', reason: 'R1_READ_ONLY_RUN' } }
        : { schemaVersion: 1, status: 'failed', runId, stepCount: steps, failure: { code: failure, message: messages[failure] }, verification: { status: 'not_applicable', reason: 'R1_READ_ONLY_RUN' } };
    }
  }

  private async transition(runId: Uuid, requestId: Uuid, from: AgentRunState, to: AgentRunState, stepCount: number, failureCode?: AgentRunFailureCode): Promise<AgentRunState> {
    await this.dependencies.agentRunStore.transitionWithEvent({ runId, from, to, stepCount, ...(failureCode === undefined ? {} : { failureCode }), updatedAt: this.timestamp(), event: this.event(runId, requestId, `agent_run.${to === 'completed' || to === 'cancelled' || to === 'failed' ? to : 'state_changed'}`, { runId, from, to, stepCount, ...(failureCode === undefined ? {} : { failureCode }) }) });
    return to;
  }

  private unpersisted(requestId: Uuid, failure: AgentRunFailureCode, runId = requestId, stepCount = 0): RunAgentResult {
    return { schemaVersion: 1, status: 'failed', runId, stepCount, failure: { code: failure, message: messages[failure] }, verification: { status: 'not_applicable', reason: 'R1_READ_ONLY_RUN' } };
  }
  private async append(runId: Uuid, requestId: Uuid, eventType: string, payload: EventEnvelope['payload']): Promise<void> {
    try { await this.dependencies.eventStore.append(this.event(runId, requestId, eventType, payload)); }
    catch { throw new R1PersistenceFailure('AGENT_RUN_WRITE_FAILED'); }
  }
  private abort(signal: AbortSignal): void { if (signal.aborted) throw { code: 'R1_CANCELLED' }; }
  private async logUnknownFailure(correlationId: Uuid): Promise<void> {
    try { await this.dependencies.logger.write({ level: 'error', event: 'r1.agent_run.unknown_failure', occurredAt: this.timestamp(), correlationId, data: { code: 'R1_INTERNAL_ERROR' } }); } catch { /* Logging is never allowed to replace the stable result. */ }
  }
  private event(runId: Uuid, requestId: Uuid, eventType: string, payload: EventEnvelope['payload']): EventEnvelope { return { eventId: this.dependencies.ids.next(), eventType, eventVersion: 1, correlationId: requestId, occurredAt: this.timestamp(), source: 'core', sessionId: runId, payload }; }
  private timestamp() { return this.dependencies.clock.now() as EventEnvelope['occurredAt']; }
}
