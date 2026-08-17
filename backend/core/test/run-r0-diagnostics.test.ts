import { describe, expect, it } from 'vitest';
import type { EventEnvelope, Uuid } from '@codryn/shared';
import { R0DiagnosticFailure, RunR0Diagnostics } from '../src/index.js';
import type { BackupEvidence, DatabaseEvidence, DiagnosticSession, GitEvidence, InitialEvent, LogEntry, ProcessResult, ProcessSpec } from '../src/index.js';

const request = {
  requestId: '00000000-0000-4000-8000-000000000101',
  requestedAt: '2026-08-17T00:00:00.000Z'
} as const;

const expectedCheckIds = [
  'database.open-and-migrate',
  'database.session-roundtrip',
  'database.event-roundtrip',
  'database.backup',
  'process.stdout-stderr',
  'process.nonzero-exit',
  'process.timeout-tree',
  'process.output-limit',
  'git.version',
  'git.local-remote',
  'git.credential-helper'
] as const;

const profile = {
  outputProcess: { executable: 'output', args: [], cwd: '.', timeoutMs: 100, maxOutputBytes: 1024, env: {} },
  nonzeroProcess: { executable: 'nonzero', args: [], cwd: '.', timeoutMs: 100, maxOutputBytes: 1024, env: {} },
  timeoutTreeProcess: { executable: 'timeout', args: [], cwd: '.', timeoutMs: 100, maxOutputBytes: 1024, env: {} },
  largeOutputProcess: { executable: 'large', args: [], cwd: '.', timeoutMs: 100, maxOutputBytes: 1024, env: {} }
} as const;

const successfulDatabaseEvidence = {
  journalMode: 'wal',
  foreignKeysEnabled: true,
  defensiveModeEnabled: true,
  extensionsEnabled: false,
  quickCheck: 'ok',
  migrationVersions: [1]
} as const;

const successfulBackupEvidence = {
  integrityCheck: 'ok',
  sessionFound: true,
  eventFound: true
} as const;

const successfulGitEvidence = {
  version: '2.49.0',
  localCommitCreated: true,
  fetchSucceeded: true,
  credentialHelperCategory: 'system'
} as const;

const processResults: readonly ProcessResult[] = [
  { termination: 'exited', exitCode: 0, signal: null, stdout: 'stdout', stderr: 'stderr', durationMs: 3, stdoutTruncated: false, stderrTruncated: false, treeTerminated: true },
  { termination: 'exited', exitCode: 7, signal: null, stdout: 'stdout', stderr: 'stderr', durationMs: 3, stdoutTruncated: false, stderrTruncated: false, treeTerminated: true },
  { termination: 'timed_out', exitCode: null, signal: 'SIGTERM', stdout: '', stderr: '', durationMs: 100, stdoutTruncated: false, stderrTruncated: false, treeTerminated: true },
  { termination: 'output_limit_exceeded', exitCode: null, signal: 'SIGTERM', stdout: 'truncated', stderr: 'truncated', durationMs: 4, stdoutTruncated: true, stderrTruncated: true, treeTerminated: true }
] as const;

class FakeClock {
  now(): string {
    return '2026-08-17T00:00:00.000Z';
  }
}

class FakeIds {
  readonly values: readonly Uuid[] = [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002'
  ];
  calls = 0;

  next(): Uuid {
    const value = this.values[this.calls];
    this.calls += 1;
    if (value === undefined) throw new Error('unexpected ID request');
    return value;
  }
}

class FakeEventStore {
  readonly events: EventEnvelope[] = [];

  constructor(private readonly trace: string[]) {}

  async append(event: EventEnvelope): Promise<void> {
    this.events.push(event);
  }

  async findBySessionId(sessionId: Uuid): Promise<readonly EventEnvelope[]> {
    this.trace.push('event-read');
    return this.events.filter((event) => event.sessionId === sessionId);
  }

  eventsFor(sessionId: Uuid): readonly EventEnvelope[] {
    return this.events.filter((event) => event.sessionId === sessionId);
  }

  persistInitial(event: InitialEvent): void {
    this.trace.push('atomic-persist');
    this.events.push(event);
  }
}

class FakeSessionRepository {
  createdCount = 0;
  private session: DiagnosticSession | null = null;

  constructor(private readonly eventStore: FakeEventStore, private readonly trace: string[]) {}

  async createWithInitialEvent(session: DiagnosticSession, event: InitialEvent): Promise<void> {
    this.createdCount += 1;
    this.session = session;
    this.eventStore.persistInitial(event);
  }

  async findById(id: Uuid): Promise<DiagnosticSession | null> {
    this.trace.push('session-read');
    return this.session?.id === id ? this.session : null;
  }
}

class FakeDatabaseDiagnostics {
  inspectEvidence: DatabaseEvidence = successfulDatabaseEvidence;
  inspectError: unknown = null;
  backupError: unknown = null;
  readonly backupSessionIds: Uuid[] = [];

  constructor(private readonly trace: string[]) {}

  async inspect(): Promise<DatabaseEvidence> {
    this.trace.push('inspect');
    if (this.inspectError !== null) throw this.inspectError;
    return this.inspectEvidence;
  }

  async backupAndVerify(sessionId: Uuid): Promise<BackupEvidence> {
    this.trace.push('backup');
    this.backupSessionIds.push(sessionId);
    if (this.backupError !== null) throw this.backupError;
    return successfulBackupEvidence;
  }
}

class FakeProcessRunner {
  calls = 0;
  results: ProcessResult[] = [...processResults];
  readonly specs: ProcessSpec[] = [];

  constructor(private readonly expectedSpecs: readonly ProcessSpec[]) {}

  async run(spec: ProcessSpec): Promise<ProcessResult> {
    this.specs.push(spec);
    expect(spec).toEqual(this.expectedSpecs[this.calls]);
    const result = this.results[this.calls];
    this.calls += 1;
    if (result === undefined) throw new Error('unexpected process call');
    return result;
  }
}

class FakeGitProbe {
  calls = 0;
  evidence: GitEvidence = successfulGitEvidence;
  inspectError: unknown = null;

  async inspect(): Promise<GitEvidence> {
    this.calls += 1;
    if (this.inspectError !== null) throw this.inspectError;
    return this.evidence;
  }
}

class FakeLogger {
  readonly entries: LogEntry[] = [];

  async write(entry: LogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

function createSubject() {
  const trace: string[] = [];
  const ids = new FakeIds();
  const eventStore = new FakeEventStore(trace);
  const sessionRepository = new FakeSessionRepository(eventStore, trace);
  const databaseDiagnostics = new FakeDatabaseDiagnostics(trace);
  const processRunner = new FakeProcessRunner([
    profile.outputProcess,
    profile.nonzeroProcess,
    profile.timeoutTreeProcess,
    profile.largeOutputProcess
  ]);
  const gitProbe = new FakeGitProbe();
  const logger = new FakeLogger();
  const subject = new RunR0Diagnostics({
    clock: new FakeClock(),
    ids,
    sessionRepository,
    eventStore,
    databaseDiagnostics,
    processRunner,
    gitProbe,
    logger,
    profile
  });
  return { subject, ids, trace, sessionRepository, eventStore, databaseDiagnostics, processRunner, gitProbe, logger };
}

function check(report: Awaited<ReturnType<RunR0Diagnostics['execute']>>, checkId: string) {
  const result = report.checks.find((candidate) => candidate.checkId === checkId);
  if (result === undefined) throw new Error(`Missing ${checkId}`);
  return result;
}

describe('RunR0Diagnostics', () => {
  it('reports every R0 check as passed in deterministic order', async () => {
    const { subject, ids, trace, sessionRepository, eventStore, databaseDiagnostics, processRunner, logger } = createSubject();

    const report = await subject.execute(request);

    expect(report.overallStatus).toBe('passed');
    expect(report.checks.map((result) => result.checkId)).toEqual(expectedCheckIds);
    expect(report.checks.every((result) => result.status === 'pass')).toBe(true);
    expect(sessionRepository.createdCount).toBe(1);
    expect(eventStore.eventsFor(report.sessionId)).toHaveLength(1);
    expect(ids.calls).toBe(2);
    expect(report.sessionId).toBe('00000000-0000-4000-8000-000000000001');
    expect(eventStore.events[0]?.eventId).toBe('00000000-0000-4000-8000-000000000002');
    expect(trace).toEqual(['inspect', 'atomic-persist', 'session-read', 'event-read', 'backup']);
    expect(databaseDiagnostics.backupSessionIds).toEqual([report.sessionId]);
    expect(processRunner.specs).toEqual([
      profile.outputProcess,
      profile.nonzeroProcess,
      profile.timeoutTreeProcess,
      profile.largeOutputProcess
    ]);
    expect(logger.entries.map((entry) => entry.event)).toEqual(['r0.diagnostic.started', 'r0.diagnostic.finished']);
  });

  it('skips database dependants but still executes process and Git checks', async () => {
    const { subject, databaseDiagnostics, processRunner, gitProbe } = createSubject();
    databaseDiagnostics.inspectError = new R0DiagnosticFailure('R0_DB_OPEN_FAILED');

    const report = await subject.execute(request);

    expect(check(report, 'database.open-and-migrate')).toMatchObject({ status: 'fail', code: 'R0_DB_OPEN_FAILED' });
    expect(report.checks.filter((result) => result.checkId.startsWith('database.') && result.status === 'skipped')).toHaveLength(3);
    expect(processRunner.calls).toBe(4);
    expect(gitProbe.calls).toBe(1);
  });

  it('fails when a timed-out process leaves its child tree alive but completes independent checks', async () => {
    const { subject, processRunner, gitProbe } = createSubject();
    const timeoutResult = processRunner.results[2];
    if (timeoutResult === undefined) throw new Error('Missing timeout fixture result.');
    processRunner.results[2] = { ...timeoutResult, treeTerminated: false };

    const report = await subject.execute(request);

    expect(check(report, 'process.timeout-tree')).toMatchObject({ status: 'fail', code: 'R0_PROCESS_TREE_REMAINS' });
    expect(report.overallStatus).toBe('failed');
    expect(processRunner.specs).toEqual([
      profile.outputProcess,
      profile.nonzeroProcess,
      profile.timeoutTreeProcess,
      profile.largeOutputProcess
    ]);
    expect(gitProbe.calls).toBe(1);
  });

  it('fails output-limit check when its process tree remains alive', async () => {
    const { subject, processRunner } = createSubject();
    const outputLimitResult = processRunner.results[3];
    if (outputLimitResult === undefined) throw new Error('Missing output-limit fixture result.');
    processRunner.results[3] = { ...outputLimitResult, treeTerminated: false };

    const report = await subject.execute(request);

    expect(check(report, 'process.output-limit')).toMatchObject({ status: 'fail', code: 'R0_PROCESS_TREE_REMAINS' });
  });

  it.each(['process.timeout-tree', 'process.output-limit'] as const)('maps spawn failures in %s to R0_PROCESS_SPAWN_FAILED', async (checkId) => {
    const { subject, processRunner } = createSubject();
    const index = checkId === 'process.timeout-tree' ? 2 : 3;
    processRunner.results[index] = {
      termination: 'spawn_failed', exitCode: null, signal: null, stdout: '', stderr: '', durationMs: 1,
      stdoutTruncated: false, stderrTruncated: false, treeTerminated: false
    };

    const report = await subject.execute(request);

    expect(check(report, checkId)).toMatchObject({ status: 'fail', code: 'R0_PROCESS_SPAWN_FAILED' });
  });

  it.each(['plaintext_store', 'custom', 'unknown'] as const)('fails unsafe credential category %s without exposing helper output', async (credentialHelperCategory) => {
    const { subject, gitProbe, logger } = createSubject();
    gitProbe.evidence = { ...successfulGitEvidence, credentialHelperCategory, rawCredentialHelperOutput: 'super-secret-value' } as GitEvidence;

    const report = await subject.execute(request);

    expect(check(report, 'git.credential-helper')).toMatchObject({ status: 'fail', code: 'R0_GIT_CREDENTIAL_UNSAFE' });
    expect(JSON.stringify(report)).not.toContain('super-secret-value');
    expect(JSON.stringify(logger.entries)).not.toContain('super-secret-value');
  });

  it('accepts system and none credential categories', async () => {
    for (const credentialHelperCategory of ['system', 'none'] as const) {
      const { subject, gitProbe } = createSubject();
      gitProbe.evidence = { ...successfulGitEvidence, credentialHelperCategory };
      const report = await subject.execute(request);
      expect(check(report, 'git.credential-helper')).toMatchObject({ status: 'pass', code: 'R0_OK' });
    }
  });

  it('returns failed when any mandatory check is skipped', async () => {
    const { subject, databaseDiagnostics } = createSubject();
    databaseDiagnostics.inspectError = new R0DiagnosticFailure('R0_DB_OPEN_FAILED');

    const report = await subject.execute(request);

    expect(report.overallStatus).toBe('failed');
  });

  it('maps an unknown adapter exception to R0_INTERNAL_ERROR without leaking raw values', async () => {
    const { subject, databaseDiagnostics, logger } = createSubject();
    databaseDiagnostics.inspectError = new Error('super-secret-value');

    const report = await subject.execute(request);

    expect(check(report, 'database.open-and-migrate')).toMatchObject({ status: 'fail', code: 'R0_INTERNAL_ERROR' });
    expect(JSON.stringify(report)).not.toContain('super-secret-value');
    expect(JSON.stringify(logger.entries)).not.toContain('super-secret-value');
  });

  it.each([
    ['inspect', 'R0_DB_OPEN_FAILED'],
    ['inspect', 'R0_DB_MIGRATION_FAILED'],
    ['inspect', 'R0_DB_INTEGRITY_FAILED'],
    ['backup', 'R0_DB_BACKUP_FAILED']
  ] as const)('preserves safe database adapter failure code %s/%s', async (operation, code) => {
    const { subject, databaseDiagnostics } = createSubject();
    const rawFailureMessage = 'super-secret-value';
    const failure = new R0DiagnosticFailure(code, rawFailureMessage);
    if (operation === 'inspect') databaseDiagnostics.inspectError = failure;
    else databaseDiagnostics.backupError = failure;

    const report = await subject.execute(request);

    expect(check(report, operation === 'inspect' ? 'database.open-and-migrate' : 'database.backup')).toMatchObject({ status: 'fail', code });
    expect(JSON.stringify(report)).not.toContain(rawFailureMessage);
  });

  it('evaluates Git local-remote and credential evidence after a version check failure', async () => {
    const { subject, gitProbe } = createSubject();
    gitProbe.evidence = { version: '', localCommitCreated: true, fetchSucceeded: true, credentialHelperCategory: 'none' };

    const report = await subject.execute(request);

    expect(check(report, 'git.version')).toMatchObject({ status: 'fail', code: 'R0_GIT_NOT_AVAILABLE' });
    expect(check(report, 'git.local-remote')).toMatchObject({ status: 'pass', code: 'R0_OK' });
    expect(check(report, 'git.credential-helper')).toMatchObject({ status: 'pass', code: 'R0_OK' });
  });

  it('skips dependent Git checks only when evidence cannot be obtained', async () => {
    const { subject, gitProbe } = createSubject();
    gitProbe.inspectError = new Error('super-secret-value');

    const report = await subject.execute(request);

    expect(check(report, 'git.version')).toMatchObject({ status: 'fail', code: 'R0_INTERNAL_ERROR' });
    expect(check(report, 'git.local-remote')).toMatchObject({ status: 'skipped', code: 'R0_SKIPPED_DEPENDENCY' });
    expect(check(report, 'git.credential-helper')).toMatchObject({ status: 'skipped', code: 'R0_SKIPPED_DEPENDENCY' });
    expect(JSON.stringify(report)).not.toContain('super-secret-value');
  });

  it('validates a direct request before calling adapters', async () => {
    const { subject, processRunner } = createSubject();

    await expect(subject.execute({ requestId: 'not-a-uuid', requestedAt: 'nope' } as never)).rejects.toThrow();
    expect(processRunner.calls).toBe(0);
  });
});
