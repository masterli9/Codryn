import type { ProjectCheckKind } from '@codryn/shared';
import type { WorkspaceSnapshot } from '../workspace/ports.js';
import type { ProfiledVerificationRecord } from './verification-store.js';

const kinds = ['typecheck', 'test'] as const;
export const isProjectCheckInput = (path: string): boolean => /\.(?:[cm]?[jt]sx?|json|jsonc|yaml|yml|lock)$/iu.test(path);

export function sameCheckInputs(recorded: Readonly<Record<string, string>>, current: Readonly<Record<string, string>>): boolean {
  const entries = Object.entries(recorded);
  const paths = Object.keys(current).filter(path => !/^@(node|tsc|tsc-runtime|tsc-libs|vitest)$/u.test(path));
  return entries.length > 0 && paths.every(path => Object.hasOwn(recorded, path))
    && entries.every(([path, expected]) => Object.hasOwn(current, path) && current[path] === expected);
}

interface AssessmentInput {
  changedPaths: readonly string[];
  includedFiles: readonly string[];
  records: readonly ProfiledVerificationRecord[];
  snapshot: WorkspaceSnapshot;
  currentInputHashes: Readonly<Record<string, string>>;
}

export function assessProjectChecks(input: AssessmentInput) {
  const included = new Set(input.includedFiles);
  const missingChecks: ProjectCheckKind[] = [];
  const passed: ProfiledVerificationRecord[] = [];
  let stale = false;
  for (const kind of kinds) {
    const entry = input.records.find(item => item.profileId === 'r4-ts-v1' && item.record.kind === kind);
    const current = entry && input.snapshot.complete && !entry.record.stale &&
      !!entry.inputHashes && sameCheckInputs(entry.inputHashes, input.currentInputHashes);
    stale ||= !current && entry?.record.result === 'passed';
    if (current && entry.record.result === 'passed') passed.push(entry);
    else missingChecks.push(kind);
  }
  const covered = passed.map(item => new Set(item.coveredPaths));
  const uncoveredPaths = input.changedPaths.filter(path => !included.has(path) || !covered.length || covered.some(paths => !paths.has(path)));
  const labels = missingChecks.map(kind => kind === 'typecheck' ? 'kontrola typů' : 'testy').join(', ');
  if (!input.changedPaths.length) return { status: 'unverified' as const, reason: 'Běh nemá aktuální změnu k ověření.', uncoveredPaths, missingChecks };
  if (stale) return { status: 'stale' as const, reason: 'Vstupy kontroly se změnily nebo je nelze úplně ověřit.', uncoveredPaths, missingChecks };
  if (!missingChecks.length && !uncoveredPaths.length) return { status: 'verified' as const, reason: 'Kontrola typů i testy prošly nad stejnými aktuálními vstupy.', uncoveredPaths, missingChecks };
  return { status: passed.length ? 'partially_verified' as const : 'unverified' as const,
    reason: labels ? `Chybí aktuální úspěšná kontrola: ${labels}.` : 'Kontroly nepokrývají všechny změněné soubory.', uncoveredPaths, missingChecks };
}
