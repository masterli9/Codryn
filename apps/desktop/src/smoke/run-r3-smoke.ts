import { randomUUID,createHash } from 'node:crypto';
import { cp,mkdir,readFile,readdir,writeFile } from 'node:fs/promises';
import { existsSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { app } from 'electron';
import { createDesktopApplicationServices } from '../composition-root.js';
export const r3SmokePhases=['store','reopen','replace','remove','removed','workflow-git','workflow-non-git','cancel'] as const;
export type R3SmokePhase=typeof r3SmokePhases[number];
const marker=['codryn','synthetic','r3','packaged','2026'].join('-');
const exec=promisify(execFile);
async function scan(directory:string):Promise<boolean>{for(const entry of await readdir(directory,{withFileTypes:true})){const file=join(directory,entry.name);if(entry.isSymbolicLink())throw new Error('R3_SMOKE_BOUNDARY');if(entry.isDirectory()){if(!await scan(file))return false;}else{const value=await readFile(file);if(value.includes(Buffer.from(marker))||value.includes(Buffer.from(marker+'-replacement')))return false;}}return true;}
async function poll<T>(read:()=>Promise<T>,ready:(value:T)=>boolean,signal:AbortSignal){while(true){signal.throwIfAborted();const value=await read();if(ready(value))return value;await new Promise(resolve=>setTimeout(resolve,50));}}
export async function runR3Smoke(profileRoot:string,fixtureSource:string,phase:R3SmokePhase){
  const signal=AbortSignal.timeout(25000),host=await createDesktopApplicationServices(profileRoot,phase==='cancel'?'stream':undefined);
  let secretRestartPassed:boolean|null=null,workflowPassed:boolean|null=null,cancelTreePassed:boolean|null=null,passed=false,shutdownFailed=false;
  try{
    if(phase==='store')await host.settings.saveKey(marker);
    else if(phase==='reopen'){secretRestartPassed=await host.resources.secrets.read('openai')===marker;if(!secretRestartPassed)throw new Error('R3_SECRET_RESTART_FAILED');}
    else if(phase==='replace'){await host.settings.saveKey(marker+'-replacement');secretRestartPassed=await host.resources.secrets.read('openai')===marker+'-replacement';if(!secretRestartPassed)throw new Error('R3_SECRET_REPLACE_FAILED');}
    else if(phase==='remove'){if(await host.resources.secrets.read('openai')!==marker+'-replacement')throw new Error('R3_SECRET_RESTART_FAILED');await host.settings.removeKey();}
    else if(phase==='removed'){secretRestartPassed=await host.resources.secrets.state('openai')==='missing';if(!secretRestartPassed)throw new Error('R3_SECRET_REMOVE_FAILED');}
    else{
      const root=join(profileRoot,phase);await mkdir(root,{recursive:true});await cp(fixtureSource,root,{recursive:true});
      if(phase==='workflow-git'){for(const args of [['init','-b','main'],['config','--local','user.name','R3 smoke'],['config','--local','user.email','r3@invalid.local'],['add','sum.mjs','sum.test.mjs'],['commit','-m','fixture']])await exec('git',args,{cwd:root,timeout:5000,windowsHide:true});}
      if(phase==='cancel'){
        await writeFile(join(root,'delayed-child.mjs'),"import {writeFileSync} from 'node:fs';setTimeout(()=>writeFileSync('late-marker','late'),5000);setInterval(()=>{},1000);\n");
        await writeFile(join(root,'stream-child.mjs'),"import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';const child=spawn(process.execPath,['delayed-child.mjs'],{stdio:'ignore'});writeFileSync('pids.json',JSON.stringify([process.pid,child.pid]));process.stdout.write('stdout before completion\\n');process.stderr.write('stderr before completion\\n');setInterval(()=>{},1000);\n");
      }
      const before=await readFile(join(root,'sum.mjs')),project=await host.projects.open(root,signal),chat=await host.chats.create(project.id,'Packaged reference'),accepted=await host.manager.submit({requestId:randomUUID(),chatId:chat.id,mode:'demo',maxSteps:16,task:'Oprav a ověř referenční součet.'});
      const waiting=await poll(()=>host.projections.snapshot(chat.id),value=>value.permissions.length>0||value.run?.state==='finished'||value.run?.state==='interrupted',signal),permission=waiting.permissions[0];if(!permission)throw new Error('R3_SMOKE_APPROVAL_MISSING');
      await host.answerPermission(chat.id,project.id,{id:permission.id,digest:permission.digest,decision:'allow_once'});
      if(phase==='cancel'){
        await poll(async()=>existsSync(join(root,'pids.json')),value=>value,signal);const pids=JSON.parse(await readFile(join(root,'pids.json'),'utf8')) as number[];
        await poll(()=>host.projections.snapshot(chat.id),value=>value.commands.some(command=>command.stdoutTail.includes('stdout before')&&command.stderrTail.includes('stderr before')),signal);
        await host.stop(chat.id,project.id,accepted.jobId);await host.manager.wait(accepted.jobId);const finished=await host.projections.snapshot(chat.id);
        const gone=pids.every(pid=>{try{process.kill(pid,0);return false;}catch(error){return error instanceof Error&&Reflect.get(error,'code')==='ESRCH';}});
        cancelTreePassed=gone&&finished.commands.every(command=>command.treeStopped===true)&&!existsSync(join(root,'late-marker'));if(!cancelTreePassed)throw new Error('R3_SMOKE_CANCEL_FAILED');
      }else{
        const finished=await host.manager.wait(accepted.jobId);if(finished.result?.status!=='completed'||finished.result.verification.status!=='verified')throw new Error('R3_SMOKE_WORKFLOW_FAILED');
        const snapshot=await host.snapshot(chat.id,signal),setId=snapshot.changes?.setId;if(!setId)throw new Error('R3_SMOKE_DIFF_MISSING');const view=await host.diff(chat.id,setId,signal);const reverted=await host.revert({requestId:randomUUID(),chatId:chat.id,setId,expectedSetSequence:view.observedSetSequence,expectedWorkspaceRevision:view.workspaceRevision},signal);
        workflowPassed=reverted.status==='reverted'&&before.equals(await readFile(join(root,'sum.mjs')))&&snapshot.commands.every(command=>command.treeStopped===true);if(!workflowPassed)throw new Error('R3_SMOKE_RETURN_FAILED');
      }
    }
    const metadata=await host.settings.get();if(JSON.stringify(metadata).includes(marker))throw new Error('R3_SMOKE_METADATA_LEAK');passed=true;
  }finally{const stopped=await host.shutdown(AbortSignal.timeout(10000));shutdownFailed=!stopped.stopped;if(stopped.stopped)host.close();}
  if(shutdownFailed)throw new Error('R3_SMOKE_SHUTDOWN_FAILED');
  const noPlaintextPassed=await scan(profileRoot);let buildHash:string;const previousNoAsar=process.noAsar;process.noAsar=true;
  try{buildHash=createHash('sha256').update(readFileSync(join(app.getAppPath(),'..','app.asar'))).digest('hex');}finally{process.noAsar=previousNoAsar;}
  const report={schemaVersion:1,phase,buildHash,runtime:{electron:process.versions.electron,node:process.versions.node,platform:process.platform},secretRestartPassed,noPlaintextPassed,workflowPassed,cancelTreePassed,passed:passed&&noPlaintextPassed};await writeFile(join(profileRoot,`r3-${phase}.json`),JSON.stringify(report,null,2)+'\n');return report;
}
