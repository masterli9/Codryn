import { uuidSchema } from '@codryn/shared';
import type { IdGenerator } from '../diagnostics/ports.js';
import type {
  BlobStore,
  ChangeActor,
  ChangeEntry,
  GuardedFile,
  GuardedWriter,
  MutationJournal,
  MutationResult,
  WriteIntent
} from './ports.js';

const maxFileBytes = 1024 * 1024;

export interface PreparedMutation {
  path: string;
  beforeBytes: Uint8Array;
  afterBytes: Uint8Array;
  beforeHash: string;
  afterHash: string;
  kind: ChangeEntry['kind'];
  reversesId: string | null;
}

export interface PublishMutationDependencies {
  writer: GuardedWriter;
  blobs: BlobStore;
  journal: MutationJournal;
  ids: IdGenerator;
  setId: string;
  nextSequence: () => Promise<number>;
  hash(bytes: Uint8Array): string;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('The operation was aborted', 'AbortError');
}

function code(error: unknown): string {
  return error instanceof Error && /^R2_[A-Z0-9_]+$/.test(error.message) ? error.message : 'R2_MUTATION_FAILED';
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

export class PublishMutation {
  constructor(private readonly dependencies: PublishMutationDependencies) {}

  async execute(input: PreparedMutation, actorInput: ChangeActor, signal: AbortSignal): Promise<MutationResult> {
    let guard: GuardedFile | undefined;
    let operationId: string | undefined;
    let published = false;
    let result: MutationResult = { status: 'rejected', code: 'R2_MUTATION_FAILED' };
    try {
      const actor = {
        projectId: uuidSchema.parse(actorInput.projectId),
        runId: uuidSchema.parse(actorInput.runId),
        callId: uuidSchema.parse(actorInput.callId)
      } satisfies ChangeActor;
      const setId = uuidSchema.parse(this.dependencies.setId);
      if (input.beforeBytes.byteLength > maxFileBytes || input.afterBytes.byteLength > maxFileBytes) throw new Error('R2_PATCH_FILE_TOO_LARGE');
      if (this.dependencies.hash(input.beforeBytes) !== input.beforeHash) throw new Error('R2_PATCH_STALE');
      if (this.dependencies.hash(input.afterBytes) !== input.afterHash) throw new Error('R2_MUTATION_AFTER_HASH_MISMATCH');
      throwIfAborted(signal);
      guard = await this.dependencies.writer.open(input.path, input.beforeHash, signal);
      const observed = new Uint8Array(guard.bytes);
      if (this.dependencies.hash(observed) !== input.beforeHash || !sameBytes(observed, input.beforeBytes)) {
        result = { status: 'rejected', code: 'R2_PATCH_STALE' };
      } else {
        const beforeBlob = await this.dependencies.blobs.put(input.beforeBytes);
        if (beforeBlob !== input.beforeHash) throw new Error('R2_PATCH_BEFORE_BLOB_MISMATCH');
        const afterBlob = await this.dependencies.blobs.put(input.afterBytes);
        if (afterBlob !== input.afterHash) throw new Error('R2_PATCH_AFTER_BLOB_MISMATCH');
        operationId = this.dependencies.ids.next();
        const entry: ChangeEntry = {
          id: this.dependencies.ids.next(),
          setId,
          projectId: actor.projectId,
          runId: actor.runId,
          callId: actor.callId,
          sequence: await this.dependencies.nextSequence(),
          path: input.path,
          beforeHash: input.beforeHash,
          afterHash: input.afterHash,
          beforeBlob,
          afterBlob,
          kind: input.kind,
          reversesId: input.reversesId
        };
        const intent: WriteIntent = { operationId, entry, state: 'prepared' };
        let prepared = false;
        try {
          await this.dependencies.journal.prepare(intent);
          prepared = true;
        } catch {
          result = { status: 'recovery_required', operationId };
        }
        if (prepared) {
          try {
            throwIfAborted(signal);
            await guard.publish(input.afterBytes);
            published = true;
          } catch (error) {
            result = error instanceof DOMException && error.name === 'AbortError'
              ? { status: 'rejected', code: 'R2_CHANGE_ABORTED' }
              : { status: 'recovery_required', operationId };
          }
          if (published) {
            try {
              result = { status: 'applied', entry, revision: await this.dependencies.journal.confirm(operationId) };
            } catch {
              result = { status: 'recovery_required', operationId };
            }
          }
        }
      }
    } catch (error) {
      if (operationId !== undefined && published) result = { status: 'recovery_required', operationId };
      else if (error instanceof DOMException && error.name === 'AbortError') result = { status: 'rejected', code: 'R2_CHANGE_ABORTED' };
      else result = { status: 'rejected', code: code(error) };
    } finally {
      if (guard !== undefined) {
        try { await guard.close(); }
        catch { if (operationId !== undefined && published) result = { status: 'recovery_required', operationId }; else if (result.status === 'rejected') result = { status: 'rejected', code: 'R2_GUARD_CLOSE_FAILED' }; }
      }
    }
    return result;
  }
}
