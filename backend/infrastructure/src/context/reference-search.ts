import { realpath } from 'node:fs/promises';
import { r4ReferencePathSchema, r4ReferenceSearchSchema } from '@codryn/shared';
import type { R4Reference, R4ReferenceSearch, R4ReferenceSearchPage } from '@codryn/shared';
import { ContextPathPolicy, ContextPathPolicyError } from '../filesystem/context-path-policy.js';
import { maxReferenceEntries, readReferenceDirectory, readReferenceIdentity, referenceTarget } from './reference-identity.js';

const maxReadBytes = 64 * 1024 * 1024;
const noResults = { nextOffset: null, limited: true } as const;

export async function searchReferences(projectRoot: string, raw: R4ReferenceSearch, signal: AbortSignal): Promise<R4ReferenceSearchPage> {
  const { query, offset = 0, limit = 50 } = r4ReferenceSearchSchema.parse(raw);
  const term = query.trim().toLowerCase();
  const items: R4Reference[] = [];
  const root = await realpath(projectRoot);
  if (root !== projectRoot) throw new Error('R3_PROJECT_UNAVAILABLE');
  let limited = false, visited = 0, matched = 0, budget = maxReadBytes;
  const chargeBytes = (size: number) => {
    if (size > budget) return false;
    budget -= size;
    return true;
  };
  const deadline = AbortSignal.timeout(4500);
  const scanning = AbortSignal.any([signal, deadline]);
  try {
    const policy = await ContextPathPolicy.fromProjectRoot(root);
    const revision = policy.revision;
    const directories = [''];
    for (let index = 0; index < directories.length && items.length <= limit; index++) {
      scanning.throwIfAborted();
      const folder = directories[index] as string;
      const directory = folder === '' ? { candidate: root } : await referenceTarget(root, folder).catch(() => null);
      if (!directory || ('stats' in directory && !directory.stats.isDirectory())) continue;
      const listing = await readReferenceDirectory(directory.candidate, maxReferenceEntries - visited, scanning);
      if (listing.limited) { limited = true; continue; }
      visited += listing.entries.length;
      for (const entry of listing.entries) {
        scanning.throwIfAborted();
        if (items.length > limit) break;
        const path = folder ? `${folder}/${entry.name}` : entry.name;
        const kind = entry.isDirectory() ? 'directory' : 'file';
        if ((!entry.isDirectory() && !entry.isFile()) || !r4ReferencePathSchema.safeParse(path).success ||
          !policy.decide(path, 'search', { kind }).allowed) continue;
        if (kind === 'directory') directories.push(path);
        if (!path.toLowerCase().includes(term)) continue;
        const identity = await readReferenceIdentity(root, path, policy, 'search', scanning, { chargeBytes });
        if (identity.status === 'limited') limited = true;
        if (identity.status === 'ready' && identity.reference.policyRevision === revision && matched++ >= offset) items.push(identity.reference);
      }
    }
    if (await policy.refresh() !== revision) return { ...noResults, items: [], reason: 'Pravidla projektu se při hledání změnila. Zopakujte hledání.' };
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof ContextPathPolicyError) {
      const location = error.line === undefined ? '' : ` na řádku ${error.line}`;
      return { ...noResults, items: [], reason: `Neplatné pravidlo .codrynignore${location} (${error.reason}).` };
    }
    if (deadline.aborted) return { ...noResults, items: [], reason: 'Hledání překročilo časový limit. Zpřesněte dotaz.' };
    throw error;
  }
  return { items: items.slice(0, limit), nextOffset: items.length > limit ? offset + limit : null, limited };
}
