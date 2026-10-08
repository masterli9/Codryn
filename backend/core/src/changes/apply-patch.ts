import { patchInputSchema, uuidSchema, type PatchInput } from '@codryn/shared';
import type { IdGenerator } from '../diagnostics/ports.js';
import type { BlobStore, ChangeActor, GuardedFile, GuardedWriter, MutationJournal, MutationResult } from './ports.js';
import { preparePatch } from './prepare-patch.js';
import { PublishMutation } from './publish-mutation.js';

const maxFileBytes = 1024 * 1024;

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

function errorCode(error: unknown): string {
  return error instanceof Error && /^R2_[A-Z0-9_]+$/.test(error.message) ? error.message : 'R2_PATCH_REJECTED';
}

function decodeStrictText(bytes: Uint8Array): string {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (text.includes('\0')) throw new Error('R2_PATCH_NUL');
    for (const character of text) {
      const point = character.codePointAt(0) ?? 0;
      if ((point < 0x20 && ![0x09, 0x0a, 0x0c, 0x0d].includes(point)) || point === 0x7f) throw new Error('R2_PATCH_BINARY_CONTENT');
    }
    return text;
  } catch (error) {
    if (error instanceof Error && /^R2_PATCH_/.test(error.message)) throw error;
    throw new Error('R2_PATCH_INVALID_UTF8');
  }
}

export class ApplyPatch {
  constructor(private readonly dependencies: ApplyPatchDependencies) {}

  async execute(input: unknown, actorInput: ChangeActor, signal: AbortSignal): Promise<MutationResult> {
    let guard: GuardedFile | undefined;
    try {
      const parsed = patchInputSchema.safeParse(input);
      if (!parsed.success) return { status: 'rejected', code: 'R2_PATCH_INPUT_INVALID' };
      const value: PatchInput = parsed.data;
      const actor = {
        projectId: uuidSchema.parse(actorInput.projectId),
        runId: uuidSchema.parse(actorInput.runId),
        callId: uuidSchema.parse(actorInput.callId)
      } satisfies ChangeActor;
      uuidSchema.parse(this.dependencies.setId);
      throwIfAborted(signal);
      guard = await this.dependencies.writer.open(value.path, value.expectedHash, signal);
      const beforeBytes = new Uint8Array(guard.bytes);
      if (beforeBytes.byteLength > maxFileBytes) return { status: 'rejected', code: 'R2_PATCH_FILE_TOO_LARGE' };
      const beforeHash = this.dependencies.hash(beforeBytes);
      if (beforeHash !== value.expectedHash) return { status: 'rejected', code: 'R2_PATCH_STALE' };
      const afterText = preparePatch(decodeStrictText(beforeBytes), value.edits);
      const afterBytes = new TextEncoder().encode(afterText);
      if (afterBytes.byteLength > maxFileBytes) return { status: 'rejected', code: 'R2_PATCH_FILE_TOO_LARGE' };
      const afterHash = this.dependencies.hash(afterBytes);
      await guard.close();
      guard = undefined;
      return await new PublishMutation(this.dependencies).execute({
        path: value.path,
        beforeBytes,
        afterBytes,
        beforeHash,
        afterHash,
        kind: 'patch',
        reversesId: null
      }, actor, signal);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return { status: 'rejected', code: 'R2_CHANGE_ABORTED' };
      return { status: 'rejected', code: errorCode(error) };
    } finally {
      await guard?.close().catch(() => undefined);
    }
  }
}
