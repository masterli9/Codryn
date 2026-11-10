import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OwnedCommandStore } from '@codryn/core';
const exec=promisify(execFile);
export async function recoverOwnedCommands(store: OwnedCommandStore,projectId?:string): Promise<boolean> {
  const script=fileURLToPath(new URL('./r3-command-recovery.ps1',import.meta.url)).replace(`${sep}app.asar${sep}`,`${sep}app.asar.unpacked${sep}`);
  const job=fileURLToPath(new URL('./r2-command-job.cs',import.meta.url)).replace(`${sep}app.asar${sep}`,`${sep}app.asar.unpacked${sep}`);
  for(const owner of await store.pending(projectId)) {
    if(process.platform!=='win32')return false;
    try {
      const system=join(process.env.SystemRoot??'C:\\Windows','System32');
      const result=await exec(join(system,'WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-File',script,'-JobPath',job,'-Evidence',Buffer.from(JSON.stringify(owner)).toString('base64')],{cwd:system,timeout:10000,windowsHide:true,maxBuffer:4096});
      if(result.stdout.trim()==='stopped')await store.markStopped(owner.callId);
    }catch{ /* Durable unresolved ownership continues to block privileged operations. */ }
  }
  return (await store.pending(projectId)).length===0;
}
