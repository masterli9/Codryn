import { createHash } from 'node:crypto';
import type { ModelContextSource, R4ContextAuditSource } from '@codryn/shared';
import type { ProjectFilesystem } from './ports.js';
import type { AssembledContext, ContextSourceAudit } from './model.js';

const MAX_REFERENCES = 8;
const MAX_CONTEXT_BYTES = 128 * 1024;

export class ContextAssemblyFailure extends Error {
  constructor(readonly code: 'R1_CONTEXT_REFERENCE_INVALID' | 'R1_CONTEXT_LIMIT_EXCEEDED' | 'R1_CANCELLED' | 'R4_CONTEXT_POLICY_CHANGED') {
    super(code === 'R4_CONTEXT_POLICY_CHANGED' ? 'Project context rules changed during the operation.'
      : code === 'R1_CANCELLED' ? 'Context assembly cancelled.' : 'Context assembly failed.');
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
    let policyRevision: string | undefined;
    for (const path of references) {
      abortIfNeeded(signal);
      try {
        const read = await this.filesystem.readFile({ path, action: 'context' }, signal);
        policyRevision ??= read.policyRevision;
        if (policyRevision !== read.policyRevision) throw new ContextAssemblyFailure('R4_CONTEXT_POLICY_CHANGED');
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
        if (typeof error === 'object' && error !== null && 'code' in error
          && (error.code === 'R2_CONTEXT_POLICY_INVALID' || error.code === 'R4_CONTEXT_POLICY_CHANGED')) throw error;
        throw new ContextAssemblyFailure('R1_CONTEXT_REFERENCE_INVALID');
      }
    }
    if (policyRevision !== undefined && this.filesystem.refreshPolicyRevision !== undefined
      && policyRevision !== await this.filesystem.refreshPolicyRevision()) {
      throw new ContextAssemblyFailure('R4_CONTEXT_POLICY_CHANGED');
    }
    abortIfNeeded(signal);
    return { modelContent, sources, totalBytes };
  }
}

interface R4Content { path: string; hash: string | null; content: string; truncated?: boolean }
interface R4ReferenceContent extends R4Content { kind: 'file' | 'directory'; hash: string }
interface R4ContextInput {
  task: string;
  history: readonly R4Content[];
  projectRules: readonly R4Content[];
  references: readonly R4ReferenceContent[];
  map: readonly R4Content[];
  mapOmissions: readonly R4ContextAuditSource[];
}
const explicitBytes = 64 * 1024;
const excerptBytes = 16 * 1024;
const mapBytes = 32 * 1024;
const hashText = (text: string) => createHash('sha256').update(text).digest('hex');

export function assembleR4Context(input: R4ContextInput): { modelContent: ModelContextSource[]; audit: R4ContextAuditSource[] } {
  const modelContent: ModelContextSource[] = [];
  const taskBytes = Buffer.byteLength(input.task, 'utf8');
  const audit: R4ContextAuditSource[] = [{ source: 'user_text', hash: hashText(input.task), bytes: taskBytes, status: 'used' }];
  let remaining = MAX_CONTEXT_BYTES - taskBytes;

  function add(value: R4Content, source: R4ContextAuditSource['source'], reason: ModelContextSource['reason'], budget: number) {
    const hash = value.hash ?? hashText(value.content);
    const original = Buffer.from(value.content, 'utf8');
    const limit = Math.min(budget, remaining);
    if (original.length && (limit === 0 || (source === 'repo_map' && original.length > limit))) {
      audit.push({ source, path: value.path, hash, bytes: 0, status: 'omitted', reason: 'byte_budget' });
      return 0;
    }
    let end = Math.min(limit, original.length);
    while (end < original.length && end > 0 && ((original[end] ?? 0) & 0xc0) === 0x80) end--;
    const content = original.subarray(0, end).toString('utf8');
    if (!content && original.length) {
      audit.push({ source, path: value.path, hash, bytes: 0, status: 'omitted', reason: 'byte_budget' });
      return 0;
    }
    const truncated = value.truncated || end < original.length;
    const lineCount = content.length ? content.split('\n').length - (content.endsWith('\n') ? 1 : 0) : 0;
    const lines = reason === 'loaded_excerpt' && lineCount ? { startLine: 1, endLine: lineCount } : {};
    audit.push({ source, path: value.path, hash, bytes: end, status: truncated ? 'truncated' : 'used', ...(truncated ? { reason: value.truncated ? 'limited' : 'byte_budget' } : {}), ...lines });
    modelContent.push({ path: value.path, content, contentHash: hash, byteLength: end, reason });
    remaining -= end;
    return end;
  }

  let history = 8 * 1024;
  for (const item of input.history) history -= add(item, 'chat_history', 'chat_history', history);
  let rules = excerptBytes;
  for (const item of input.projectRules) rules -= add(item, 'project_rules', 'project_rules', rules);
  let explicit = explicitBytes;
  for (const item of input.references) {
    if (item.kind === 'file') {
      audit.push({ source: 'project_reference', path: item.path, hash: item.hash, bytes: 0, status: 'used' });
      explicit -= add(item, 'loaded_excerpt', 'loaded_excerpt', Math.min(explicit, excerptBytes));
    } else {
      explicit -= add(item, 'project_reference', 'directory_reference', Math.min(explicit, excerptBytes));
    }
  }
  // Allocate optional map metadata only after preserving the entire selected-reference allowance.
  let map = Math.min(mapBytes, remaining, explicit);
  for (const item of input.map) map -= add(item, 'repo_map', 'repo_map', map);
  audit.push(...input.mapOmissions);
  return { modelContent, audit };
}
