import { mkdtemp,rm,writeFile,readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { expect,it } from 'vitest';
import { R2CommandRunner } from '../src/process/r2-command-runner.js';
import { R2CommandProtocol } from '../src/process/r2-command-protocol.js';
it.runIf(process.platform==='win32')('observes stdout and stderr before releasing the actual process barrier',async()=>{
  const root=await mkdtemp(join(tmpdir(),'codryn-r3-output-')),latch=join(root,'release');let stdout='',stderr='',released=false;const out=new StringDecoder('utf8'),err=new StringDecoder('utf8');
  try{
    const result=await new R2CommandRunner(root).run({executable:process.execPath,args:['-e',`process.stdout.write('žluťoučký');process.stderr.write('stderr-ready');const fs=require('node:fs');const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(latch)})){clearInterval(timer);}},10);`],cwd:root,timeoutMs:5000,maxOutputBytes:65536},new AbortController().signal,chunk=>{if(chunk.stream==='stdout')stdout+=out.write(Buffer.from(chunk.bytes));else stderr+=err.write(Buffer.from(chunk.bytes));if(stdout.includes('žluťoučký')&&stderr.includes('stderr-ready')&&!released){released=true;void writeFile(latch,'release');}});
    expect(released).toBe(true);expect(result).toMatchObject({status:'succeeded',treeStopped:true,stdout:'žluťoučký',stderr:'stderr-ready'});
  }finally{await rm(root,{recursive:true,force:true});}
});
it('parses split and combined frames but rejects duplicate terminal or invalid base64',()=>{
  const parser=new R2CommandProtocol();expect(parser.push(Buffer.from('{"type":"out'))).toEqual([]);expect(parser.push(Buffer.from('put","stream":"stdout","sequence":1,"data":"eA=="}\n'))).toEqual([{type:'output',stream:'stdout',sequence:1,data:'eA=='}]);
  expect(()=>new R2CommandProtocol().push(Buffer.from('{"type":"output","stream":"stdout","sequence":1,"data":"%%%"}\n'))).toThrow();
  const result='{"type":"result","status":"succeeded","exitCode":0,"stdout":"","stderr":"","truncated":false,"durationMs":1,"treeStopped":true}\n';expect(()=>new R2CommandProtocol().push(Buffer.from(result+result))).toThrow();
});
it.runIf(process.platform==='win32')('waits for durable ownership before execution and cancels the entire owned tree',async()=>{
  const root=await mkdtemp(join(tmpdir(),'codryn-r3-owner-')),marker=join(root,'executed');const controller=new AbortController();let owned=false;
  try {
    const result=await new R2CommandRunner(root,{onOwned:async ownership=>{expect(ownership.worker.creationTime).toMatch(/^\d+$/);expect(ownership.target.creationTime).toMatch(/^\d+$/);await expect(readFile(marker)).rejects.toThrow();owned=true;}}).run({executable:process.execPath,args:['-e',`require('node:fs').writeFileSync(${JSON.stringify(marker)},'started');require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});process.stdout.write('started');setInterval(()=>{},1000);`],cwd:root,timeoutMs:10000,maxOutputBytes:65536},controller.signal,()=>controller.abort());
    expect(owned).toBe(true);expect(result).toMatchObject({status:'cancelled',treeStopped:true});
  }finally{await rm(root,{recursive:true,force:true});}
});
it.runIf(process.platform==='win32')('kills descendants within two seconds when only the Node host is terminated',async()=>{
  const root=await mkdtemp(join(tmpdir(),'codryn-r3-crash-')),entry=join(root,'host.mjs'),ownerFile=join(root,'owner.json'),pidsFile=join(root,'pids.json');
  const runner=fileURLToPath(new URL('../src/process/r2-command-runner.ts',import.meta.url)),workerPath=fileURLToPath(new URL('../src/process/r2-command-worker.ps1',import.meta.url)),jobPath=fileURLToPath(new URL('../src/process/r2-command-job.cs',import.meta.url));
  const command=`const child=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});require('node:fs').writeFileSync(${JSON.stringify(pidsFile)},JSON.stringify([process.pid,child.pid]));setInterval(()=>{},1000);`;
  const source=`import { R2CommandRunner } from ${JSON.stringify(runner)};import {open} from 'node:fs/promises';const runner=new R2CommandRunner(${JSON.stringify(root)},{workerPath:${JSON.stringify(workerPath)},jobPath:${JSON.stringify(jobPath)},onOwned:async owner=>{const file=await open(${JSON.stringify(ownerFile)},'w');await file.writeFile(JSON.stringify(owner));await file.sync();await file.close();}});await runner.run(${JSON.stringify({executable:process.execPath,args:['-e',command],cwd:root,timeoutMs:30000,maxOutputBytes:65536})},new AbortController().signal);`;
  let host:ReturnType<typeof spawn>|undefined;
  const alive=(pid:number)=>{try{process.kill(pid,0);return true;}catch{return false;}};
  try {
    await build({stdin:{contents:source,resolveDir:process.cwd(),sourcefile:'r3-host.ts'},bundle:true,platform:'node',format:'esm',outfile:entry});
    host=spawn(process.execPath,[entry],{cwd:root,windowsHide:true,stdio:'ignore'});
    let pids:number[]=[];const ready=Date.now()+10000;while(Date.now()<ready){try{pids=JSON.parse(await readFile(pidsFile,'utf8')) as number[];break;}catch{await new Promise(resolve=>setTimeout(resolve,25));}}
    expect(pids).toHaveLength(2);const owner=JSON.parse(await readFile(ownerFile,'utf8')) as {worker:{pid:number};target:{pid:number}};expect(owner.target.pid).toBe(pids[0]);
    const start=Date.now();host.kill();const all=[owner.worker.pid,...pids];while(all.some(alive)&&Date.now()-start<2000)await new Promise(resolve=>setTimeout(resolve,10));expect(all.filter(alive)).toEqual([]);expect(Date.now()-start).toBeLessThan(2000);
  }finally{host?.kill();await rm(root,{recursive:true,force:true});}
},20000);
