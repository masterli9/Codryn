import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { assertR3ProfileRoot } from '../src/filesystem/r3-profile-boundary.js';

it('requires an existing strict child directory and allows ordinary dot-prefixed names', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'codryn-profile-check-')), root = await realpath(temporary);
  try {
    const profile = join(root, '..notes'); await mkdir(profile);
    expect(assertR3ProfileRoot(root, profile)).toBe(await realpath(profile));
    for (const bad of [root, join(root, '..', 'outside'), join(root, 'missing'), 'relative-profile']) {
      expect(() => assertR3ProfileRoot(root, bad)).toThrow('R3_PROFILE_BOUNDARY');
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

it.runIf(process.platform === 'win32')('rejects root and intermediate junctions even when the final target stays inside the artifact tree', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'codryn-profile-alias-')), base = await realpath(temporary);
  const root = join(base, 'artifacts'), target = join(root, 'real'), alias = join(root, 'alias'), rootAlias = join(base, 'root-alias');
  try {
    await mkdir(join(target, 'profile'), { recursive: true });
    await symlink(target, alias, 'junction'); await symlink(root, rootAlias, 'junction');
    expect(() => assertR3ProfileRoot(root, join(alias, 'profile'))).toThrow('R3_PROFILE_BOUNDARY');
    expect(() => assertR3ProfileRoot(rootAlias, join(rootAlias, 'real', 'profile'))).toThrow('R3_PROFILE_BOUNDARY');
  } finally { await rm(base, { recursive: true, force: true }); }
});
