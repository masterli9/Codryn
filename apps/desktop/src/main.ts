import { existsSync } from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import started from 'electron-squirrel-startup';
import { createApplicationServices, type ApplicationServices } from './composition-root.js';
import { registerR0Handler } from './ipc/register-r0-handler.js';
import { runR0Smoke } from './smoke/run-r0-smoke.js';

let mainWindow: BrowserWindow | undefined;
let applicationServices: ApplicationServices | undefined;

export function resolveFixtureDirectory(isPackaged: boolean): string {
  return isPackaged
    ? path.join(process.resourcesPath, 'process')
    : path.resolve(process.cwd(), '../../tests/support/fixtures/process');
}

function requireFixtures(directory: string): void {
  for (const filename of ['emit-output.ps1', 'exit-nonzero.ps1', 'spawn-child-tree.ps1', 'large-output.ps1']) {
    if (!existsSync(path.join(directory, filename))) throw new Error('R0_FIXTURES_MISSING');
  }
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1_080,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    show: false,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl !== MAIN_WINDOW_WEBPACK_ENTRY) {
      event.preventDefault();
    }
  });
  window.once('ready-to-show', () => { window.show(); });
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = undefined;
    }
  });
  void window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  return window;
}

const smokeMode = process.argv.includes('--r0-smoke');
const userDataArgument = process.argv.find((argument) => argument.startsWith('--r0-user-data-dir='));
const smokeUserDataPath = userDataArgument?.slice('--r0-user-data-dir='.length);
const smokeArgumentsValid = !smokeMode || (
  smokeUserDataPath !== undefined && path.isAbsolute(smokeUserDataPath)
);

if (userDataArgument !== undefined && !smokeMode) {
  process.stderr.write('R0 smoke startup failed.\n');
  app.exit(1);
} else if (!smokeArgumentsValid) {
  process.stderr.write('R0 smoke startup failed.\n');
  app.exit(1);
} else if (started) {
  app.quit();
} else {
  if (smokeMode && smokeUserDataPath !== undefined) app.setPath('userData', smokeUserDataPath);

  void app.whenReady().then(async () => {
    try {
      const fixtureDirectory = resolveFixtureDirectory(app.isPackaged);
      requireFixtures(fixtureDirectory);
      applicationServices = await createApplicationServices(app.getPath('userData'), fixtureDirectory);

      if (smokeMode) {
        try {
          const report = await runR0Smoke(applicationServices, app.getPath('userData'));
          app.exit(report.overallStatus === 'passed' ? 0 : 1);
        } finally {
          applicationServices.close();
          applicationServices = undefined;
        }
        return;
      }

      registerR0Handler(ipcMain, applicationServices.runR0Diagnostics);
      mainWindow = createWindow();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
      });
    } catch {
      process.stderr.write('R0 smoke startup failed.\n');
      app.exit(1);
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.once('will-quit', () => {
    applicationServices?.close();
    applicationServices = undefined;
  });
}
