import { dialog,ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { z } from 'zod';
import { uuidSchema } from '@codryn/shared';
import type { R3Infrastructure } from '@codryn/infrastructure';
import { assertR3Sender,createR3Handler } from './r3-handler.js';
import { R3Subscriptions } from './r3-subscriptions.js';
export function registerR3Handlers(window:BrowserWindow,services:R3Infrastructure,entry:string):()=>void {
  const subscriptions=new R3Subscriptions(services.subscriptions),assertSender=(event:Parameters<typeof assertR3Sender>[0])=>assertR3Sender(event,window.webContents,entry);
  ipcMain.handle('r3:invoke',createR3Handler({services,assertSender,subscriptions,chooseDirectory:async()=>{const chosen=await dialog.showOpenDialog(window,{title:'Otevřít projekt',properties:['openDirectory']});return chosen.canceled?null:chosen.filePaths[0]??null;}}));
  const ackSchema=z.object({chatId:uuidSchema,cursor:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)}).strict();
  const ack=(event:Electron.IpcMainEvent,value:unknown)=>{try{assertSender(event);const input=ackSchema.parse(value);subscriptions.acknowledge(event.sender.id,input.chatId,input.cursor);}catch{/* Untrusted messages cannot change backend state. */}};
  ipcMain.on('r3:update-ack',ack);
  window.webContents.on('did-start-navigation',(_event,_url,_inPlace,isMainFrame)=>{if(isMainFrame)subscriptions.detachOwner(window.webContents.id);});
  window.webContents.once('destroyed',()=>subscriptions.close());
  return ()=>{subscriptions.close();ipcMain.removeHandler('r3:invoke');ipcMain.removeListener('r3:update-ack',ack);};
}
