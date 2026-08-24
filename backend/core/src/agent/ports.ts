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

export interface ProjectFileReadInput {
  readonly path: string;
  readonly startLine?: number;
  readonly maxLines?: number;
}

export interface ProjectFileReadResult {
  readonly path: string;
  readonly content: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly totalLines: number;
  readonly truncated: boolean;
  readonly contentHash: string;
}

export interface ProjectTextSearchInput {
  readonly query: string;
  readonly path?: string;
  readonly maxResults?: number;
}

export interface ProjectTextSearchResult {
  readonly matches: readonly { readonly path: string; readonly line: number; readonly column: number; readonly preview: string }[];
  readonly truncated: boolean;
  readonly filesSearched: number;
  readonly bytesSearched: number;
}

export interface ProjectFilesystem {
  readFile(input: ProjectFileReadInput, signal: AbortSignal): Promise<ProjectFileReadResult>;
  searchText(input: ProjectTextSearchInput, signal: AbortSignal): Promise<ProjectTextSearchResult>;
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
