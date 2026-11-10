import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile,readdir,writeFile,mkdir } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import type { launchR3Desktop } from './r3-desktop.js';

type Desktop=Awaited<ReturnType<typeof launchR3Desktop>>;
const exec=promisify(execFile);
export const step4Artifacts=resolve('.r3-artifacts/2026-10-31-step4/electron');
export async function saveAdverseEvidence(name:string,value:unknown){await mkdir(step4Artifacts,{recursive:true});await writeFile(join(step4Artifacts,name),JSON.stringify(value,null,2)+'\n');}
export function processAlive(pid:number){try{process.kill(pid,0);return true;}catch{return false;}}
export async function processIdentities(pids:number[]){
  if(pids.some(pid=>!Number.isSafeInteger(pid)||pid<=0))throw new Error('INVALID_OBSERVED_PID');
  const script=`ConvertTo-Json -Compress -InputObject @(${pids.map(pid=>`Get-Process -Id ${pid} -ErrorAction Stop | Select-Object Id,@{Name='creationTime';Expression={$_.StartTime.ToUniversalTime().Ticks.ToString()}}`).join(';')})`;
  const result=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{cwd:resolve('.'),timeout:5000,windowsHide:true,maxBuffer:65536});
  return JSON.parse(result.stdout) as {Id:number;creationTime:string}[];
}
async function workerHostPid(pid:number){
  const script=`$line=(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CommandLine;if($line -match '-CommandJson\\s+"?([A-Za-z0-9+/=]+)'){$Matches[1]}else{throw 'OWNED_WORKER_COMMAND_MISSING'}`;
  const result=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{cwd:resolve('.'),timeout:5000,windowsHide:true,maxBuffer:65536});
  const command=JSON.parse(Buffer.from(result.stdout.trim(),'base64').toString('utf8')) as {hostPid:unknown};if(typeof command.hostPid!=='number')throw new Error('OWNED_HOST_PID_MISSING');return command.hostPid;
}
// This observer runs in Vitest, outside Electron. It kills only the main PID.
export async function crashHostAndObserve(desktop:Desktop,pids:number[]){
  const launcherPid=desktop.app.process().pid,main=await desktop.app.evaluate(({app})=>({pid:process.pid,execPath:process.execPath,electron:process.versions.electron,metrics:app.getAppMetrics().map(item=>({pid:item.pid,type:item.type}))})),mainPid=main.pid;
  await saveAdverseEvidence('main-identity-diagnostic.json',{launcherPid,launcherExecutable:desktop.app.process().spawnfile,main});
  if(!launcherPid||!mainPid||pids.includes(mainPid)||!main.electron||!main.metrics.some(item=>item.type==='Browser'&&item.pid===mainPid)||resolve(main.execPath).toLowerCase()!==desktop.executable.toLowerCase())throw new Error('INVALID_OWNED_MAIN_PID');
  const electronPids=main.metrics.map(item=>item.pid).filter(pid=>pid!==mainPid);
  const identities=await processIdentities([mainPid,...pids]),passedHostPid=pids[0]?await workerHostPid(pids[0]):null;
  if(passedHostPid!==null&&passedHostPid!==mainPid)throw new Error('WORKER_HOST_PID_MISMATCH');
  let start=0,mainExitElapsedMs:number|null=null,launcherExitElapsedMs:number|null=null;
  const exited=new Promise<void>(resolveExit=>desktop.app.process().once('exit',()=>{launcherExitElapsedMs=performance.now()-start;resolveExit();}));
  start=performance.now();process.kill(mainPid,'SIGKILL');
  while((pids.some(processAlive)||processAlive(mainPid))&&performance.now()-start<2000){if(mainExitElapsedMs===null&&!processAlive(mainPid))mainExitElapsedMs=performance.now()-start;await new Promise(done=>setTimeout(done,10));}
  if(mainExitElapsedMs===null&&!processAlive(mainPid))mainExitElapsedMs=performance.now()-start;
  const elapsedMs=performance.now()-start,survivors=pids.filter(processAlive);await exited;
  // The renderer/GPU processes naturally release the single-instance profile lock shortly after main exit.
  const releaseDeadline=performance.now()+5000;while(electronPids.some(processAlive)&&performance.now()<releaseDeadline)await new Promise(done=>setTimeout(done,10));
  return {launcherPid,mainPid,passedHostPid,identities,mainExitElapsedMs,launcherExitElapsedMs,elapsedMs,survivors,electronPids,electronSurvivors:electronPids.filter(processAlive),killScope:'main-pid-only'};
}
// Cleanup is deliberately separate and must only follow measurement. These are fixture-owned PIDs.
export async function cleanupObserved(identities:{Id:number;creationTime:string}[]){
  for(const identity of identities){if(!Number.isSafeInteger(identity.Id)||identity.Id<=0||!/^\d+$/.test(identity.creationTime))continue;
    const script=`$owned=Get-Process -Id ${identity.Id} -ErrorAction SilentlyContinue;if($owned){$null=$owned.Handle;if($owned.StartTime.ToUniversalTime().Ticks.ToString() -eq '${identity.creationTime}'){$owned.Kill();$null=$owned.WaitForExit(1000)}}`;
    await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{cwd:resolve('.'),timeout:5000,windowsHide:true,maxBuffer:65536}).catch(()=>undefined);
  }
}
export async function scanForMarker(directory:string,marker:string,live=false,lockedChromiumFiles:string[]=[]){
  let files=0;
  for(const entry of await readdir(directory,{withFileTypes:true})){const file=join(directory,entry.name);if(entry.isDirectory())files+=await scanForMarker(file,marker,live,lockedChromiumFiles);else{
    try{const bytes=await readFile(file);if(bytes.includes(Buffer.from(marker,'utf8'))||bytes.includes(Buffer.from(marker,'utf16le')))throw new Error(`SYNTHETIC_SECRET_LEAK:${file}`);files++;}
    catch(error){const code=error instanceof Error?Reflect.get(error,'code'):undefined;if(live&&code==='EBUSY'&&/(?:Local Storage[\\/]leveldb|Session Storage)[\\/]LOCK$/.test(file)){lockedChromiumFiles.push(file);continue;}throw error;}
  }}
  return files;
}
export async function captureDesktopBoundaries(desktop:Desktop){
  const logs:string[]=[];desktop.app.process().stdout?.on('data',data=>logs.push(String(data)));desktop.app.process().stderr?.on('data',data=>logs.push(String(data)));desktop.window.on('console',message=>logs.push(message.text()));
  await desktop.app.evaluate(({ipcMain,BrowserWindow})=>{
    const capture={responses:[] as unknown[],updates:[] as unknown[]};Reflect.set(globalThis,'codrynAdverseCapture',capture);
    const handlers=Reflect.get(ipcMain,'_invokeHandlers') as Map<string,(...args:unknown[])=>Promise<unknown>>,original=handlers.get('r3:invoke');if(!original)throw new Error('CAPTURE_HANDLER_MISSING');
    handlers.set('r3:invoke',async(...args)=>{const response=await original(...args);capture.responses.push(response);return response;});
    const contents=BrowserWindow.getAllWindows()[0]?.webContents;if(!contents)throw new Error('CAPTURE_WINDOW_MISSING');const send=contents.send.bind(contents);contents.send=(channel,...args)=>{if(channel==='r3:update')capture.updates.push(args[0]);send(channel,...args);};
  });
  await desktop.window.evaluate(()=>{const capture:unknown[]=[];Reflect.set(window,'codrynPreloadCapture',capture);const api=Reflect.get(window,'codryn') as {r3:{onUpdate:(listener:(value:unknown)=>void)=>unknown}};api.r3.onUpdate(value=>capture.push(value));});
  return async(chatId?:string)=>({main:await desktop.app.evaluate(()=>Reflect.get(globalThis,'codrynAdverseCapture') as {responses:unknown[];updates:unknown[]}),preload:await desktop.window.evaluate(()=>Reflect.get(window,'codrynPreloadCapture') as unknown[]),preloadReplies:await desktop.window.evaluate(async id=>{const api=Reflect.get(window,'codryn') as {r3:{invoke:(input:{operation:string;requestId:string;chatId?:string})=>Promise<unknown>}};const replies=[await api.r3.invoke({operation:'settings.get',requestId:crypto.randomUUID()})];if(id)replies.push(await api.r3.invoke({operation:'chat.snapshot',requestId:crypto.randomUUID(),chatId:id}));return replies;},chatId),logs:[...logs]});
}
