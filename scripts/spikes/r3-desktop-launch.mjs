import { _electron } from 'playwright';
import { mkdir,mkdtemp } from 'node:fs/promises';
import { resolve,join } from 'node:path';
const root=resolve('.r3-artifacts');await mkdir(root,{recursive:true});const profile=await mkdtemp(join(root,'launch-proof-'));
const env=Object.fromEntries(Object.entries(process.env).filter(([key,value])=>value!==undefined&&key!=='ELECTRON_RUN_AS_NODE'));
const app=await _electron.launch({executablePath:resolve('apps/desktop/out/Codryn-win32-x64/Codryn.exe'),args:[`--r3-test-profile=${profile}`],cwd:resolve('.'),env,bypassCSP:false,timeout:15000});
try{const window=await app.firstWindow();await window.getByRole('button',{name:'Otevřít projekt',exact:true}).waitFor();await window.screenshot({path:join(profile,'first-window.png')});console.log(JSON.stringify({passed:true,title:await window.title(),runtime:await app.evaluate(()=>process.versions.electron)}));}finally{await app.close();}
