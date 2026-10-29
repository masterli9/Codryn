import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';
import { createR3Profile, launchR3Desktop } from '../src/r3-desktop.js';

const electron = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock('playwright', () => ({ _electron: electron }));
beforeEach(() => { electron.launch.mockReset(); });

it('launches an owned canonical profile using the actual sandboxed Electron path', async () => {
  const profile = await createR3Profile('valid-boundary');
  const window = { setDefaultTimeout: vi.fn(), getByRole: vi.fn().mockReturnValue({ waitFor: vi.fn().mockResolvedValue(undefined) }) };
  const app = { firstWindow: vi.fn().mockResolvedValue(window), evaluate: vi.fn().mockResolvedValue(undefined), close: vi.fn() };
  electron.launch.mockResolvedValue(app);
  try {
    const launched = await launchR3Desktop({ executable: 'unused.exe', profileRoot: profile, projectRoot: profile });
    expect(launched.artifacts).toBe(profile);
    expect(electron.launch).toHaveBeenCalledWith(expect.objectContaining({ args: [`--r3-test-profile=${profile}`], bypassCSP: false }));
  } finally { await rm(profile, { recursive: true, force: true }); }
});

it.runIf(process.platform === 'win32')('does not launch Electron for a profile escaping through a directory junction', async () => {
  const profile = await createR3Profile('boundary'), outside = await mkdtemp(join(tmpdir(), 'codryn-launch-outside-'));
  const alias = join(profile, 'linked'); await symlink(outside, alias, 'junction');
  // If the boundary fails, a launch error must not masquerade as boundary rejection.
  electron.launch.mockRejectedValue(new Error('UNSAFE_LAUNCH'));
  try {
    await expect(launchR3Desktop({ executable: 'unused.exe', profileRoot: alias, projectRoot: outside })).rejects.toThrow('R3_PROFILE_BOUNDARY');
    expect(electron.launch).not.toHaveBeenCalled();
  } finally { await rm(profile, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});
