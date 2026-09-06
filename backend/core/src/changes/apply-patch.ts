import { uuidSchema, patchInputSchema, type PatchInput } from '@codryn/shared';
import type {
  BlobStore,
  ChangeActor,
  GuardedFile,
  GuardedWriter,
  MutationJournal,
  MutationResult,
  WriteIntent
} from './ports.js';
import type { IdGenerator } from '../diagnostics/ports.js';
import { preparePatch } from './prepare-patch.js';

const maxFileBytes = 1024 * 1024;
const textEncoder = new TextEncoder();

export interface ApplyPatchDependencies {
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

function errorCode(error: unknown, fallback: string): string {
  if (error instanceof Error && /^R2_[A-Z0-9_]+$/.test(error.message)) return error.message;
  return fallback;
}

function decodeStrictText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error('R2_PATCH_INVALID_UTF8');
  }
  if (text.includes('\0')) throw new Error('R2_PATCH_NUL');
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if ((code < 0x20 && ![0x09, 0x0a, 0x0c, 0x0d].includes(code)) || code === 0x7f) {
      throw new Error('R2_PATCH_BINARY_CONTENT');
    }
  }
  return text;
}

function requireFileSize(bytes: Uint8Array): void {
  if (bytes.byteLength > maxFileBytes) throw new Error('R2_PATCH_FILE_TOO_LARGE');
}

export class ApplyPatch {
  constructor(private readonly dependencies: ApplyPatchDependencies) {}

  async execute(
    input: unknown,
    actorInput: ChangeActor,
    signal: AbortSignal
  ): Promise<MutationResult> {
    let guarded: GuardedFile | undefined;
    let operationId: string | undefined;
    let published = false;
    let result: MutationResult = { status: 'rejected', code: 'R2_PATCH_REJECTED' };

    try {
      const parsed = patchInputSchema.safeParse(input);
      if (!parsed.success) {
        result = { status: 'rejected', code: 'R2_PATCH_INPUT_INVALID' };
      } else {
        const inputValue: PatchInput = parsed.data;
        const actor = {
          projectId: uuidSchema.parse(actorInput.projectId),
          runId: uuidSchema.parse(actorInput.runId),
          callId: uuidSchema.parse(actorInput.callId)
        } satisfies ChangeActor;
        const setId = uuidSchema.parse(this.dependencies.setId);
        throwIfAborted(signal);
        guarded = await this.dependencies.writer.open(inputValue.path, inputValue.expectedHash, signal);
        const beforeBytes = new Uint8Array(guarded.bytes);
        requireFileSize(beforeBytes);
        const beforeHash = this.dependencies.hash(beforeBytes);
        if (beforeHash !== inputValue.expectedHash) {
          result = { status: 'rejected', code: 'R2_PATCH_STALE' };
        } else {
          const beforeText = decodeStrictText(beforeBytes);
          const afterText = preparePatch(beforeText, inputValue.edits);
          const afterBytes = textEncoder.encode(afterText);
          requireFileSize(afterBytes);
          const afterHash = this.dependencies.hash(afterBytes);
          const beforeBlob = await this.dependencies.blobs.put(beforeBytes);
          if (beforeBlob !== beforeHash) throw new Error('R2_PATCH_BEFORE_BLOB_MISMATCH');
          const afterBlob = await this.dependencies.blobs.put(afterBytes);
          if (afterBlob !== afterHash) throw new Error('R2_PATCH_AFTER_BLOB_MISMATCH');

          operationId = this.dependencies.ids.next();
          const currentOperationId = operationId;
          const entry: WriteIntent['entry'] = {
            id: this.dependencies.ids.next(),
            setId,
            projectId: actor.projectId,
            runId: actor.runId,
            callId: actor.callId,
            sequence: await this.dependencies.nextSequence(),
            path: inputValue.path,
            beforeHash,
            afterHash,
            beforeBlob,
            afterBlob,
            kind: 'patch',
            reversesId: null
          };
          const intent: WriteIntent = { operationId: currentOperationId, entry, state: 'prepared' };

          let prepared = false;
          try {
            await this.dependencies.journal.prepare(intent);
            prepared = true;
          } catch {
            result = { status: 'recovery_required', operationId: currentOperationId };
          }

          if (prepared) {
            try {
              throwIfAborted(signal);
              await guarded.publish(afterBytes);
              published = true;
            } catch (error) {
              result = error instanceof DOMException && error.name === 'AbortError'
                ? { status: 'rejected', code: 'R2_CHANGE_ABORTED' }
                : { status: 'recovery_required', operationId: currentOperationId };
            }
            if (published) {
              try {
                const revision = await this.dependencies.journal.confirm(currentOperationId);
                result = { status: 'applied', entry, revision };
              } catch {
                result = { status: 'recovery_required', operationId: currentOperationId };
              }
            }
          }
        }
      }
    } catch (error) {
      if (operationId !== undefined && published) {
        result = { status: 'recovery_required', operationId };
      } else if (error instanceof DOMException && error.name === 'AbortError') {
        result = { status: 'rejected', code: 'R2_CHANGE_ABORTED' };
      } else {
        result = { status: 'rejected', code: errorCode(error, 'R2_PATCH_REJECTED') };
      }
    } finally {
      if (guarded !== undefined) {
        try {
          await guarded.close();
        } catch {
          if (operationId !== undefined && published) {
            result = { status: 'recovery_required', operationId };
          } else if (result.status === 'rejected') {
            result = { status: 'rejected', code: 'R2_GUARD_CLOSE_FAILED' };
          }
        }
      }
    }
    return result;
  }
}
