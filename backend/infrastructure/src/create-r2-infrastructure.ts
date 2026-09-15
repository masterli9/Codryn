import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  ApplyPatch, ContextAssembler, ControlledPermissionPolicy, GetChangeDiff, PermissionService,
  RecoverMutations, RecoverR2Run, RevertChanges, RunAgentLoop,
  ToolExecutionHarness, ToolRegistry, commandRunTool, filePatchTool,
  fileReadTool, textSearchTool, type ChangeSetStore, type Clock,
  type EventStore, type IdGenerator, type ModelAdapter, type PermissionResponder, type ToolCallRecord, type CommandResult
} from '@codryn/core';
import type { R2RunResult, RunAgentRequest } from '@codryn/shared';
import type { FakeScenario } from './model/scripted-model-adapter.js';
import { ProjectFilesystem, ProjectFilesystemFailure } from './filesystem/project-filesystem.js';
import { ContextPathPolicy } from './filesystem/context-path-policy.js';
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
  readonly scenario?: FakeScenario | 'change-verify-return';
  readonly model?: ModelAdapter;
  readonly trustedVerificationExecutable?: string;
  readonly permissionResponder?: PermissionResponder;
  readonly onRead?: (path: string, readCount: number) => Promise<void>;
  readonly onPatch?: (path: string) => Promise<void>;
  readonly onCommandResult?: (result: CommandResult) => Promise<void>;
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
    const scenario = options.model === undefined && options.scenario === 'change-verify-return'
      ? (() => {
        const bytesPromise = readFile(join(projectRoot, 'sum.mjs'));
        return bytesPromise.then((bytes) => changeVerifyReturnScenario({ expectedHash: createHash('sha256').update(bytes).digest('hex'), originalContent: bytes.toString('utf8'), projectRoot }));
      })()
      : options.scenario;
    if (options.model === undefined && scenario === undefined) throw new Error('R2_MODEL_NOT_CONFIGURED');
    runMigrations(database, clock.now());
    const workspaces = new SqliteWorkspaceStore(database);
    const canonicalRoot = await realpath(projectRoot);
    const projectId = workspaces.open(process.platform === 'win32' ? canonicalRoot.toLowerCase() : canonicalRoot, ids.next());
    const contextPolicy = await ContextPathPolicy.fromProjectRoot(projectRoot);
    const filesystem = new ProjectFilesystem(projectRoot, { contextPolicy });
    let readCalls = 0;
    const git = new ProjectGitState(projectRoot);
    const observer = new FileWorkspaceObserver(projectRoot, { git, contextPolicy });
    await workspaces.observe(projectId, await observer.inspect(new AbortController().signal));
    const eventStore = new SqliteEventStore(database);
    const toolCalls = new SqliteToolCallStore(database, { clock, ids });
    const agentRuns = new SqliteAgentRunStore(database);
    const changeSets = new SqliteChangeSetStore(database, clock, ids);
    const journal = new SqliteMutationJournal(database, clock, ids);
    const blobs = new ContentBlobStore(userDataPath);
    const baseline = new SqliteProjectBaselineStore(database);
    const diskWriter = new WindowsGuardedWriter(projectRoot);
    const guardedWriter = {
      open: async (path: string, expectedHash: string, signal: AbortSignal) => {
        const state = await git.inspect(signal);
        const target = resolve(projectRoot, path).toLowerCase();
        if (state.mode === 'git' && state.conflicts.some((conflict) => resolve(projectRoot, conflict).toLowerCase() === target)) {
          throw new Error('R2_GIT_CONFLICT');
        }
        return diskWriter.open(path, expectedHash, signal);
      }
    };
    const fileHashes = {
      readHash: async (path: string, signal: AbortSignal): Promise<string | null> => {
        try { return (await filesystem.readFile({ path }, signal)).contentHash; } catch (error) {
          if ((error instanceof ProjectFilesystemFailure && error.code === 'R1_FILE_NOT_FOUND')
            || (error as NodeJS.ErrnoException).code === 'ENOENT') return null;
          throw error;
        }
      }
    };
    const commandRunner = new R2CommandRunner(projectRoot);
    const verifications = new SqliteVerificationStore(database);
    const verifyingCommand = new VerifyingCommandExecutor({
      runner: commandRunner,
      observer,
      workspaces,
      verifications,
      ids,
      clock,
      isRelevant: async (command, snapshot) => {
        if (command.executable !== (options.trustedVerificationExecutable ?? process.execPath) || resolve(command.cwd) !== projectRoot
          || command.args.length !== 2 || command.args[0] !== '--test' || command.args[1] !== 'sum.test.mjs') return false;
        // Both the assertion file and its known input must participate in the same complete snapshot.
        const manifest = ['sum.test.mjs', 'sum.mjs'] as const;
        if (!snapshot.complete || !manifest.every((path) => snapshot.observedPaths?.includes(path) && contextPolicy.allowed(path))) return false;
        try {
          // Backend-owned reference fixture profile: the model cannot nominate a check or rewrite its assertions.
          const test = await readFile(join(projectRoot, 'sum.test.mjs'), 'utf8');
          return createHash('sha256').update(test.replaceAll('\r\n', '\n')).digest('hex') === '66c51424f33087ac403d414fe1ef35b5ac8e4e976ed674687fcd85fafc7384d8';
        } catch { return false; }
      },
      ...(options.onCommandResult === undefined ? {} : { onResult: options.onCommandResult })
    });
    const registry = new ToolRegistry([
      fileReadTool(async (input, signal) => {
        readCalls += 1;
        const result = await filesystem.readFile(input, signal);
        if (options.onRead !== undefined) await options.onRead(input.path, readCalls);
        return result;
      }),
      textSearchTool(async (input, signal) => { readCalls += 1; return filesystem.searchText(input, signal); }),
      filePatchTool({ execute: async (input, actor, signal) => {
        const setId = await changeSets.open(actor.projectId, actor.runId);
        const result = await new ApplyPatch({
          writer: guardedWriter, blobs, journal, ids, setId,
          nextSequence: () => changeSets.reserveSequence(setId),
          hash: (bytes) => createHash('sha256').update(bytes).digest('hex')
        }).execute(input, actor, signal);
        if (result.status === 'applied' && options.onPatch !== undefined) await options.onPatch(result.entry.path);
        return result;
      } }),
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
      model: options.model ?? new ScriptedModelAdapter(await scenario as FakeScenario),
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
        projectId,
        writer: guardedWriter,
        blobs,
        journal,
        ids,
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
    const recover = new RecoverR2Run({
      projectId,
      mutations: new RecoverMutations({ journal, files: fileHashes }),
      permissions,
      toolCalls
    });
    const agentLoop: R2Infrastructure['agentLoop'] = {
      executeR2: async (request, signal) => {
        let runSetId: string | null = null;
        let runId: string | null = null;
        const result = await loop.executeR2(request, signal, {
          projectId,
          changeSetId: null,
          openChangeSet: async (openedRunId) => {
            const createdSetId = await changeSets.open(projectId, openedRunId);
            runSetId = createdSetId;
            runId = openedRunId;
            await baseline.saveOnce(createdSetId, await git.inspect(signal));
            return createdSetId;
          },
          completion: async () => {
            const setId = runSetId;
            const entries = setId === null ? [] : await journal.entries(setId);
            const pending = await journal.pending(projectId);
            const snapshot = await workspaces.observe(projectId, await observer.inspect(signal));
            const record = runId === null ? null : await verifications.current(runId, snapshot);
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
