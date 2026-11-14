import { verificationRecordSchema, type VerificationRecord, type CommandSpec } from '@codryn/shared';
import type { ChangeActor } from '../changes/ports.js';
import type { CommandResult, CommandRunner, CommandOutput } from '../process/ports.js';
import type { Clock, IdGenerator } from '../diagnostics/ports.js';
import type { WorkspaceObserver, WorkspaceSnapshot, WorkspaceStore } from '../workspace/ports.js';
import type { VerificationCoverage, VerificationStore } from './verification-store.js';

export interface ClassifiedCheck extends VerificationCoverage {
  readonly kind: VerificationRecord['kind'];
  readonly profileId: 'r4-ts-v1';
  readonly inputHashes: Readonly<Record<string, string>>;
  readonly evidenceFormat: 'node-tap' | 'vitest-json' | null;
}

function positiveCount(total: unknown, passed: unknown, failed: unknown): boolean {
  return typeof total === 'number' && Number.isSafeInteger(total) && total > 0 && passed === total && failed === 0;
}

function passedTests(stdout: string, format: ClassifiedCheck['evidenceFormat']): boolean {
  if (format === null) return true;
  if (format === 'vitest-json') {
    try {
      const report: unknown = JSON.parse(stdout);
      if (report === null || typeof report !== 'object') return false;
      const fields = report as Record<string, unknown>;
      return positiveCount(fields.numTotalTests, fields.numPassedTests, fields.numFailedTests);
    } catch { return false; }
  }
  const summary = /(?:^|\n)# tests (\d+)\r?\n# suites \d+\r?\n# pass (\d+)\r?\n# fail (\d+)\r?\n(?:# [^\r\n]*\r?\n)*$/u.exec(stdout);
  return summary !== null && positiveCount(Number(summary[1]), Number(summary[2]), Number(summary[3]));
}

export interface VerificationAssessment {
  readonly exitCode: number | null;
  readonly treeStopped: boolean;
  readonly truncated: boolean;
  readonly processStatus: CommandResult['status'];
  readonly before: WorkspaceSnapshot;
  readonly after: WorkspaceSnapshot;
  readonly watcherChanged: boolean;
  readonly relevant: boolean;
}

export function assessVerification(input: VerificationAssessment): VerificationRecord['result'] {
  if (!input.relevant || !input.treeStopped || input.truncated
    || !input.before.complete || !input.after.complete || input.watcherChanged
    || input.before.revision !== input.after.revision
    || input.before.gitIdentity !== input.after.gitIdentity
    || input.before.fingerprint !== input.after.fingerprint) return 'incomplete';
  if (input.processStatus === 'succeeded' && input.exitCode === 0) return 'passed';
  if (input.processStatus === 'failed' && input.exitCode !== null) return 'failed';
  return 'incomplete';
}

function reasonFor(result: VerificationRecord['result'], process: CommandResult, before: WorkspaceSnapshot, after: WorkspaceSnapshot): string {
  if (result === 'passed') return 'Process succeeded and the complete project snapshot stayed unchanged.';
  if (result === 'failed') return 'The verification process exited with a non-zero exit code.';
  if (!process.treeStopped) return 'The complete process tree was not proven stopped.';
  if (process.truncated) return 'Process output exceeded the configured limit.';
  if (!before.complete || !after.complete) return 'Workspace observation was incomplete.';
  if (before.revision !== after.revision || before.fingerprint !== after.fingerprint || before.gitIdentity !== after.gitIdentity
    || before.watcherGeneration !== after.watcherGeneration) return 'The project changed during or after the test.';
  return 'Verification conditions were not all satisfied.';
}

export interface VerifyCommandDependencies {
  readonly runner: CommandRunner;
  readonly observer: WorkspaceObserver;
  readonly workspaces: WorkspaceStore;
  readonly store: VerificationStore;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly isRelevant?: (command: CommandSpec, snapshot: WorkspaceSnapshot) => boolean | Promise<boolean>;
  readonly classify?: (command: CommandSpec, snapshot: WorkspaceSnapshot, signal: AbortSignal) => Promise<ClassifiedCheck | null>;
  readonly onResult?: (result: CommandResult) => Promise<void>;
  readonly runnerForActor?: (actor: ChangeActor) => CommandRunner;
  readonly onOutput?: (actor: ChangeActor, output: CommandOutput) => void;
  readonly coverageFor?: (command: CommandSpec, relevant: boolean) => { readonly profileId: string; readonly coveredPaths: readonly string[] } | undefined;
}

export class VerifyCommand {
  constructor(private readonly dependencies: VerifyCommandDependencies) {}

  async execute(command: CommandSpec, actor: ChangeActor, signal: AbortSignal): Promise<VerificationRecord> {
    return (await this.executeWithResult(command, actor, signal)).record;
  }

  async executeWithResult(command: CommandSpec, actor: ChangeActor, signal: AbortSignal): Promise<{ record: VerificationRecord; process: CommandResult }> {
    const before = await this.snapshot(actor.projectId, signal);
    const classified = await this.dependencies.classify?.(command, before, signal);
    const referenceRelevant = await this.dependencies.isRelevant?.(command, before) ?? false;
    const relevant = classified != null || referenceRelevant;
    const runner = this.dependencies.runnerForActor?.(actor) ?? this.dependencies.runner;
    const process = await runner.run(command, signal, output => this.dependencies.onOutput?.(actor,output));
    await this.dependencies.onResult?.(process);
    const after = await this.snapshot(actor.projectId, signal);
    const afterCheck = classified ? await this.dependencies.classify?.(command, after, signal) : null;
    const checkUnchanged = !classified || (afterCheck != null && JSON.stringify(classified) === JSON.stringify(afterCheck));
    const validTests = !classified || process.status !== 'succeeded' || passedTests(process.stdout, classified.evidenceFormat);
    const result = assessVerification({
      exitCode: process.exitCode,
      treeStopped: process.treeStopped,
      truncated: process.truncated,
      processStatus: process.status,
      before,
      after,
      watcherChanged: before.watcherGeneration !== after.watcherGeneration,
      relevant: relevant && checkUnchanged && validTests
    });
    const record = verificationRecordSchema.parse({
      id: this.dependencies.ids.next(),
      runId: actor.runId,
      callId: actor.callId,
      projectId: actor.projectId,
      kind: classified?.kind ?? 'test',
      command,
      scope: 'project',
      revision: after.revision,
      fingerprint: after.fingerprint,
      occurredAt: this.dependencies.clock.now(),
      result,
      stale: false,
      reason: !relevant ? 'Command is not a trusted project verification check.'
        : !checkUnchanged ? 'The declared check inputs changed.'
        : !validTests ? 'The test report does not prove that any tests passed.'
        : reasonFor(result, process, before, after),
      exitCode: process.exitCode
    });
    const coverage = classified ? { profileId: classified.profileId, coveredPaths: classified.coveredPaths, inputHashes: classified.inputHashes, ...(classified.toolPaths ? {toolPaths:classified.toolPaths} : {}) }
      : this.dependencies.coverageFor?.(command,referenceRelevant);
    await this.dependencies.store.append(record,coverage);
    return { record, process };
  }

  private async snapshot(projectId: string, signal: AbortSignal): Promise<WorkspaceSnapshot> {
    return this.dependencies.workspaces.observe(projectId, await this.dependencies.observer.inspect(signal));
  }
}
