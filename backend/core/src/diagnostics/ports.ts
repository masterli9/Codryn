import type { EventEnvelope, Uuid } from '@codryn/shared';
import type {
  BackupEvidence,
  DatabaseEvidence,
  DiagnosticSession,
  GitEvidence,
  InitialEvent,
  LogEntry,
  ProcessResult,
  ProcessSpec
} from './model.js';

export interface Clock { now(): string; }
export interface IdGenerator { next(): Uuid; }

export interface SessionRepository {
  createWithInitialEvent(session: DiagnosticSession, event: InitialEvent): Promise<void>;
  findById(id: Uuid): Promise<DiagnosticSession | null>;
}

export interface EventStore {
  append(event: EventEnvelope): Promise<void>;
  findBySessionId(sessionId: Uuid): Promise<readonly EventEnvelope[]>;
}

export interface DatabaseDiagnostics {
  inspect(): Promise<DatabaseEvidence>;
  backupAndVerify(sessionId: Uuid): Promise<BackupEvidence>;
}

export interface ProcessRunner { run(spec: ProcessSpec): Promise<ProcessResult>; }
export interface GitProbe { inspect(): Promise<GitEvidence>; }
export interface DiagnosticLogger { write(entry: LogEntry): Promise<void>; }
