import type { FileDiff } from '@codryn/shared';
import { fileDiffSchema } from '@codryn/shared';
import type { BlobStore, ChangeEntry, FileHashReader, MutationJournal } from './ports.js';

const maxDiffBytes = 64 * 1024;
const maxDiffLines = 1_000;

function decodeStrict(bytes: Uint8Array): string {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (text.includes('\0')) throw new Error('R2_DIFF_BINARY_CONTENT');
    return text;
  } catch (error) {
    if (error instanceof Error && error.message === 'R2_DIFF_BINARY_CONTENT') throw error;
    throw new Error('R2_DIFF_INVALID_UTF8');
  }
}

function limitedLines(lines: readonly FileDiff['lines'][number][]): { lines: FileDiff['lines']; truncated: boolean } {
  const output: FileDiff['lines'][number][] = [];
  let bytes = 0;
  let truncated = false;
  for (const line of lines) {
    const lineBytes = new TextEncoder().encode(line.text).byteLength;
    if (output.length >= maxDiffLines || bytes + lineBytes > maxDiffBytes) {
      truncated = true;
      break;
    }
    output.push(line);
    bytes += lineBytes;
  }
  return { lines: output, truncated };
}

export function buildFileDiff(
  path: string,
  before: string,
  after: string,
  beforeHash: string,
  afterHash: string
): FileDiff {
  const left = before.split('\n');
  const right = after.split('\n');
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < left.length - prefix
    && suffix < right.length - prefix
    && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) suffix += 1;

  const lines: FileDiff['lines'][number][] = [];
  const prefixStart = Math.max(0, prefix - 3);
  for (let index = prefixStart; index < prefix; index += 1) {
    const text = left[index];
    if (text !== undefined) lines.push({ kind: 'context', text });
  }
  for (const text of left.slice(prefix, left.length - suffix)) lines.push({ kind: 'removed', text });
  for (const text of right.slice(prefix, right.length - suffix)) lines.push({ kind: 'added', text });
  const suffixEnd = Math.min(right.length, right.length - suffix + 3);
  for (let index = right.length - suffix; index < suffixEnd; index += 1) {
    const text = right[index];
    if (text !== undefined) lines.push({ kind: 'context', text });
  }
  const limited = limitedLines(lines);
  return fileDiffSchema.parse({
    path,
    beforeHash,
    afterHash,
    status: 'changed',
    lines: limited.lines,
    truncated: limited.truncated
  });
}

export interface GetChangeDiffDependencies {
  journal: MutationJournal;
  blobs: BlobStore;
  files: FileHashReader;
}

function groupEntries(entries: readonly ChangeEntry[]): Map<string, ChangeEntry[]> {
  const groups = new Map<string, ChangeEntry[]>();
  for (const entry of [...entries].sort((left, right) => left.sequence - right.sequence)) {
    const group = groups.get(entry.path) ?? [];
    group.push(entry);
    groups.set(entry.path, group);
  }
  return groups;
}

export class GetChangeDiff {
  constructor(private readonly dependencies: GetChangeDiffDependencies) {}

  async execute(setId: string, signal: AbortSignal): Promise<readonly FileDiff[]> {
    if (signal.aborted) throw new DOMException('The operation was aborted', 'AbortError');
    const entries = await this.dependencies.journal.entries(setId);
    const output: FileDiff[] = [];
    for (const group of groupEntries(entries).values()) {
      if (signal.aborted) throw new DOMException('The operation was aborted', 'AbortError');
      const first = group[0];
      const last = group[group.length - 1];
      if (first === undefined || last === undefined) continue;
      let chainValid = true;
      for (let index = 1; index < group.length; index += 1) {
        const previous = group[index - 1];
        const current = group[index];
        if (previous === undefined || current === undefined || previous.afterHash !== current.beforeHash) {
          chainValid = false;
          break;
        }
      }
      const before = decodeStrict(await this.dependencies.blobs.get(first.beforeBlob));
      const after = decodeStrict(await this.dependencies.blobs.get(last.afterBlob));
      const actualHash = await this.dependencies.files.readHash(first.path, signal).catch(() => null);
      const ownDiff = buildFileDiff(first.path, before, after, first.beforeHash, last.afterHash);
      const status = !chainValid || actualHash !== last.afterHash
        ? 'conflicted'
        : last.kind === 'revert' || last.afterHash === first.beforeHash
          ? 'reverted'
          : 'changed';
      output.push(fileDiffSchema.parse({ ...ownDiff, status }));
    }
    return output;
  }
}
