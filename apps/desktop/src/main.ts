import { existsSync } from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import started from 'electron-squirrel-startup';
import { createApplicationServices, type ApplicationServices } from './composition-root.js';
import { registerR0Handler } from './ipc/register-r0-handler.js';
import { runR0Smoke } from './smoke/run-r0-smoke.js';
import { runR2Smoke } from './smoke/run-r2-smoke.js';

let mainWindow: BrowserWindow | undefined;
let applicationServices: ApplicationServices | undefined;

export function resolveFixtureDirectory(isPackaged: boolean): string {
  return isPackaged
    ? path.join(process.resourcesPath, 'process')
    : path.resolve(process.cwd(), '../../tests/support/fixtures/process');
}

export function resolveR2FixtureDirectory(isPackaged: boolean): string {
  return isPackaged
    ? path.join(process.resourcesPath, 'r2-project')
    : path.resolve(process.cwd(), '../../tests/support/fixtures/r2-project');
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

const r0SmokeMode = process.argv.includes('--r0-smoke');
const r2SmokeMode = process.argv.includes('--r2-smoke');
const smokeMode = r0SmokeMode || r2SmokeMode;
if (smokeMode) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('in-process-gpu');
  app.commandLine.appendSwitch('use-gl', 'swiftshader');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
}
const userDataPrefix = r2SmokeMode ? '--r2-user-data-dir=' : '--r0-user-data-dir=';
const userDataArgument = process.argv.find((argument) => argument.startsWith(userDataPrefix));
const anyUserDataArgument = process.argv.find((argument) => argument.startsWith('--r0-user-data-dir=') || argument.startsWith('--r2-user-data-dir='));
const r2NodeExecutableArgument = process.argv.find((argument) => argument.startsWith('--r2-node-executable='));
const r2NodeExecutable = r2NodeExecutableArgument?.slice('--r2-node-executable='.length);
const smokeUserDataPath = userDataArgument?.slice(userDataPrefix.length);
const smokeArgumentsValid = !smokeMode || (
  smokeUserDataPath !== undefined && path.isAbsolute(smokeUserDataPath) && !(r0SmokeMode && r2SmokeMode) &&
  (r2NodeExecutable === undefined || path.isAbsolute(r2NodeExecutable))
);

if (anyUserDataArgument !== undefined && !smokeMode) {
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
      if (!r2SmokeMode) {
        requireFixtures(fixtureDirectory);
        applicationServices = await createApplicationServices(app.getPath('userData'), fixtureDirectory);
      }

      if (r2SmokeMode && smokeUserDataPath !== undefined) {
        const report = await runR2Smoke(app.getPath('userData'), resolveR2FixtureDirectory(app.isPackaged), r2NodeExecutable ?? process.execPath);
        app.exit(report.database === 'pass' && report.guardedWrite === 'pass' && report.processTree === 'pass' && report.returnedToBaseline ? 0 : 1);
        return;
      }

      if (r0SmokeMode) {
        const services = applicationServices;
        if (services === undefined) throw new Error('R0 services were not initialized.');
        try {
          const report = await runR0Smoke(services, app.getPath('userData'));
          app.exit(report.overallStatus === 'passed' ? 0 : 1);
        } finally {
          services.close();
          if (applicationServices === services) applicationServices = undefined;
        }
        return;
      }

      const services = applicationServices;
      if (services === undefined) throw new Error('R0 services were not initialized.');
      registerR0Handler(ipcMain, services.runR0Diagnostics);
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
