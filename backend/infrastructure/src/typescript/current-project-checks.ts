import { assessProjectChecks } from '@codryn/core';
import type { WorkspaceSnapshot } from '@codryn/core';
import type { SqliteVerificationStore } from '../persistence/sqlite-verification-store.js';
import { readCheckToolHashes } from './project-check-classifier.js';

export async function currentCheckInputs(store: SqliteVerificationStore, projectId: string, snapshot: WorkspaceSnapshot): Promise<Readonly<Record<string, string>>> {
  if (!snapshot.complete || !snapshot.inputHashes) return {};
  const toolSets = store.toolPaths(projectId);
  // Conflicting installed tool paths are unknown for this observation.
  const tools = new Map<string, string | null>();
  for (const set of toolSets) for (const [name, path] of Object.entries(set)) {
    if (!tools.has(name)) tools.set(name, path);
    else if (tools.get(name) !== path) tools.set(name, null);
  }
  const files = Object.fromEntries([...tools].filter((entry): entry is [string, string] => entry[1] !== null));
  return { ...snapshot.inputHashes, ...await readCheckToolHashes(files) };
}

export function assessCurrentProjectChecks(store: SqliteVerificationStore, runId: string, changedPaths: string[], snapshot: WorkspaceSnapshot, currentInputHashes: Readonly<Record<string, string>>) {
  const records = store.list(runId, snapshot, currentInputHashes);
  const includedFiles = records.filter(item => item.profileId === 'r4-ts-v1').flatMap(item => item.coveredPaths);
  return { records, ...assessProjectChecks({ changedPaths, includedFiles, records, snapshot, currentInputHashes }) };
}
