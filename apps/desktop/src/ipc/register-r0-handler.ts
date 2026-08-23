import type { IpcMain } from 'electron';
import type { RunR0Diagnostics } from '@codryn/core';
import { R0_DIAGNOSTICS_CHANNEL } from '@codryn/shared';
import { createR0Handler } from './r0-handler.js';

export function registerR0Handler(
  ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>,
  service: Pick<RunR0Diagnostics, 'execute'>
): void {
  ipcMain.removeHandler(R0_DIAGNOSTICS_CHANNEL);
  ipcMain.handle(R0_DIAGNOSTICS_CHANNEL, createR0Handler(service));
}
