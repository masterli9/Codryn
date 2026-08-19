import { contextBridge, ipcRenderer } from 'electron';
import {
  R0_DIAGNOSTICS_CHANNEL,
  r0DiagnosticRequestSchema,
  r0IpcResponseSchema,
  type R0IpcResponse
} from '@codryn/shared';

contextBridge.exposeInMainWorld('codryn', Object.freeze({
  runR0Diagnostics: async (input: unknown): Promise<R0IpcResponse> => {
    const request = r0DiagnosticRequestSchema.parse(input);
    const response: unknown = await ipcRenderer.invoke(R0_DIAGNOSTICS_CHANNEL, request);
    return r0IpcResponseSchema.parse(response);
  }
}));
