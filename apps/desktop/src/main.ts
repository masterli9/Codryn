import { app, BrowserWindow, ipcMain } from 'electron';
import started from 'electron-squirrel-startup';
import type { RunR0Diagnostics } from '@codryn/core';
import { registerR0Handler } from './ipc/register-r0-handler.js';

let mainWindow: BrowserWindow | undefined;
let closeApplicationServices: (() => void) | undefined;

export function installR0ApplicationServices(
  service: Pick<RunR0Diagnostics, 'execute'>,
  close: () => void
): void {
  registerR0Handler(ipcMain, service);
  closeApplicationServices = close;
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

if (started) {
  app.quit();
} else {
  void app.whenReady().then(() => {
    mainWindow = createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.once('will-quit', () => {
    closeApplicationServices?.();
    closeApplicationServices = undefined;
  });
}
