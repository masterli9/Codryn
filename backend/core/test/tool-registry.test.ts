import { describe, expect, it, vi } from 'vitest';
import { fileReadTool, ToolRegistry, ToolRegistryFailure } from '../src/index.js';

describe('ToolRegistry', () => {
  it('registers and looks up a precise ID and version while exposing frozen handler-free descriptors', () => {
    const registry = new ToolRegistry([fileReadTool(async () => ({
      path: 'README.md', content: 'readme', startLine: 1, endLine: 1, totalLines: 1, truncated: false, contentHash: 'a'.repeat(64)
    }))]);
    const definition = registry.lookup('file.read', 1);
    const descriptor = registry.descriptors[0];
    if (descriptor === undefined) throw new Error('Missing public descriptor.');

    expect(definition.toolId).toBe('file.read');
    expect(descriptor).toMatchObject({ toolId: 'file.read', toolVersion: 1, inputSchema: { type: 'object' } });
    expect('handler' in descriptor).toBe(false);
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(Object.isFrozen(registry.descriptors)).toBe(true);
  });

  it('rejects duplicate registrations and never guesses an unknown version', () => {
    const definition = fileReadTool(async () => ({
      path: 'README.md', content: 'readme', startLine: 1, endLine: 1, totalLines: 1, truncated: false, contentHash: 'a'.repeat(64)
    }));
    expect(() => new ToolRegistry([definition, definition])).toThrow(ToolRegistryFailure);
    const registry = new ToolRegistry([definition]);
    expect(() => registry.lookup('file.read', 2)).toThrowError(ToolRegistryFailure);
    try { registry.lookup('file.read', 2); } catch (error) { expect(error).toMatchObject({ code: 'R1_TOOL_UNKNOWN' }); }
  });

  it('validates strict input and output schemas without invoking handler for invalid arguments', async () => {
    const handler = vi.fn(async () => ({
      path: 'README.md', content: 'readme', startLine: 1, endLine: 1, totalLines: 1, truncated: false, contentHash: 'a'.repeat(64)
    }));
    const registry = new ToolRegistry([fileReadTool(handler)]);
    const definition = registry.lookup('file.read', 1);
    const valid = definition.inputSchema.safeParse({ path: 'README.md' });
    const invalid = definition.inputSchema.safeParse({ path: 'README.md', extra: true });

    expect(valid.success).toBe(true);
    if (valid.success) expect(valid.data).toEqual({ path: 'README.md', startLine: 1, maxLines: 200 });
    expect(invalid.success).toBe(false);
    expect(definition.inputSchema.safeParse({ path: 'README\0.md' }).success).toBe(false);
    expect(definition.outputSchema.safeParse({ path: 'README.md', content: 'ok', startLine: 1, endLine: 1, totalLines: 1, truncated: false, contentHash: 'bad' }).success).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});
