import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

function within(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

/** Accept only existing, owned artifact directories, without symlink/junction aliases. */
export function assertR3ProfileRoot(artifactsRoot: string, profileRoot: string): string {
  try {
    if (!isAbsolute(artifactsRoot) || !isAbsolute(profileRoot)) throw new Error();
    const root = resolve(artifactsRoot), profile = resolve(profileRoot);
    if (!within(root, profile)) throw new Error();
    const canonicalRoot = realpathSync(root), canonicalProfile = realpathSync(profile);
    const identity = (path: string) => process.platform === 'win32' ? path.toLowerCase() : path;
    if (identity(canonicalRoot) !== identity(root) || !within(canonicalRoot, canonicalProfile)) throw new Error();
    let directory = root;
    for (const segment of ['', ...relative(root, profile).split(sep)]) {
      directory = resolve(directory, segment);
      const info = lstatSync(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error();
    }
    if (identity(canonicalProfile) !== identity(profile)) throw new Error();
    return canonicalProfile;
  } catch { throw new Error('R3_PROFILE_BOUNDARY'); }
}
