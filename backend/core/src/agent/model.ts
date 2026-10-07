import type {
  AgentRunFailureCode,
  IsoTimestamp,
  JsonValue,
  ModelContextSource,
  Uuid
} from '@codryn/shared';
import type { AgentRunState } from '../state/agent-run.js';
import type { ToolCallState } from '../state/tool-call.js';

export interface AgentRunRecord {
  readonly runId: Uuid;
  readonly requestId: Uuid;
  readonly state: AgentRunState;
  readonly task: string;
  readonly maxSteps: number;
  readonly stepCount: number;
  readonly adapterId: string;
  readonly modelId: string;
  readonly failureCode?: AgentRunFailureCode;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

export interface ToolCallRecord {
  readonly callId: Uuid;
  readonly runId: Uuid;
  readonly projectId?: Uuid;
  readonly parentCallId?: Uuid;
  readonly toolId: string;
  readonly toolVersion: number;
  readonly state: ToolCallState;
  readonly arguments: JsonValue;
  readonly permissionResult?: 'allowed_by_rule' | 'allowed_once' | 'denied';
  readonly permissionRuleId?: string;
  readonly permissionReason?: string;
  readonly safeResult?: JsonValue;
  readonly errorCode?: string;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

export class R1PersistenceFailure extends Error {
  readonly code = 'R1_PERSISTENCE_FAILED' as const;

  constructor(message: 'AGENT_RUN_READ_FAILED' | 'AGENT_RUN_WRITE_FAILED' | 'TOOL_CALL_WRITE_FAILED') {
    super(message);
    this.name = 'R1PersistenceFailure';
  }
}

export interface ContextSourceAudit {
  readonly path: string;
  readonly contentHash: string;
  readonly byteLength: number;
  readonly reason: 'explicit_reference';
}

export interface AssembledContext {
  readonly modelContent: readonly ModelContextSource[];
  readonly sources: readonly ContextSourceAudit[];
  readonly totalBytes: number;
}
