import type { ModelContextSource } from '@codryn/shared';
import type { ProjectFilesystem } from './ports.js';
import type { AssembledContext, ContextSourceAudit } from './model.js';

const MAX_REFERENCES = 8;
const MAX_CONTEXT_BYTES = 128 * 1024;

export class ContextAssemblyFailure extends Error {
  constructor(readonly code: 'R1_CONTEXT_REFERENCE_INVALID' | 'R1_CONTEXT_LIMIT_EXCEEDED' | 'R1_CANCELLED') {
    super(code === 'R1_CANCELLED' ? 'Context assembly cancelled.' : 'Context assembly failed.');
    this.name = 'ContextAssemblyFailure';
  }
}

export interface ContextAssemblyInput {
  readonly task: string;
  readonly project: { readonly id: string };
  readonly contextReferences: readonly string[];
}

function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) throw new ContextAssemblyFailure('R1_CANCELLED');
}

function normalizeReference(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || /^(?:[A-Za-z]:|[\\/])/.test(value)) {
    throw new ContextAssemblyFailure('R1_CONTEXT_REFERENCE_INVALID');
  }
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '');
  if (normalized.length === 0 || normalized === '.' || normalized.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new ContextAssemblyFailure('R1_CONTEXT_REFERENCE_INVALID');
  }
  return normalized;
}

export class ContextAssembler {
  constructor(private readonly filesystem: ProjectFilesystem) {}

  async assemble(input: ContextAssemblyInput, signal: AbortSignal): Promise<AssembledContext> {
    abortIfNeeded(signal);
    if (input.contextReferences.length > MAX_REFERENCES) throw new ContextAssemblyFailure('R1_CONTEXT_REFERENCE_INVALID');
    const references = input.contextReferences.map(normalizeReference);
    if (new Set(references).size !== references.length) throw new ContextAssemblyFailure('R1_CONTEXT_REFERENCE_INVALID');
    const modelContent: ModelContextSource[] = [];
    const sources: ContextSourceAudit[] = [];
    let totalBytes = 0;
    for (const path of references) {
      abortIfNeeded(signal);
      try {
        const read = await this.filesystem.readFile({ path }, signal);
        const bytes = Buffer.byteLength(read.content, 'utf8');
        if (totalBytes + bytes > MAX_CONTEXT_BYTES) throw new ContextAssemblyFailure('R1_CONTEXT_LIMIT_EXCEEDED');
        totalBytes += bytes;
        modelContent.push({ path: read.path, content: read.content, contentHash: read.contentHash, byteLength: bytes, reason: 'explicit_reference' });
        sources.push({ path: read.path, contentHash: read.contentHash, byteLength: bytes, reason: 'explicit_reference' });
      } catch (error) {
        if (error instanceof ContextAssemblyFailure) throw error;
        if (signal.aborted || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'R1_CANCELLED')) {
          throw new ContextAssemblyFailure('R1_CANCELLED');
        }
        throw new ContextAssemblyFailure('R1_CONTEXT_REFERENCE_INVALID');
      }
    }
    return { modelContent, sources, totalBytes };
  }
}
