import { basename } from 'node:path';

export interface SensitivePathDecision {
  readonly allowed: boolean;
  readonly code?: 'R1_PATH_SENSITIVE';
  readonly reason?: string;
}

const blockedSegments = new Set(['.git', 'node_modules', 'dist', 'build', 'out', '.next', '.cache', 'coverage']);
const blockedNames = new Set(['id_rsa', 'id_ed25519', 'credentials', 'credentials.json', 'credential', 'credential.json']);

export function decideSensitivePath(relativePath: string): SensitivePathDecision {
  const segments = relativePath.replaceAll('\\', '/').split('/').map((segment) => segment.toLowerCase());
  if (segments.some((segment) => blockedSegments.has(segment))) {
    return { allowed: false, code: 'R1_PATH_SENSITIVE', reason: 'Path is inside a fixed sensitive directory.' };
  }
  const name = basename(relativePath).toLowerCase();
  if (name === '.env' || name.startsWith('.env.') || blockedNames.has(name) || name.endsWith('.pem') || name.endsWith('.key')) {
    return { allowed: false, code: 'R1_PATH_SENSITIVE', reason: 'Path has a fixed sensitive filename.' };
  }
  return { allowed: true };
}
