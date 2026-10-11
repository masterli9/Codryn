import { _electron } from 'playwright';
import { mkdir,mkdtemp } from 'node:fs/promises';
import { resolve,join,relative,isAbsolute } from 'node:path';
export async function createR3Profile(label:string){const root=resolve('.r3-artifacts');await mkdir(root,{recursive:true});return mkdtemp(join(root,`${label}-`));}
export async function launchR3Desktop(options:{executable:string;profileRoot:string;projectRoot:string;scenario?:'stream'|'two-patches'|'interrupted-model'}){
  const root=resolve('.r3-artifacts'),profile=resolve(options.profileRoot),rel=relative(root,profile);if(!rel||rel==='..'||rel.startsWith('..')||isAbsolute(rel))throw new Error('R3_PROFILE_BOUNDARY');
  const env=Object.fromEntries(Object.entries(process.env).filter(([name,value])=>value!==undefined&&name!=='ELECTRON_RUN_AS_NODE')) as Record<string,string>;
  const app=await _electron.launch({executablePath:resolve(options.executable),args:[`--r3-test-profile=${profile}`,...(options.scenario?[`--r3-test-scenario=${options.scenario}`]:[])],cwd:resolve('.'),env,bypassCSP:false,timeout:15000});
  const window=await app.firstWindow();window.setDefaultTimeout(10000);await window.getByRole('button',{name:'Otevřít projekt',exact:true}).waitFor();
  await app.evaluate(({dialog},projectRoot)=>{dialog.showOpenDialog=()=>Promise.resolve({canceled:false,filePaths:[projectRoot]});dialog.showMessageBox=()=>Promise.resolve({response:1,checkboxChecked:false});},options.projectRoot);
  return {app,window,artifacts:profile,close:()=>app.close()};
}
