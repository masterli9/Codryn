import type { R0IpcResponse } from '@codryn/shared';
import type { R3Bridge } from './renderer/r3-client.js';

declare global {
  const MAIN_WINDOW_WEBPACK_ENTRY: string;
  const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

  interface Window {
    readonly codryn: {
      readonly r3:R3Bridge;
      runR0Diagnostics(input: unknown): Promise<R0IpcResponse>;
    };
  }
}

export {};
