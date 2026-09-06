import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  ApplyPatch, ContextAssembler, ControlledPermissionPolicy, GetChangeDiff, PermissionService,
  RecoverMutations, RecoverR2Run, RevertChanges, RunAgentLoop,
  ToolExecutionHarness, ToolRegistry, commandRunTool, filePatchTool,
  fileReadTool, textSearchTool, type ChangeSetStore, type Clock,
  type EventStore, type IdGenerator, type PermissionResponder, type ToolCallRecord
} from '@codryn/core';
import type { R2RunResult, RunAgentRequest } from '@codryn/shared';
import type { FakeScenario } from './model/scripted-model-adapter.js';
import { ProjectFilesystem } from './filesystem/project-filesystem.js';
import { FileWorkspaceObserver } from './filesystem/workspace-observer.js';
import { ContentBlobStore } from './filesystem/content-blob-store.js';
import { WindowsGuardedWriter } from './filesystem/windows-guarded-writer.js';
import { ProjectGitState } from './git/project-git-state.js';
import { JsonlDiagnosticLogger } from './logging/jsonl-diagnostic-logger.js';
import { R2CommandRunner } from './process/r2-command-runner.js';
import { VerifyingCommandExecutor } from './process/verifying-command-executor.js';
import { ScriptedModelAdapter } from './model/scripted-model-adapter.js';
import { changeVerifyReturnScenario } from './model/change-verify-return-scenario.js';
import { openR0Database } from './persistence/open-database.js';
import { runMigrations } from './persistence/run-migrations.js';
import { SqliteAgentRunStore } from './persistence/sqlite-agent-run-store.js';
import { SqliteChangeSetStore } from './persistence/sqlite-change-set-store.js';
import { SqliteEventStore } from './persistence/sqlite-event-store.js';
import { SqliteMutationJournal } from './persistence/sqlite-mutation-journal.js';
import { SqlitePermissionStore } from './persistence/sqlite-permission-store.js';
import { SqliteProjectBaselineStore } from './persistence/sqlite-project-baseline-store.js';
import { SqliteToolCallStore } from './persistence/sqlite-tool-call-store.js';
import { SqliteVerificationStore } from './persistence/sqlite-verification-store.js';
import { SqliteWorkspaceStore } from './persistence/sqlite-workspace-store.js';
import { SystemClock } from './system/system-clock.js';
import { UuidGenerator } from './system/uuid-generator.js';

export interface R2Infrastructure {
  readonly projectId: string;
  readCalls(): number;
  readonly agentLoop: { executeR2(input: RunAgentRequest, signal: AbortSignal): Promise<R2RunResult> };
  readonly changes: {
    readonly diff: GetChangeDiff;
    readonly revert: RevertChanges;
    readonly changeSets: ChangeSetStore;
  };
  readonly permissions: PermissionService;
  readonly recover: RecoverR2Run;
  readonly eventStore: EventStore;
  close(): void;
}

function digest(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input), 'utf8').digest('hex');
}

function auditEvent(ids: IdGenerator, clock: Clock, runId: string, requestId: string, callId: string) {
  return {
    eventId: ids.next(),
    eventType: 'tool_call.started',
    eventVersion: 1 as const,
    correlationId: requestId,
    occurredAt: clock.now(),
    source: 'core' as const,
    sessionId: runId,
    payload: { callId, toolId: 'change.revert', toolVersion: 1 }
  };
}

export async function createR2Infrastructure(options: {
  readonly userDataPath: string;
  readonly projectRoot: string;
  readonly scenario: FakeScenario | 'change-verify-return';
  readonly permissionResponder?: PermissionResponder;
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
}): Promise<R2Infrastructure> {
  const userDataPath = resolve(options.userDataPath);
  const projectRoot = resolve(options.projectRoot);
  await mkdir(userDataPath, { recursive: true });
  const database = openR0Database(join(userDataPath, 'codryn.sqlite'));
  let closed = false;
  try {
    const clock = options.clock ?? new SystemClock();
    const ids = options.ids ?? new UuidGenerator();
    const scenario = options.scenario === 'change-verify-return'
      ? changeVerifyReturnScenario({ expectedHash: createHash('sha256').update(await readFile(join(projectRoot, 'sum.mjs'))).digest('hex'), projectRoot })
      : options.scenario;
    runMigrations(database, clock.now());
    const projectId = ids.next();
    const filesystem = new ProjectFilesystem(projectRoot);
    let readCalls = 0;
    const git = new ProjectGitState(projectRoot);
    const observer = new FileWorkspaceObserver(projectRoot, { git });
    const workspaces = new SqliteWorkspaceStore(database);
    await workspaces.observe(projectId, await observer.inspect(new AbortController().signal));
    const eventStore = new SqliteEventStore(database);
    const toolCalls = new SqliteToolCallStore(database);
    const agentRuns = new SqliteAgentRunStore(database);
    const changeSets = new SqliteChangeSetStore(database, clock, ids);
    const journal = new SqliteMutationJournal(database, clock, ids);
    const blobs = new ContentBlobStore(userDataPath);
    const baseline = new SqliteProjectBaselineStore(database);
    const guardedWriter = new WindowsGuardedWriter(projectRoot);
    const fileHashes = {
      readHash: async (path: string, signal: AbortSignal): Promise<string | null> => {
        try { return (await filesystem.readFile({ path }, signal)).contentHash; } catch { return null; }
      }
    };
    const commandRunner = new R2CommandRunner(projectRoot);
    const verifications = new SqliteVerificationStore(database);
    const verifyingCommand = new VerifyingCommandExecutor({ runner: commandRunner, observer, workspaces, verifications, ids, clock });
    let activeSetId: string | null = null;
    let activeRunId: string | null = null;
    const patch = new ApplyPatch({
      writer: guardedWriter,
      blobs,
      journal,
      ids,
      get setId() { if (activeSetId === null) throw new Error('R2_CHANGE_SET_NOT_OPEN'); return activeSetId; },
      nextSequence: async () => { if (activeSetId === null) throw new Error('R2_CHANGE_SET_NOT_OPEN'); return changeSets.reserveSequence(activeSetId); },
      hash: (bytes) => createHash('sha256').update(bytes).digest('hex')
    });
    const registry = new ToolRegistry([
      fileReadTool(async (input, signal) => { readCalls += 1; return filesystem.readFile(input, signal); }),
      textSearchTool(async (input, signal) => { readCalls += 1; return filesystem.searchText(input, signal); }),
      filePatchTool({ execute: (input, actor, signal) => patch.execute(input, actor, signal) }),
      commandRunTool(verifyingCommand)
    ]);
    const permissionStore = new SqlitePermissionStore(database, clock, ids);
    const permissions = new PermissionService({ store: permissionStore, calls: toolCalls, ids, clock, digest });
    const toolExecutionHarness = new ToolExecutionHarness({
      registry,
      permissionPolicy: new ControlledPermissionPolicy(),
      toolCallStore: toolCalls,
      clock,
      ids,
      permissionService: permissions,
      ...(options.permissionResponder === undefined ? {} : { permissionResponder: options.permissionResponder })
    });
    const logger = new JsonlDiagnosticLogger({ directory: join(userDataPath, 'logs'), redactionPolicy: { sensitiveRoots: [userDataPath, projectRoot] } });
    const loop = new RunAgentLoop({
      contextAssembler: new ContextAssembler(filesystem),
      model: new ScriptedModelAdapter(scenario),
      registry,
      toolExecutionHarness,
      agentRunStore: agentRuns,
      eventStore,
      clock,
      ids,
      logger
    });
    const changes = {
      diff: new GetChangeDiff({ journal, blobs, files: fileHashes }),
      revert: new RevertChanges({
        writer: guardedWriter,
        blobs,
        journal,
        ids,
        get setId() { if (activeSetId === null) throw new Error('R2_CHANGE_SET_NOT_OPEN'); return activeSetId; },
        nextSequence: async () => { if (activeSetId === null) throw new Error('R2_CHANGE_SET_NOT_OPEN'); return changeSets.reserveSequence(activeSetId); },
        hash: (bytes) => createHash('sha256').update(bytes).digest('hex'),
        files: fileHashes,
        changeSets,
        createAuditCall: async ({ callId, runId, projectId: actorProjectId, requestId }) => {
          const call: ToolCallRecord = {
            callId,
            runId,
            projectId: actorProjectId,
            toolId: 'change.revert',
            toolVersion: 1,
            state: 'running',
            arguments: { operation: 'revert' },
            createdAt: clock.now(),
            updatedAt: clock.now()
          };
          await toolCalls.createWithInitialEvent(call, auditEvent(ids, clock, runId, requestId, callId));
        }
      }),
      changeSets
    };
    const recover = new RecoverR2Run({ mutations: new RecoverMutations({ journal, files: fileHashes }) });
    const agentLoop: R2Infrastructure['agentLoop'] = {
      executeR2: async (request, signal) => {
        let runSetId: string | null = null;
        const result = await loop.executeR2(request, signal, {
          projectId,
          changeSetId: null,
          openChangeSet: async (runId) => {
            const createdSetId = await changeSets.open(projectId, runId);
            runSetId = createdSetId;
            activeRunId = runId;
            activeSetId = createdSetId;
            await baseline.saveOnce(createdSetId, await git.inspect(signal));
            return createdSetId;
          },
          completion: async () => {
            const setId = runSetId ?? activeSetId;
            const entries = setId === null ? [] : await journal.entries(setId);
            const pending = await journal.pending(projectId);
            const snapshot = await workspaces.current(projectId);
            const record = activeRunId === null ? null : await verifications.current(activeRunId, snapshot);
            const verification = record === null
              ? { status: 'unverified' as const, recordId: null, reason: 'No persisted verification record exists.' }
              : { status: record.stale ? 'stale' as const : record.result === 'passed' ? 'verified' as const : 'unverified' as const, recordId: record.id, reason: record.reason };
            return { changed: entries.some((entry) => entry.kind === 'patch'), verification, recoveryRequired: pending.length > 0, pending: pending.length > 0 };
          }
        });
        if (runSetId !== null) {
          try { await changeSets.seal(runSetId); } catch { /* Recovery/conflict state remains authoritative. */ }
        }
        return result;
      }
    };
    return {
      projectId,
      readCalls: () => readCalls,
      agentLoop,
      changes,
      permissions,
      recover,
      eventStore,
      close() { if (!closed) { closed = true; observer.close(); database.close(); } }
    };
  } catch (error) {
    database.close();
    throw error;
  }
}
