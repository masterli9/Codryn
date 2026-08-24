import type {
  AgentRunFailureCode,
  EventEnvelope,
  IsoTimestamp,
  JsonValue,
  ModelDescriptor,
  ModelRequest,
  ModelStreamEvent,
  Uuid
} from '@codryn/shared';
import type { AgentRunState } from '../state/agent-run.js';
import type { ToolCallState } from '../state/tool-call.js';
import type { AgentRunRecord, ToolCallRecord } from './model.js';

export interface ModelAdapter {
  readonly descriptor: ModelDescriptor;
  stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent>;
}

export interface AgentRunStore {
  createWithInitialEvent(run: AgentRunRecord, event: EventEnvelope): Promise<void>;
  transitionWithEvent(input: {
    readonly runId: Uuid;
    readonly from: AgentRunState;
    readonly to: AgentRunState;
    readonly stepCount: number;
    readonly failureCode?: AgentRunFailureCode;
    readonly updatedAt: IsoTimestamp;
    readonly event: EventEnvelope;
  }): Promise<void>;
  findById(runId: Uuid): Promise<AgentRunRecord | null>;
}

export interface ToolCallStore {
  createWithInitialEvent(call: ToolCallRecord, event: EventEnvelope): Promise<void>;
  transitionWithEvent(input: {
    readonly callId: Uuid;
    readonly from: ToolCallState;
    readonly to: ToolCallState;
    readonly permissionResult?: 'allowed_by_rule' | 'denied';
    readonly safeResult?: JsonValue;
    readonly errorCode?: string;
    readonly updatedAt: IsoTimestamp;
    readonly event: EventEnvelope;
  }): Promise<void>;
}
