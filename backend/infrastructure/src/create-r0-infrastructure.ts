import { mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { R0DiagnosticProfile, RunR0DiagnosticsDependencies } from '@codryn/core';
import { LocalGitProbe } from './git/local-git-probe.js';
import { JsonlDiagnosticLogger } from './logging/jsonl-diagnostic-logger.js';
import { openR0Database } from './persistence/open-database.js';
import { runMigrations } from './persistence/run-migrations.js';
import { SqliteDiagnostics } from './persistence/sqlite-diagnostics.js';
import { SqliteEventStore } from './persistence/sqlite-event-store.js';
import { SqliteSessionRepository } from './persistence/sqlite-session-repository.js';
import { WindowsProcessRunner } from './process/windows-process-runner.js';
import { SystemClock } from './system/system-clock.js';
import { UuidGenerator } from './system/uuid-generator.js';

export interface R0Infrastructure extends RunR0DiagnosticsDependencies {
  close(): void;
}

const selectedKeys = ['SystemRoot', 'PATH', 'TEMP', 'TMP', 'USERPROFILE'] as const;

function childEnvironment(): Readonly<Record<string, string>> {
  const result: Record<string, string> = {
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'Never'
  };
  for (const key of selectedKeys) {
    const value = process.env[key];
    if (value !== undefined) result[key] = value;
  }
  return Object.freeze(result);
}

export async function createR0Infrastructure(options: {
  readonly userDataPath: string;
  readonly fixtureDirectory: string;
}): Promise<R0Infrastructure> {
  const userDataPath = resolve(options.userDataPath);
  const fixtureDirectory = resolve(options.fixtureDirectory);
  const logs = join(userDataPath, 'logs');
  await mkdir(logs, { recursive: true });
  await mkdir(join(userDataPath, 'backups'), { recursive: true });

  const databasePath = join(userDataPath, 'codryn.sqlite');
  const database = openR0Database(databasePath);
  let closed = false;
  try {
    const clock = new SystemClock();
    runMigrations(database, clock.now());
    const processRunner = new WindowsProcessRunner();
    const env = childEnvironment();
    const powershell = join(env.SystemRoot ?? '', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const spec = (script: string, timeoutMs: number, maxOutputBytes: number, scriptArgs: readonly string[] = []) => Object.freeze({
      executable: powershell,
      args: Object.freeze(['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(fixtureDirectory, script), ...scriptArgs]),
      cwd: fixtureDirectory,
      timeoutMs,
      maxOutputBytes,
      env
    });
    const profile: R0DiagnosticProfile = Object.freeze({
      outputProcess: spec('emit-output.ps1', 10_000, 65_536),
      nonzeroProcess: spec('exit-nonzero.ps1', 10_000, 65_536),
      timeoutTreeProcess: spec('spawn-child-tree.ps1', 10_000, 65_536, [
        '-ChildPidFile', join(userDataPath, 'r0-child.pid'),
        '-ParentIdentityFile', join(userDataPath, 'r0-parent-identity.json'),
        '-ChildIdentityFile', join(userDataPath, 'r0-child-identity.json')
      ]),
      largeOutputProcess: spec('large-output.ps1', 10_000, 4_096, [
        '-IdentityFile', join(userDataPath, 'r0-large-output-identity.json')
      ])
    });

    return {
      clock,
      ids: new UuidGenerator(),
      sessionRepository: new SqliteSessionRepository(database),
      eventStore: new SqliteEventStore(database),
      databaseDiagnostics: new SqliteDiagnostics(database, databasePath),
      processRunner,
      gitProbe: new LocalGitProbe({
        runner: processRunner,
        gitExecutable: 'git.exe',
        env,
        tempDirectoryFactory: () => mkdtemp(join(userDataPath, 'git-probe-'))
      }),
      logger: new JsonlDiagnosticLogger({
        directory: logs,
        redactionPolicy: { sensitiveRoots: [userDataPath] }
      }),
      profile,
      close(): void {
        if (closed) return;
        closed = true;
        database.close();
      }
    };
  } catch (error) {
    database.close();
    throw error;
  }
}
