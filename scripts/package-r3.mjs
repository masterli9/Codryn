import { spawn } from 'node:child_process';
import { mkdir,writeFile } from 'node:fs/promises';
import { sourceHash,currentBuild } from './r3-build-identity.mjs';
const before=await sourceHash();const child=spawn(process.env.ComSpec??'cmd.exe',['/d','/s','/c','npm.cmd','run','package','--workspace','@codryn/desktop'],{cwd:process.cwd(),shell:false,windowsHide:true,stdio:'inherit'});const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});if(code!==0)throw new Error('R3_PACKAGE_FAILED');if(await sourceHash()!==before)throw new Error('R3_SOURCE_CHANGED_DURING_PACKAGE');await mkdir('.r3-artifacts',{recursive:true});await writeFile('.r3-artifacts/build.json',JSON.stringify(await currentBuild(),null,2)+'\n');
