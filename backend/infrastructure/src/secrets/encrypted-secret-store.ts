import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat,mkdir,open,readFile,realpath,rename,rm } from 'node:fs/promises';
import { join,relative,resolve } from 'node:path';
import { promisify } from 'node:util';
import type { SecretProtector,SecretStore } from '@codryn/core';
const exec=promisify(execFile);
class SecretFileFailure extends Error { constructor(phase:string){super(`R3_SECRET_UNAVAILABLE:${phase}`);} }
interface Envelope {version:1;provider:'openai';keyVersion:number;ciphertext:string}
function missing(error:unknown):boolean{return error instanceof Error&&Reflect.get(error,'code')==='ENOENT';}
function envelope(raw:unknown):Envelope {
  if(typeof raw!=='object'||raw===null)throw new Error('R3_SECRET_UNAVAILABLE');const value=raw as Record<string,unknown>;
  if(Object.keys(value).sort().join(',')!=='ciphertext,keyVersion,provider,version'||value.version!==1||value.provider!=='openai'||typeof value.keyVersion!=='number'||!Number.isSafeInteger(value.keyVersion)||value.keyVersion<1||typeof value.ciphertext!=='string'||value.ciphertext.length===0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.ciphertext))throw new Error('R3_SECRET_UNAVAILABLE');
  return {version:1,provider:'openai',keyVersion:value.keyVersion,ciphertext:value.ciphertext};
}
async function privateDirectory(path:string):Promise<void>{
  if(process.platform!=='win32')return;
  const system=join(process.env.SystemRoot??'C:\\Windows','System32');
  const identity=await exec(join(system,'whoami.exe'),['/user','/fo','csv','/nh'],{cwd:system,timeout:5000,windowsHide:true});const sid=identity.stdout.match(/S-1-\d+(?:-\d+)+/)?.[0];if(!sid)throw new Error('R3_SECRET_UNAVAILABLE');
  try { await exec(join(system,'icacls.exe'),[path,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`],{cwd:system,timeout:5000,windowsHide:true}); } catch { throw new SecretFileFailure('ACL_APPLY'); }
  // Verify effective directory ACL (access control list) against the current account, not just icacls exit 0.
  const script="$ErrorActionPreference='Stop'; $a=Get-Acl -LiteralPath $env:CODRYN_SECRET_ACL_PATH; $s=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; if($a.Owner -ne [System.Security.Principal.WindowsIdentity]::GetCurrent().Name -and $a.Owner -ne $s){exit 2}; foreach($r in $a.Access){if($r.AccessControlType -eq 'Allow' -and $r.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -ne $s){exit 3}}; if(-not $a.AreAccessRulesProtected){exit 4}";
  const environment=Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toLowerCase()!=='psmodulepath'));
  environment.PSModulePath=join(system,'WindowsPowerShell','v1.0','Modules');environment.CODRYN_SECRET_ACL_PATH=path;
  try { await exec(join(system,'WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{cwd:system,timeout:5000,windowsHide:true,env:environment}); } catch { throw new SecretFileFailure('ACL_VERIFY'); }
}
export class EncryptedSecretStore implements SecretStore {
  private tail:Promise<void>=Promise.resolve();
  constructor(private readonly userDataPath:string,private readonly protector:SecretProtector){}
  private serialize<T>(effect:()=>Promise<T>):Promise<T>{const promise=this.tail.then(effect);this.tail=promise.then(()=>undefined,()=>undefined);return promise;}
  private async location(create:boolean):Promise<{directory:string;file:string}>{
    const root=resolve(this.userDataPath);const rootStat=await lstat(root);if(rootStat.isSymbolicLink()||!rootStat.isDirectory())throw new Error('R3_SECRET_UNAVAILABLE');const canonical=await realpath(root),directory=join(canonical,'secrets');
    if(create)await mkdir(directory,{recursive:true,mode:0o700});
    try{const info=await lstat(directory);if(info.isSymbolicLink()||!info.isDirectory()||relative(canonical,await realpath(directory))!=='secrets')throw new Error('R3_SECRET_UNAVAILABLE');}catch(error){if(create||!missing(error))throw error;}
    const file=join(directory,'openai.json');try{if((await lstat(file)).isSymbolicLink())throw new Error('R3_SECRET_UNAVAILABLE');}catch(error){if(!missing(error))throw error;}
    return {directory,file};
  }
  private async load():Promise<Envelope|null>{const {file}=await this.location(false);try{const info=await lstat(file);if(!info.isFile()||info.size>32768)throw new Error('R3_SECRET_UNAVAILABLE');return envelope(JSON.parse(await readFile(file,'utf8')) as unknown);}catch(error){if(missing(error))return null;throw new Error('R3_SECRET_UNAVAILABLE');}}
  private async replace(value:Envelope):Promise<void>{
    const {directory,file}=await this.location(true);await privateDirectory(directory);const temporary=join(directory,`.openai-${randomUUID()}.tmp`);let handle:Awaited<ReturnType<typeof open>>|undefined;
    try{handle=await open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify(value));await handle.sync();await handle.close();handle=undefined;await this.location(false);await rename(temporary,file);}finally{await handle?.close();await rm(temporary,{force:true});}
  }
  async state(_provider:'openai'):Promise<'missing'|'stored'|'unavailable'>{void _provider;return this.serialize(async()=>{try{const value=await this.load();if(!value)return 'missing';if(!await this.protector.available())return 'unavailable';await this.protector.decrypt(Buffer.from(value.ciphertext,'base64'));return 'stored';}catch{return 'unavailable';}});}
  async version():Promise<number>{return this.serialize(async()=>(await this.load())?.keyVersion??0);}
  async read(_provider:'openai'):Promise<string>{void _provider;return this.serialize(async()=>{try{const value=await this.load();if(!value)throw new Error('missing');const decrypted=await this.protector.decrypt(Buffer.from(value.ciphertext,'base64'));if(decrypted.shouldReEncrypt)await this.replace({...value,ciphertext:Buffer.from(await this.protector.encrypt(decrypted.value)).toString('base64')});return decrypted.value;}catch{throw new Error('R3_SECRET_UNAVAILABLE');}});}
  async save(_provider:'openai',value:string,minimumVersion=1):Promise<void>{void _provider;if(!value.trim()||value.length>4096||value.includes('\0'))throw new Error('R3_INPUT_INVALID');return this.serialize(async()=>{try{if(!await this.protector.available())throw new Error('unavailable');const old=await this.load();const ciphertext=Buffer.from(await this.protector.encrypt(value)).toString('base64');await this.replace({version:1,provider:'openai',keyVersion:Math.max((old?.keyVersion??0)+1,minimumVersion),ciphertext});}catch(error){if(error instanceof SecretFileFailure)throw error;throw new Error('R3_SECRET_UNAVAILABLE');}});}
  async remove(_provider:'openai'):Promise<void>{void _provider;return this.serialize(async()=>{try{const {file}=await this.location(false);await rm(file,{force:true});}catch{throw new Error('R3_SECRET_UNAVAILABLE');}});}
}
