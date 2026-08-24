import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  ContextAssembler, ControlledPermissionPolicy, fileReadTool, RunAgentLoop,
  textSearchTool, ToolExecutionHarness, ToolRegistry
} from '@codryn/core';
import type { EventStore } from '@codryn/core';
import type { Clock, IdGenerator } from '@codryn/core';
import type { FakeScenario } from './model/scripted-model-adapter.js';
import { ProjectFilesystem } from './filesystem/project-filesystem.js';
import { JsonlDiagnosticLogger } from './logging/jsonl-diagnostic-logger.js';
import { ScriptedModelAdapter } from './model/scripted-model-adapter.js';
import { openR0Database } from './persistence/open-database.js';
import { runMigrations } from './persistence/run-migrations.js';
import { SqliteAgentRunStore } from './persistence/sqlite-agent-run-store.js';
import { SqliteEventStore } from './persistence/sqlite-event-store.js';
import { SqliteToolCallStore } from './persistence/sqlite-tool-call-store.js';
import { SystemClock } from './system/system-clock.js';
import { UuidGenerator } from './system/uuid-generator.js';

export interface R1Infrastructure {
  readonly agentLoop: RunAgentLoop;
  readonly eventStore: EventStore;
  close(): void;
}

export async function createR1Infrastructure(options: {
  readonly userDataPath: string;
  readonly projectRoot: string;
  readonly scenario: FakeScenario;
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
}): Promise<R1Infrastructure> {
  const userDataPath = resolve(options.userDataPath);
  await mkdir(userDataPath, { recursive: true });
  const database = openR0Database(join(userDataPath, 'codryn.sqlite'));
  let closed = false;
  try {
    const clock = options.clock ?? new SystemClock();
    const ids = options.ids ?? new UuidGenerator();
    runMigrations(database, clock.now());
    const filesystem = new ProjectFilesystem(resolve(options.projectRoot));
    const registry = new ToolRegistry([
      fileReadTool((input, signal) => filesystem.readFile(input, signal)),
      textSearchTool((input, signal) => filesystem.searchText(input, signal))
    ]);
    const eventStore = new SqliteEventStore(database);
    const toolExecutionHarness = new ToolExecutionHarness({
      registry, permissionPolicy: new ControlledPermissionPolicy(), toolCallStore: new SqliteToolCallStore(database), clock, ids
    });
    // Constructed here so all R1 runtime collaborators share this single database lifetime.
    new JsonlDiagnosticLogger({ directory: join(userDataPath, 'logs'), redactionPolicy: { sensitiveRoots: [userDataPath, resolve(options.projectRoot)] } });
    return {
      agentLoop: new RunAgentLoop({ contextAssembler: new ContextAssembler(filesystem), model: new ScriptedModelAdapter(options.scenario), registry, toolExecutionHarness, agentRunStore: new SqliteAgentRunStore(database), eventStore, clock, ids }),
      eventStore,
      close() { if (!closed) { closed = true; database.close(); } }
    };
  } catch (error) {
    database.close();
    throw error;
  }
}
