import type { EventEnvelope, IsoTimestamp, JsonValue, Uuid } from '@codryn/shared';

export interface DiagnosticSession {
  readonly id: Uuid;
  readonly status: 'created';
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

export interface ProcessSpec {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly env: Readonly<Record<string, string>>;
}

export interface ProcessResult {
  readonly termination: 'exited' | 'timed_out' | 'output_limit_exceeded' | 'spawn_failed';
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
  readonly treeTerminated: boolean;
}

export interface DatabaseEvidence {
  readonly journalMode: 'wal';
  readonly foreignKeysEnabled: true;
  readonly defensiveModeEnabled: true;
  readonly extensionsEnabled: false;
  readonly quickCheck: 'ok';
  readonly migrationVersions: readonly number[];
}

export interface BackupEvidence {
  readonly integrityCheck: 'ok';
  readonly sessionFound: boolean;
  readonly eventFound: boolean;
}

export type CredentialHelperCategory = 'system' | 'custom' | 'plaintext_store' | 'none' | 'unknown';

export interface GitEvidence {
  readonly version: string;
  readonly localCommitCreated: boolean;
  readonly fetchSucceeded: boolean;
  readonly credentialHelperCategory: CredentialHelperCategory;
}

export interface R0DiagnosticProfile {
  readonly outputProcess: ProcessSpec;
  readonly nonzeroProcess: ProcessSpec;
  readonly timeoutTreeProcess: ProcessSpec;
  readonly largeOutputProcess: ProcessSpec;
}

export interface LogEntry {
  readonly level: 'info' | 'error';
  readonly event: string;
  readonly occurredAt: IsoTimestamp;
  readonly correlationId: Uuid;
  readonly data: Readonly<Record<string, JsonValue>>;
}

export type InitialEvent = EventEnvelope & { readonly sessionId: Uuid };
