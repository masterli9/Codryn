import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const desktop = vi.hoisted(() => {
  const frame = { url: 'file:///app/index.html' };
  const sender = { id: 1, mainFrame: frame, isDestroyed: () => false, send: vi.fn(), on: vi.fn(), once: vi.fn(), setWindowOpenHandler: vi.fn() };
  const window = { webContents: sender, on: vi.fn(), once: vi.fn(), loadURL: vi.fn().mockResolvedValue(undefined), show: vi.fn() };
  const handlers = new Map<string, (event: unknown, input: unknown) => Promise<unknown>>();
  return {
    frame, sender, window, handlers,
    app: { whenReady: vi.fn().mockResolvedValue(undefined), requestSingleInstanceLock: vi.fn().mockReturnValue(true), on: vi.fn(), once: vi.fn(), getPath: vi.fn().mockReturnValue('unused-profile'), setPath: vi.fn(), exit: vi.fn(), quit: vi.fn(), disableHardwareAcceleration: vi.fn(), commandLine: { appendSwitch: vi.fn() }, isPackaged: false },
    BrowserWindow: Object.assign(vi.fn(function () { return window; }), { getAllWindows: vi.fn().mockReturnValue([window]) })
  };
});
vi.mock('electron', () => ({
  app: desktop.app, BrowserWindow: desktop.BrowserWindow, dialog: {},
  ipcMain: { handle: (name: string, handler: (event: unknown, raw: unknown) => Promise<unknown>) => desktop.handlers.set(name, handler), removeHandler: (name: string) => desktop.handlers.delete(name), on: vi.fn(), removeListener: vi.fn() }
}));
vi.mock('electron-squirrel-startup', () => ({ default: false }));
vi.mock('../src/composition-root.js', () => ({ createApplicationServices: vi.fn(), createDesktopApplicationServices: vi.fn().mockRejectedValue(new Error('synthetic-startup-secret')) }));
vi.mock('../src/smoke/run-r0-smoke.js', () => ({ runR0Smoke: vi.fn() }));
vi.mock('../src/smoke/run-r2-smoke.js', () => ({ runR2Smoke: vi.fn() }));
vi.mock('../src/smoke/run-r3-smoke.js', () => ({ runR3Smoke: vi.fn().mockResolvedValue({ passed: true }), r3SmokePhases: ['store'] }));

const originalArgv = process.argv;
const directories: string[] = [];
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); desktop.handlers.clear();
  process.argv = originalArgv.filter(value => !value.startsWith('--r3-'));
  vi.stubGlobal('MAIN_WINDOW_WEBPACK_ENTRY', desktop.frame.url);
  vi.stubGlobal('MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY', 'file:///app/preload.js');
});
afterEach(async () => {
  process.argv = originalArgv; vi.unstubAllGlobals();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

it('keeps sender and input validation active when opening or recovering the database fails', async () => {
  await import('../src/main.js');
  await vi.waitFor(() => expect(desktop.handlers.has('r3:invoke')).toBe(true));
  const invoke = desktop.handlers.get('r3:invoke'); if (!invoke) throw new Error('Missing handler');
  const trusted = { sender: desktop.sender, senderFrame: desktop.frame };
  const request = { operation: 'project.list', requestId: randomUUID() };
  for (const event of [
    { ...trusted, sender: { ...desktop.sender, id: 2 } },
    { ...trusted, senderFrame: { url: desktop.frame.url } },
    { ...trusted, senderFrame: null },
    { ...trusted, sender: { ...desktop.sender, isDestroyed: () => true } }
  ]) expect(await invoke(event, request)).toMatchObject({ ok: false, error: { code: 'R3_SENDER_REJECTED' } });
  for (const input of [null, { ...request, root: 'outside' }, { operation: 'shell.run', requestId: randomUUID() }]) {
    expect(await invoke(trusted, input)).toMatchObject({ ok: false, error: { code: 'R3_INPUT_INVALID' } });
  }
  const response = await invoke(trusted, request);
  expect(response).toMatchObject({ ok: false, error: { code: 'R3_RECOVERY_REQUIRED' } });
  expect(JSON.stringify(response)).not.toContain('synthetic-startup-secret');
});

it.runIf(process.platform === 'win32')('rejects a test-profile junction before changing the Electron user profile', async () => {
  const artifacts = resolve('.r3-artifacts'); await mkdir(artifacts, { recursive: true });
  const owned = await mkdtemp(join(artifacts, 'profile-boundary-')), outside = await mkdtemp(join(tmpdir(), 'codryn-profile-outside-'));
  directories.push(owned, outside);
  const alias = join(owned, 'linked'); await symlink(outside, alias, 'junction');
  process.argv.push(`--r3-test-profile=${alias}`);
  await expect(import('../src/main.js')).rejects.toThrow('R3_TEST_PROFILE_INVALID');
  expect(desktop.app.setPath).not.toHaveBeenCalled();
});

it('accepts a real artifact profile before starting desktop services', async () => {
  const artifacts = resolve('.r3-artifacts'); await mkdir(artifacts, { recursive: true });
  const profile = await mkdtemp(join(artifacts, 'valid-profile-')); directories.push(profile);
  process.argv.push(`--r3-test-profile=${profile}`);
  await import('../src/main.js');
  await vi.waitFor(() => expect(desktop.handlers.has('r3:invoke')).toBe(true));
  expect(desktop.app.setPath).toHaveBeenCalledWith('userData', profile);
});

it.runIf(process.platform === 'win32')('also rejects a junction in the packaged R3 smoke profile before setPath', async () => {
  const artifacts = resolve('.r3-artifacts'); await mkdir(artifacts, { recursive: true });
  const owned = await mkdtemp(join(artifacts, 'smoke-boundary-')), outside = await mkdtemp(join(tmpdir(), 'codryn-smoke-outside-'));
  directories.push(owned, outside);
  const alias = join(owned, 'linked'); await symlink(outside, alias, 'junction');
  process.argv.push('--r3-smoke', '--r3-phase=store', `--r3-user-data-dir=${alias}`);
  await import('../src/main.js');
  expect(desktop.app.exit).toHaveBeenCalledWith(1);
  expect(desktop.app.setPath).not.toHaveBeenCalled();
});
