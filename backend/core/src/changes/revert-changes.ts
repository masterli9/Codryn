import { uuidSchema } from '@codryn/shared';
import type { ChangeSetStore } from './change-set-store.js';
import type { ChangeEntry, FileHashReader, MutationJournal } from './ports.js';
import { PublishMutation, type PublishMutationDependencies } from './publish-mutation.js';
import type { BlobStore } from './ports.js';

export interface RevertResult {
  status: 'reverted' | 'conflicted' | 'recovery_required';
  revertedIds: readonly string[];
  blockedIds: readonly string[];
}

export interface RevertChangesDependencies extends PublishMutationDependencies {
  journal: MutationJournal;
  blobs: BlobStore;
  files: FileHashReader;
  changeSets: ChangeSetStore;
  createAuditCall?: (input: { callId: string; runId: string; projectId: string; requestId: string }) => Promise<void>;
}

export function returnOrder(entries: readonly ChangeEntry[]): readonly ChangeEntry[] {
  return [...entries].sort((left, right) => right.sequence - left.sequence);
}

function activeEntries(entries: readonly ChangeEntry[]): ChangeEntry[] {
  const reverted = new Set(entries.filter((entry) => entry.kind === 'revert' && entry.reversesId !== null).map((entry) => entry.reversesId));
  return entries.filter((entry) => entry.kind === 'patch' && !reverted.has(entry.id));
}

function blockedByPreflight(
  entries: readonly ChangeEntry[],
  latestByPath: ReadonlyMap<string, ChangeEntry>,
  actualByPath: ReadonlyMap<string, string | null>
): string[] {
  const conflictedPaths = new Set(
    [...latestByPath.values()]
      .filter((entry) => actualByPath.get(entry.path) !== entry.afterHash)
      .map((entry) => entry.path)
  );
  return entries.filter((entry) => conflictedPaths.has(entry.path)).map((entry) => entry.id);
}

export class RevertChanges {
  constructor(private readonly dependencies: RevertChangesDependencies) {}

  async execute(input: { setId: string; entryId?: string; requestId: string }, signal: AbortSignal): Promise<RevertResult> {
    const setId = uuidSchema.parse(input.setId);
    const requestId = uuidSchema.parse(input.requestId);
    const entries = activeEntries(await this.dependencies.journal.entries(setId));
    const selected = returnOrder(input.entryId === undefined ? entries : entries.filter((entry) => entry.id === uuidSchema.parse(input.entryId)));
    if (selected.length === 0) return { status: 'reverted', revertedIds: [], blockedIds: [] };
    if (signal.aborted) throw new DOMException('The operation was aborted', 'AbortError');

    const latestByPath = new Map<string, ChangeEntry>();
    for (const entry of selected) if (!latestByPath.has(entry.path)) latestByPath.set(entry.path, entry);
    const actualByPath = new Map<string, string | null>();
    for (const entry of latestByPath.values()) {
      try { actualByPath.set(entry.path, await this.dependencies.files.readHash(entry.path, signal)); }
      catch { actualByPath.set(entry.path, null); }
    }
    const blockedIds = blockedByPreflight(selected, latestByPath, actualByPath);
    if (blockedIds.length > 0) {
      await this.dependencies.changeSets.transition(setId, 'sealed', 'conflicted');
      return { status: 'conflicted', revertedIds: [], blockedIds };
    }

    await this.dependencies.changeSets.transition(setId, 'sealed', 'reverting');
    const revertedIds: string[] = [];
    for (const original of selected) {
      if (signal.aborted) throw new DOMException('The operation was aborted', 'AbortError');
      const callId = uuidSchema.parse(this.dependencies.ids.next());
      await this.dependencies.createAuditCall?.({ callId, runId: original.runId, projectId: original.projectId, requestId });
      const beforeBytes = await this.dependencies.blobs.get(original.afterBlob);
      const afterBytes = await this.dependencies.blobs.get(original.beforeBlob);
      const result = await new PublishMutation(this.dependencies).execute({
        path: original.path,
        beforeBytes,
        afterBytes,
        beforeHash: original.afterHash,
        afterHash: original.beforeHash,
        kind: 'revert',
        reversesId: original.id
      }, { projectId: original.projectId, runId: original.runId, callId }, signal);
      if (result.status === 'applied') {
        revertedIds.push(original.id);
        continue;
      }
      if (result.status === 'recovery_required') {
        await this.dependencies.changeSets.transition(setId, 'reverting', 'recovery_required');
        return { status: 'recovery_required', revertedIds, blockedIds: selected.slice(revertedIds.length).map((entry) => entry.id) };
      }
      await this.dependencies.changeSets.transition(setId, 'reverting', 'conflicted');
      return { status: 'conflicted', revertedIds, blockedIds: selected.slice(revertedIds.length).map((entry) => entry.id) };
    }
    await this.dependencies.changeSets.transition(setId, 'reverting', input.entryId === undefined ? 'reverted' : 'sealed');
    return { status: 'reverted', revertedIds, blockedIds: [] };
  }
}
