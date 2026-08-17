import type { CredentialHelperCategory } from '@codryn/core';

const safetyRank: Readonly<Record<Exclude<CredentialHelperCategory, 'none'>, number>> = {
  system: 0,
  custom: 1,
  unknown: 2,
  plaintext_store: 3
};

function helperValue(rawLine: string): string | null {
  if (rawLine.includes('\n') || rawLine.includes('\r')) return null;

  const tabIndex = rawLine.indexOf('\t');
  const spaceSeparatedOrigin = /^(?:file:\S+|blob:\S+|command line:|standard input:)\s{2,}(.+)$/i
    .exec(rawLine);
  const withoutOrigin = tabIndex >= 0
    ? rawLine.slice(tabIndex + 1)
    : (spaceSeparatedOrigin?.[1] ?? rawLine);
  const normalized = withoutOrigin.trim().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : null;
}

function categorizeValue(value: string): Exclude<CredentialHelperCategory, 'none'> {
  const normalized = value.toLowerCase();
  if (normalized === 'manager' || normalized === 'manager-core' || normalized === 'wincred') {
    return 'system';
  }
  if (normalized === 'store') return 'plaintext_store';
  if (normalized.startsWith('!')) return 'unknown';
  return 'custom';
}

export function categorizeCredentialHelpers(
  lines: readonly string[]
): CredentialHelperCategory {
  if (lines.length === 0) return 'none';

  let leastSafe: Exclude<CredentialHelperCategory, 'none'> = 'system';
  for (const rawLine of lines) {
    const value = helperValue(rawLine);
    const category = value === null ? 'unknown' : categorizeValue(value);
    if (safetyRank[category] > safetyRank[leastSafe]) leastSafe = category;
  }
  return leastSafe;
}
