const inheritedEnvironmentKeys = new Set([
  'PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT'
]);

export function buildCommandEnvironment(env: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env)
      .filter(([key, value]) => inheritedEnvironmentKeys.has(key.toUpperCase()) && value !== undefined)
      .map(([key, value]) => [key, value as string])
  );
}
