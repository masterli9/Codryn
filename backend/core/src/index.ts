export { transition } from './state/transition.js';
export type { TransitionResult } from './state/transition.js';
export {
  agentRunGraph,
  transitionAgentRun
} from './state/agent-run.js';
export type { AgentRunState } from './state/agent-run.js';
export {
  toolCallGraph,
  transitionToolCall
} from './state/tool-call.js';
export type { ToolCallState } from './state/tool-call.js';
export {
  permissionRequestGraph,
  transitionPermissionRequest
} from './state/permission-request.js';
export type { PermissionRequestState } from './state/permission-request.js';
export {
  changeSetGraph,
  transitionChangeSet
} from './state/change-set.js';
export type { ChangeSetState } from './state/change-set.js';
export {
  gitOperationGraph,
  transitionGitOperation
} from './state/git-operation.js';
export type { GitOperationState } from './state/git-operation.js';
export { R0DiagnosticFailure, RunR0Diagnostics } from './diagnostics/run-r0-diagnostics.js';
export type { RunR0DiagnosticsDependencies } from './diagnostics/run-r0-diagnostics.js';
export type {
  BackupEvidence,
  CredentialHelperCategory,
  DatabaseEvidence,
  DiagnosticSession,
  GitEvidence,
  InitialEvent,
  LogEntry,
  ProcessResult,
  ProcessSpec,
  R0DiagnosticProfile
} from './diagnostics/model.js';
export type {
  Clock,
  DatabaseDiagnostics,
  DiagnosticLogger,
  EventStore,
  GitProbe,
  IdGenerator,
  ProcessRunner,
  SessionRepository
} from './diagnostics/ports.js';
export { R1PersistenceFailure } from './agent/model.js';
export type { AgentRunRecord, ToolCallRecord, AssembledContext, ContextSourceAudit } from './agent/model.js';
export type { AgentRunStore, ModelAdapter, PermissionResponder, ToolCallBinding, ToolCallStore, ToolExecutionContext } from './agent/ports.js';
export { ContextAssembler, ContextAssemblyFailure } from './agent/context-assembler.js';
export type { ContextAssemblyInput } from './agent/context-assembler.js';
export { ToolRegistry, ToolRegistryFailure } from './tools/tool-registry.js';
export type { ToolDefinition, ToolRisk } from './tools/tool-registry.js';
export { commandRunTool } from './tools/command-tool.js';
export type { CommandExecutor } from './tools/command-tool.js';
export type { CommandResult, CommandRunner } from './process/ports.js';
export { fileReadTool, textSearchTool, fileReadInputSchema, fileReadOutputSchema, textSearchInputSchema, textSearchOutputSchema } from './tools/read-only-contracts.js';
export { ControlledPermissionPolicy } from './tools/controlled-permission-policy.js';
export type { PermissionDecision, PermissionInput } from './tools/controlled-permission-policy.js';
export { filePatchTool } from './tools/change-tool.js';
export type { PatchExecutor } from './tools/change-tool.js';
export { safeToolAudit } from './tools/safe-tool-audit.js';
export { isR1SensitiveRelativePath, isValidR1RelativePath } from './tools/r1-sensitive-path-policy.js';
export { ToolExecutionHarness } from './tools/tool-execution-harness.js';
export type { ToolExecutionHarnessDependencies } from './tools/tool-execution-harness.js';
export { RunAgentLoop } from './agent/run-agent-loop.js';
export type { R2ExecutionOptions, RunAgentLoopDependencies } from './agent/run-agent-loop.js';
export { RecoverR2Run } from './agent/recover-r2-run.js';
export type { RecoverR2RunDependencies } from './agent/recover-r2-run.js';
export { preparePatch } from './changes/prepare-patch.js';
export { ApplyPatch } from './changes/apply-patch.js';
export type { ApplyPatchDependencies } from './changes/apply-patch.js';
export { PublishMutation } from './changes/publish-mutation.js';
export type { PreparedMutation, PublishMutationDependencies } from './changes/publish-mutation.js';
export { RevertChanges, returnOrder } from './changes/revert-changes.js';
export type { RevertChangesDependencies, RevertResult } from './changes/revert-changes.js';
export { RecoverMutations, classifyRecovery } from './changes/recover-mutations.js';
export type { RecoveryState } from './changes/recover-mutations.js';
export type {
  BlobStore,
  ChangeActor,
  ChangeEntry,
  FileHashReader,
  GuardedFile,
  GuardedWriter,
  MutationJournal,
  MutationResult,
  PatchInput,
  WriteIntent
} from './changes/ports.js';
export type { ChangeSetStore } from './changes/change-set-store.js';
export { PermissionService } from './permissions/permission-service.js';
export type { PermissionServiceDependencies } from './permissions/permission-service.js';
export type {
  PermissionCallBinding,
  PermissionCallLookup,
  PermissionRequestSpec,
  PermissionStore
} from './permissions/ports.js';
export type { ProjectBaseline, ProjectBaselineStore, ProjectGitState } from './changes/project-baseline.js';
export { buildFileDiff, GetChangeDiff } from './changes/get-change-diff.js';
export type { GetChangeDiffDependencies } from './changes/get-change-diff.js';
export type {
  Lease,
  LeaseStore,
  WorkspaceObservation,
  WorkspaceObserver,
  WorkspaceSnapshot,
  WorkspaceStore
} from './workspace/ports.js';
export { shouldAdvance } from './workspace/observe-workspace.js';
export { VerifyCommand, assessVerification } from './verification/verify-command.js';
export type { VerificationAssessment, VerifyCommandDependencies } from './verification/verify-command.js';
export type { VerificationStore } from './verification/verification-store.js';
export { collectModelResponse, ModelResponseFailure } from './agent/model-response-collector.js';
export type {
  CollectedModelResponse,
  ModelResponseFailureCode,
  ModelUsage
} from './agent/model-response-collector.js';
export { appendAssistantTurn, appendToolTurn, toolResultsFromHistory } from './agent/model-history.js';
export { canComplete } from './agent/r2-completion.js';
export { summarizeTrials } from './agent/provider-eval.js';
export type { EvalSummary, Trial } from './agent/provider-eval.js';
