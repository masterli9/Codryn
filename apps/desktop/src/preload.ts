import { contextBridge, ipcRenderer } from 'electron';
import {
  R0_DIAGNOSTICS_CHANNEL,
  r0DiagnosticRequestSchema,
  r0IpcResponseSchema,
  type R0IpcResponse
} from '@codryn/shared';
import { r3IpcRequestSchema,r3ResponseSchemas,r3UpdateSchema } from '@codryn/shared';
import type { R3Operation,R3IpcRequest,R3ResponseFor,R3Update } from '@codryn/shared';
const listeners=new Set<(value:R3Update)=>void>();
ipcRenderer.on('r3:update',(_event,raw:unknown)=>{const parsed=r3UpdateSchema.safeParse(raw);if(!parsed.success)return;for(const listener of listeners){try{listener(parsed.data);}catch{/* One view cannot prevent acknowledgement. */}}ipcRenderer.send('r3:update-ack',{chatId:parsed.data.chatId,cursor:parsed.data.cursor});});

contextBridge.exposeInMainWorld('codryn', Object.freeze({
  r3:Object.freeze({invoke:async<O extends R3Operation>(input:Extract<R3IpcRequest,{operation:O}>):Promise<R3ResponseFor<O>>=>{const request=r3IpcRequestSchema.parse(input),raw:unknown=await ipcRenderer.invoke('r3:invoke',request);return r3ResponseSchemas[request.operation].parse(raw) as R3ResponseFor<O>;},onUpdate:(listener:(value:R3Update)=>void)=>{listeners.add(listener);return ()=>listeners.delete(listener);}}),
  runR0Diagnostics: async (input: unknown): Promise<R0IpcResponse> => {
    const request = r0DiagnosticRequestSchema.parse(input);
    const response: unknown = await ipcRenderer.invoke(R0_DIAGNOSTICS_CHANNEL, request);
    return r0IpcResponseSchema.parse(response);
  }
}));
