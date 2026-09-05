const blockedSegments = new Set(['.git', 'node_modules', 'dist', 'build', 'out', '.next', '.cache', 'coverage']);
const blockedNames = new Set(['id_rsa', 'id_ed25519', 'credentials', 'credentials.json', 'credential', 'credential.json']);

export function isValidR1RelativePath(path: string): boolean {
  if (path.length === 0 || /^(?:[A-Za-z]:|[\\/])/.test(path)) return false;
  const segments = path.replaceAll('\\', '/').split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '..');
}

export function isR1SensitiveRelativePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  const segments = normalized.split('/').map((segment) => segment.toLowerCase());
  if (segments.some((segment) => blockedSegments.has(segment))) return true;
  const name = segments.at(-1) ?? '';
  return name === '.env' || name.startsWith('.env.') || blockedNames.has(name) || name.endsWith('.pem') || name.endsWith('.key');
}
