import {
  r0DiagnosticReportSchema,
  r0DiagnosticRequestSchema,
  type JsonValue,
  type R0CheckResult,
  type R0DiagnosticReport,
  type R0DiagnosticRequest,
  type Uuid
} from '@codryn/shared';
import type { BackupEvidence, DatabaseEvidence, GitEvidence, ProcessResult, R0DiagnosticProfile } from './model.js';
import type {
  Clock,
  DatabaseDiagnostics,
  DiagnosticLogger,
  EventStore,
  GitProbe,
  IdGenerator,
  ProcessRunner,
  SessionRepository
} from './ports.js';

type CheckCode = R0CheckResult['code'];

interface CheckSuccess {
  readonly code?: CheckCode;
  readonly message: string;
  readonly evidence: Readonly<Record<string, JsonValue>>;
}

type CheckAttempt<T> =
  | { readonly obtained: true; readonly passed: true; readonly value: T; readonly result: R0CheckResult }
  | { readonly obtained: true; readonly passed: false; readonly value: T; readonly result: R0CheckResult }
  | { readonly obtained: false; readonly passed: false; readonly result: R0CheckResult };

export class R0DiagnosticFailure extends Error {
  constructor(readonly code: CheckCode, rawMessage?: string) {
    super(rawMessage);
  }
}

export interface RunR0DiagnosticsDependencies {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly sessionRepository: SessionRepository;
  readonly eventStore: EventStore;
  readonly databaseDiagnostics: DatabaseDiagnostics;
  readonly processRunner: ProcessRunner;
  readonly gitProbe: GitProbe;
  readonly logger: DiagnosticLogger;
  readonly profile: R0DiagnosticProfile;
}

export class RunR0Diagnostics {
  constructor(private readonly dependencies: RunR0DiagnosticsDependencies) {}

  async execute(input: R0DiagnosticRequest): Promise<R0DiagnosticReport> {
    const request = r0DiagnosticRequestSchema.parse(input);
    const sessionId = this.dependencies.ids.next();
    const startedAt = this.timestamp();
    const checks: R0CheckResult[] = [];

    await this.log('info', 'r0.diagnostic.started', request.requestId, { sessionId });

    const session = {
      id: sessionId,
      status: 'created' as const,
      createdAt: startedAt,
      updatedAt: startedAt
    };
    const initialEvent = {
      eventId: this.dependencies.ids.next(),
      eventType: 'r0.diagnostic.started',
      eventVersion: 1 as const,
      correlationId: request.requestId,
      occurredAt: startedAt,
      source: 'core' as const,
      sessionId,
      payload: { requestId: request.requestId }
    };

    const databaseInspection = await this.runCheck(
      'database.open-and-migrate',
      () => this.dependencies.databaseDiagnostics.inspect(),
      (evidence) => this.validateDatabaseEvidence(evidence)
    );
    checks.push(databaseInspection.result);

    if (databaseInspection.passed) {
      const sessionRoundtrip = await this.runCheck(
        'database.session-roundtrip',
        async () => {
          await this.dependencies.sessionRepository.createWithInitialEvent(session, initialEvent);
          return this.dependencies.sessionRepository.findById(sessionId);
        },
        (foundSession) => {
          if (foundSession?.id !== sessionId) {
            throw new R0DiagnosticFailure('R0_DB_OPEN_FAILED', 'Diagnostic session was not persisted.');
          }
          return { message: 'Diagnostic session round-trip succeeded.', evidence: { sessionFound: true } };
        }
      );
      checks.push(sessionRoundtrip.result);

      if (sessionRoundtrip.passed) {
        const eventRoundtrip = await this.runCheck(
          'database.event-roundtrip',
          () => this.dependencies.eventStore.findBySessionId(sessionId),
          (events) => {
            if (!events.some((event) => event.eventId === initialEvent.eventId)) {
              throw new R0DiagnosticFailure('R0_DB_OPEN_FAILED', 'Diagnostic event was not persisted.');
            }
            return { message: 'Diagnostic event round-trip succeeded.', evidence: { eventFound: true } };
          }
        );
        checks.push(eventRoundtrip.result);

        if (eventRoundtrip.passed) {
          checks.push((await this.runCheck(
            'database.backup',
            () => this.dependencies.databaseDiagnostics.backupAndVerify(sessionId),
            (evidence) => this.validateBackupEvidence(evidence)
          )).result);
        } else {
          checks.push(this.skipped('database.backup'));
        }
      } else {
        checks.push(this.skipped('database.event-roundtrip'), this.skipped('database.backup'));
      }
    } else {
      checks.push(
        this.skipped('database.session-roundtrip'),
        this.skipped('database.event-roundtrip'),
        this.skipped('database.backup')
      );
    }

    checks.push((await this.runCheck(
      'process.stdout-stderr',
      () => this.dependencies.processRunner.run(this.dependencies.profile.outputProcess),
      (result) => this.validateMixedOutput(result)
    )).result);
    checks.push((await this.runCheck(
      'process.nonzero-exit',
      () => this.dependencies.processRunner.run(this.dependencies.profile.nonzeroProcess),
      (result) => this.validateNonzeroExit(result)
    )).result);
    checks.push((await this.runCheck(
      'process.timeout-tree',
      () => this.dependencies.processRunner.run(this.dependencies.profile.timeoutTreeProcess),
      (result) => this.validateTimeoutTree(result)
    )).result);
    checks.push((await this.runCheck(
      'process.output-limit',
      () => this.dependencies.processRunner.run(this.dependencies.profile.largeOutputProcess),
      (result) => this.validateOutputLimit(result)
    )).result);

    const gitInspection = await this.runCheck(
      'git.version',
      () => this.dependencies.gitProbe.inspect(),
      (evidence) => this.validateGitVersion(evidence)
    );
    checks.push(gitInspection.result);
    if (gitInspection.obtained) {
      checks.push((await this.runCheck(
        'git.local-remote',
        async () => gitInspection.value,
        (evidence) => this.validateGitFixture(evidence)
      )).result);
      checks.push((await this.runCheck(
        'git.credential-helper',
        async () => gitInspection.value,
        (evidence) => this.validateCredentialHelper(evidence)
      )).result);
    } else {
      checks.push(this.skipped('git.local-remote'), this.skipped('git.credential-helper'));
    }

    const finishedAt = this.timestamp();
    const report: R0DiagnosticReport = {
      schemaVersion: 1,
      requestId: request.requestId,
      sessionId,
      overallStatus: checks.every((check) => check.status === 'pass') ? 'passed' : 'failed',
      startedAt,
      finishedAt,
      durationMs: this.duration(startedAt, finishedAt),
      checks
    };
    await this.log('info', 'r0.diagnostic.finished', request.requestId, {
      sessionId,
      overallStatus: report.overallStatus,
      checkCount: report.checks.length
    });
    return r0DiagnosticReportSchema.parse(report);
  }

  private async runCheck<T>(
    checkId: string,
    operation: () => Promise<T>,
    validate: (value: T) => CheckSuccess
  ): Promise<CheckAttempt<T>> {
    const startedAt = this.timestamp();
    let value: T;
    try {
      value = await operation();
    } catch (error: unknown) {
      return { obtained: false, passed: false, result: this.failedCheck(checkId, startedAt, error) };
    }
    try {
      const success = validate(value);
      const finishedAt = this.timestamp();
      return {
        obtained: true,
        passed: true,
        value,
        result: {
          checkId,
          status: 'pass',
          code: success.code ?? 'R0_OK',
          message: success.message,
          startedAt,
          finishedAt,
          durationMs: this.duration(startedAt, finishedAt),
          evidence: success.evidence
        }
      };
    } catch (error: unknown) {
      return { obtained: true, passed: false, value, result: this.failedCheck(checkId, startedAt, error) };
    }
  }

  private validateDatabaseEvidence(evidence: DatabaseEvidence): CheckSuccess {
    if (evidence.journalMode !== 'wal' || !evidence.foreignKeysEnabled || !evidence.defensiveModeEnabled || evidence.extensionsEnabled) {
      throw new R0DiagnosticFailure('R0_DB_OPEN_FAILED', 'Database safety configuration is invalid.');
    }
    if (!Array.isArray(evidence.migrationVersions)) {
      throw new R0DiagnosticFailure('R0_DB_MIGRATION_FAILED', 'Database migration evidence is invalid.');
    }
    if (evidence.quickCheck !== 'ok') {
      throw new R0DiagnosticFailure('R0_DB_INTEGRITY_FAILED', 'Database integrity check did not pass.');
    }
    return {
      message: 'Database opened, migrated, and passed integrity checks.',
      evidence: {
        journalMode: evidence.journalMode,
        foreignKeysEnabled: evidence.foreignKeysEnabled,
        defensiveModeEnabled: evidence.defensiveModeEnabled,
        extensionsEnabled: evidence.extensionsEnabled,
        quickCheck: evidence.quickCheck,
        migrationVersions: [...evidence.migrationVersions]
      }
    };
  }

  private validateBackupEvidence(evidence: BackupEvidence): CheckSuccess {
    if (evidence.integrityCheck !== 'ok' || !evidence.sessionFound || !evidence.eventFound) {
      throw new R0DiagnosticFailure('R0_DB_BACKUP_FAILED', 'Database backup verification failed.');
    }
    return {
      message: 'Database backup verification succeeded.',
      evidence: { integrityCheck: evidence.integrityCheck, sessionFound: evidence.sessionFound, eventFound: evidence.eventFound }
    };
  }

  private validateMixedOutput(result: ProcessResult): CheckSuccess {
    this.requireExited(result, 0);
    if (result.stdout.length === 0 || result.stderr.length === 0 || result.stdoutTruncated || result.stderrTruncated) {
      throw new R0DiagnosticFailure('R0_PROCESS_EXIT_NONZERO', 'Process did not capture the expected mixed output.');
    }
    return this.processSuccess('Process captured standard output and error output.', result);
  }

  private validateNonzeroExit(result: ProcessResult): CheckSuccess {
    this.requireExited(result, 7);
    if (result.stdout.length === 0 || result.stderr.length === 0) {
      throw new R0DiagnosticFailure('R0_PROCESS_EXIT_NONZERO', 'Non-zero process fixture did not capture both output streams.');
    }
    return this.processSuccess('Process preserved expected non-zero exit evidence.', result);
  }

  private validateTimeoutTree(result: ProcessResult): CheckSuccess {
    if (result.termination === 'spawn_failed') {
      throw new R0DiagnosticFailure('R0_PROCESS_SPAWN_FAILED');
    }
    if (result.termination !== 'timed_out') {
      throw new R0DiagnosticFailure('R0_PROCESS_TIMED_OUT');
    }
    if (!result.treeTerminated) {
      throw new R0DiagnosticFailure('R0_PROCESS_TREE_REMAINS');
    }
    return this.processSuccess('Timed-out process tree was terminated.', result);
  }

  private validateOutputLimit(result: ProcessResult): CheckSuccess {
    if (result.termination === 'spawn_failed') {
      throw new R0DiagnosticFailure('R0_PROCESS_SPAWN_FAILED');
    }
    if (
      result.termination !== 'output_limit_exceeded' ||
      (!result.stdoutTruncated && !result.stderrTruncated)
    ) {
      throw new R0DiagnosticFailure('R0_PROCESS_OUTPUT_LIMIT');
    }
    if (!result.treeTerminated) {
      throw new R0DiagnosticFailure('R0_PROCESS_TREE_REMAINS');
    }
    return this.processSuccess('Process output limit was enforced.', result);
  }

  private requireExited(result: ProcessResult, expectedExitCode: number): void {
    if (result.termination === 'spawn_failed') {
      throw new R0DiagnosticFailure('R0_PROCESS_SPAWN_FAILED', 'Process fixture could not be started.');
    }
    if (result.termination === 'timed_out') {
      throw new R0DiagnosticFailure(result.treeTerminated ? 'R0_PROCESS_TIMED_OUT' : 'R0_PROCESS_TREE_REMAINS', 'Process fixture timed out unexpectedly.');
    }
    if (result.termination === 'output_limit_exceeded') {
      throw new R0DiagnosticFailure('R0_PROCESS_OUTPUT_LIMIT', 'Process fixture exceeded its output limit unexpectedly.');
    }
    if (result.exitCode !== expectedExitCode) {
      throw new R0DiagnosticFailure('R0_PROCESS_EXIT_NONZERO', 'Process exited with an unexpected code.');
    }
  }

  private processSuccess(message: string, result: ProcessResult): CheckSuccess {
    return {
      message,
      evidence: {
        termination: result.termination,
        exitCode: result.exitCode,
        signal: result.signal,
        durationMs: result.durationMs,
        stdoutTruncated: result.stdoutTruncated,
        stderrTruncated: result.stderrTruncated,
        treeTerminated: result.treeTerminated
      }
    };
  }

  private validateGitVersion(evidence: GitEvidence): CheckSuccess {
    if (evidence.version.length === 0) {
      throw new R0DiagnosticFailure('R0_GIT_NOT_AVAILABLE', 'Git version could not be determined.');
    }
    return { message: 'Git version was detected.', evidence: { version: evidence.version } };
  }

  private validateGitFixture(evidence: GitEvidence): CheckSuccess {
    if (!evidence.localCommitCreated || !evidence.fetchSucceeded) {
      throw new R0DiagnosticFailure('R0_GIT_FIXTURE_FAILED', 'Git local-remote fixture failed.');
    }
    return {
      message: 'Git local commit and fetch fixture succeeded.',
      evidence: { localCommitCreated: evidence.localCommitCreated, fetchSucceeded: evidence.fetchSucceeded }
    };
  }

  private validateCredentialHelper(evidence: GitEvidence): CheckSuccess {
    if (evidence.credentialHelperCategory !== 'system' && evidence.credentialHelperCategory !== 'none') {
      throw new R0DiagnosticFailure('R0_GIT_CREDENTIAL_UNSAFE', 'Git credential helper category is unsafe.');
    }
    return { message: 'Git credential helper category is safe.', evidence: { category: evidence.credentialHelperCategory } };
  }

  private skipped(checkId: string): R0CheckResult {
    const occurredAt = this.timestamp();
    return {
      checkId,
      status: 'skipped',
      code: 'R0_SKIPPED_DEPENDENCY',
      message: 'Skipped because a required diagnostic prerequisite failed.',
      startedAt: occurredAt,
      finishedAt: occurredAt,
      durationMs: 0,
      evidence: {}
    };
  }

  private async log(
    level: 'info' | 'error',
    event: string,
    correlationId: Uuid,
    data: Readonly<Record<string, JsonValue>>
  ): Promise<void> {
    try {
      await this.dependencies.logger.write({ level, event, occurredAt: this.timestamp(), correlationId, data });
    } catch {
      // Logging must not make a diagnostic report unavailable.
    }
  }

  private timestamp(): R0DiagnosticReport['startedAt'] {
    return this.dependencies.clock.now() as R0DiagnosticReport['startedAt'];
  }

  private duration(startedAt: string, finishedAt: string): number {
    return Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
  }

  private failedCheck(checkId: string, startedAt: R0DiagnosticReport['startedAt'], error: unknown): R0CheckResult {
    const code = error instanceof R0DiagnosticFailure ? error.code : 'R0_INTERNAL_ERROR';
    const finishedAt = this.timestamp();
    return {
      checkId,
      status: 'fail',
      code,
      message: 'Diagnostic check failed. See the stable code for details.',
      startedAt,
      finishedAt,
      durationMs: this.duration(startedAt, finishedAt),
      evidence: {}
    };
  }
}
