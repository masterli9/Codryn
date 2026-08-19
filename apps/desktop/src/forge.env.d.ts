import type { R0IpcResponse } from '@codryn/shared';

declare global {
  const MAIN_WINDOW_WEBPACK_ENTRY: string;
  const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

  interface Window {
    readonly codryn: {
      runR0Diagnostics(input: unknown): Promise<R0IpcResponse>;
    };
  }
}

export {};
