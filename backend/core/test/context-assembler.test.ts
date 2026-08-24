import { describe, expect, it } from 'vitest';
import type { ProjectFilesystem } from '../src/agent/ports.js';
import { ContextAssembler, ContextAssemblyFailure } from '../src/index.js';

function filesystem(files: Record<string, string>): ProjectFilesystem {
  return {
    async readFile(input, signal) {
      if (signal.aborted) throw { code: 'R1_CANCELLED' };
      const content = files[input.path];
      if (content === undefined) throw { code: 'R1_PATH_SENSITIVE' };
      return {
        path: input.path,
        content,
        startLine: 1,
        endLine: 1,
        totalLines: 1,
        truncated: false,
        contentHash: 'a'.repeat(64)
      };
    },
    async searchText() { return { matches: [], truncated: false, filesSearched: 0, bytesSearched: 0 }; }
  };
}

async function expectFailure(promise: Promise<unknown>, code: ContextAssemblyFailure['code']): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('ContextAssembler', () => {
  it('assembles references in request order with content only in modelContent and safe audit metadata', async () => {
    const result = await new ContextAssembler(filesystem({ 'first.md': 'first secret text', 'src/second.ts': 'second text' })).assemble({
      task: 'Inspect the files.',
      project: { id: 'fixture-project' },
      contextReferences: ['first.md', 'src\\second.ts']
    }, new AbortController().signal);

    expect(result.modelContent).toEqual([
      expect.objectContaining({ path: 'first.md', content: 'first secret text', reason: 'explicit_reference' }),
      expect.objectContaining({ path: 'src/second.ts', content: 'second text', reason: 'explicit_reference' })
    ]);
    expect(result.sources).toEqual([
      { path: 'first.md', contentHash: 'a'.repeat(64), byteLength: 17, reason: 'explicit_reference' },
      { path: 'src/second.ts', contentHash: 'a'.repeat(64), byteLength: 11, reason: 'explicit_reference' }
    ]);
    expect(result.totalBytes).toBe(28);
    expect(JSON.stringify(result.sources)).not.toContain('secret text');
    expect(JSON.stringify(result.sources)).not.toContain('fixture-project');
  });

  it('rejects normalized duplicate and more than eight references before reading', async () => {
    const reads: string[] = [];
    const fs = filesystem({ 'a.txt': 'a' });
    const adapter: ProjectFilesystem = { ...fs, readFile: async (input, signal) => { reads.push(input.path); return fs.readFile(input, signal); } };
    const assembler = new ContextAssembler(adapter);
    await expectFailure(assembler.assemble({ task: 'Task', project: { id: 'fixture' }, contextReferences: ['a.txt', 'a.txt'] }, new AbortController().signal), 'R1_CONTEXT_REFERENCE_INVALID');
    await expectFailure(assembler.assemble({ task: 'Task', project: { id: 'fixture' }, contextReferences: Array.from({ length: 9 }, (_, index) => `f${index}.txt`) }, new AbortController().signal), 'R1_CONTEXT_REFERENCE_INVALID');
    expect(reads).toEqual([]);
  });

  it('fails the whole assembly at the 128 KiB boundary without silently dropping a reference', async () => {
    const exactly = 'a'.repeat(128 * 1024);
    const assembler = new ContextAssembler(filesystem({ 'exact.txt': exactly, 'over.txt': `${exactly}a` }));
    await expect(assembler.assemble({ task: 'Task', project: { id: 'fixture' }, contextReferences: ['exact.txt'] }, new AbortController().signal)).resolves.toMatchObject({ totalBytes: 128 * 1024 });
    await expectFailure(assembler.assemble({ task: 'Task', project: { id: 'fixture' }, contextReferences: ['over.txt'] }, new AbortController().signal), 'R1_CONTEXT_LIMIT_EXCEEDED');
  });

  it('maps forbidden references and preserves cancellation', async () => {
    const assembler = new ContextAssembler(filesystem({}));
    await expectFailure(assembler.assemble({ task: 'Task', project: { id: 'fixture' }, contextReferences: ['.env'] }, new AbortController().signal), 'R1_CONTEXT_REFERENCE_INVALID');
    const controller = new AbortController();
    controller.abort();
    await expectFailure(assembler.assemble({ task: 'Task', project: { id: 'fixture' }, contextReferences: [] }, controller.signal), 'R1_CANCELLED');
  });
});
