import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { win32 as path } from 'node:path';
import { promisify } from 'node:util';
const exec=promisify(execFile);
function inside(root:string,candidate:string):boolean {const relative=path.relative(root.toLowerCase(),candidate.toLowerCase());return relative===''||(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..\\'));}
export function trustedNodePath(value:string,projectRoot?:string):string {return value.split(';').filter(entry=>path.isAbsolute(entry)&&(!projectRoot||!inside(projectRoot,entry))).join(';');}
export async function resolveNodeRuntime(signal:AbortSignal,projectRoot?:string):Promise<{available:boolean;executable:string|null;version:string|null;reason:string|null}> {
  const absent={available:false,executable:null,version:null,reason:'Referenční kontrola vyžaduje systémový Node 24.19.0.'};
  if(process.platform!=='win32')return absent;
  const system=path.join(process.env.SystemRoot??'C:\\Windows','System32');
  try {
    const lookup=await exec(path.join(system,'where.exe'),['node.exe'],{cwd:system,windowsHide:true,timeout:5000,signal,env:{SystemRoot:process.env.SystemRoot,PATH:trustedNodePath(process.env.PATH??process.env.Path??'',projectRoot)}});
    for(const candidate of lookup.stdout.trim().split(/\r?\n/)) {
      if(!path.isAbsolute(candidate)||(projectRoot&&inside(projectRoot,candidate)))continue;
      const canonical=await realpath(candidate);if(projectRoot&&inside(projectRoot,canonical))continue;
      const info=await exec(canonical,['--version'],{cwd:system,windowsHide:true,timeout:5000,signal,env:{SystemRoot:process.env.SystemRoot}});
      if(info.stdout.trim()==='v24.19.0')return {available:true,executable:canonical,version:'24.19.0',reason:null};
    }
  }catch{ /* Missing or unsupported runtime does not disable history or read-only chat. */ }
  return absent;
}
