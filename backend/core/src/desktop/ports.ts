import type { ModelDescriptor, R2RunResult, R3Accepted, R3ActivityView, R3Chat, R3JobState, R3Message, R3OutputPage, R3Project, R3RevertInput, R3RevertResult, R3RunDetail, R3RunView, R3Snapshot, R3SubmitInput, R3Update, Uuid } from '@codryn/shared';
export interface ChatStore {
  create(projectId: Uuid, title: string): Promise<R3Chat>;
  list(projectId: Uuid, archived: boolean): Promise<readonly R3Chat[]>;
  get(chatId: Uuid): Promise<R3Chat | null>;
  rename(chatId: Uuid, title: string): Promise<void>;
  archive(chatId: Uuid): Promise<void>;
}
export interface DesktopProjectStore {
  remember(projectId: Uuid, root: string, displayName: string): Promise<R3Project>;
  get(id: Uuid): Promise<R3Project | null>;
  list(): Promise<readonly R3Project[]>;
  root(id: Uuid): Promise<string>;
}
export interface DesktopRequestStore {
  getByRequestId(requestId: Uuid): Promise<{ input: R3SubmitInput; projectId: Uuid; accepted: R3Accepted; view: R3RunView } | null>;
  get(jobId: Uuid): Promise<R3RunView | null>;
  accept(input: R3SubmitInput, projectId: Uuid, model: ModelDescriptor): Promise<R3Accepted>;
  attachRun(requestId: Uuid, runId: Uuid): Promise<void>;
  setState(jobId: Uuid, state: R3JobState): Promise<void>;
  finish(jobId: Uuid, result: R2RunResult): Promise<void>;
  interruptUnfinished(projectId: Uuid): Promise<void>;
}
export interface DesktopActionStore {
  get(requestId: Uuid): Promise<{ digest: string; state: 'started' | 'finished' | 'interrupted'; result: R3RevertResult | null } | null>;
  begin(input: R3RevertInput, digest: string): Promise<void>;
  finish(requestId: Uuid, result: R3RevertResult): Promise<void>;
}
export interface DesktopProjectionStore {
  snapshot(chatId: Uuid): Promise<R3Snapshot>;
  inspectRun(chatId: Uuid, targetRequestId: Uuid): Promise<R3RunDetail>;
  activity(chatId: Uuid, targetRequestId: Uuid, beforeSequence: number | null): Promise<{ items: readonly R3ActivityView[]; beforeSequence: number | null }>;
  messages(chatId: Uuid, beforeSequence: number | null): Promise<readonly R3Message[]>;
  appendAssistant(requestId: Uuid, step: number, sequence: number, text: string): Promise<void>;
  sealAssistant(requestId: Uuid, step: number, state: 'complete' | 'interrupted'): Promise<void>;
  setUsage(requestId: Uuid, usage: { inputTokens: number; outputTokens: number }): Promise<void>;
  setProviderError(requestId: Uuid, error: R3RunView['providerError']): Promise<void>;
  appendOutput(requestId: Uuid, callId: Uuid, stream: 'stdout' | 'stderr', text: string, truncated: boolean): Promise<void>;
  output(chatId: Uuid, callId: Uuid, afterSequence: number | null): Promise<R3OutputPage>;
  updates(chatId: Uuid, afterCursor: number, limit: number): Promise<readonly R3Update[]>;
}
export type DesktopRuntimeFactory = (input: { projectId: Uuid; request: R3SubmitInput; signal: AbortSignal; onRunCreated: (runId: Uuid) => Promise<void> }) => Promise<{ execute(): Promise<R2RunResult>; close(): void }>;
