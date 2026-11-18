import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { withNativeResourceLock } from './native-resource-lock.mjs';
test('holds the artifact lock across processes and releases after failure',async()=>{
  const root=await mkdtemp(join(tmpdir(),'codryn-artifact-lock-')),file=join(root,'resource.sqlite');
  const code=`import {withNativeResourceLock} from ${JSON.stringify(pathToFileURL(resolve('scripts/native-resource-lock.mjs')).href)};
    await withNativeResourceLock(process.argv[1],async()=>{console.log('entered');if(process.argv[2]==='hold')for await(const chunk of process.stdin)void chunk;});`;
  const first=spawn(process.execPath,['--input-type=module','-e',code,file,'hold'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let second;
  try{
    await once(first.stdout,'data');
    let entered=false;
    second=spawn(process.execPath,['--input-type=module','-e',code,file,'once'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    second.stdout.on('data',()=>{entered=true;});
    await new Promise(resolve=>setTimeout(resolve,150));
    assert.equal(entered,false);
    const firstExited=once(first,'exit'),secondExited=once(second,'exit');
    first.stdin.end();
    assert.equal((await firstExited)[0],0);assert.equal((await secondExited)[0],0);
    assert.equal(entered,true);
    await assert.rejects(withNativeResourceLock(file,async()=>{throw new Error('failure');}),/failure/u);
    assert.equal(await withNativeResourceLock(file,async()=>42),42);
  }finally{if(first.exitCode===null)first.kill();if(second?.exitCode===null)second.kill();await rm(root,{recursive:true,force:true});}
});
