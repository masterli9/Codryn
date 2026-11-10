import { chmod,mkdtemp,open,readFile,readdir,rm,writeFile,mkdir,symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect,it,vi } from 'vitest';
import { InMemoryProviderAccessGate,ProviderSettingsService } from '@codryn/core';
import type { SecretProtector } from '@codryn/core';
import { EncryptedSecretStore } from '../src/secrets/encrypted-secret-store.js';
import { openR0Database } from '../src/persistence/open-database.js';
import { runMigrations } from '../src/persistence/run-migrations.js';
import { SqliteProviderSettingsStore } from '../src/persistence/sqlite-provider-settings-store.js';
// Port double proves file lifecycle only. Windows DPAPI is tested separately by the Electron probe.
const protector:SecretProtector={available:async()=>true,encrypt:async value=>Uint8Array.from(Buffer.from(value),byte=>byte^129),decrypt:async bytes=>({value:Buffer.from(bytes.map(byte=>byte^129)).toString(),shouldReEncrypt:false})};
it('persists only ciphertext, increments logical version, preserves a key on encryption failure and removes it across reopen',async()=>{
  const root=await mkdtemp(join(tmpdir(),'codryn-r3-secret-'));
  try{
    const store=new EncryptedSecretStore(root,protector);await store.save('openai','synthetic-old');expect(await new EncryptedSecretStore(root,protector).read('openai')).toBe('synthetic-old');expect(await store.version()).toBe(1);
    const unavailable=new EncryptedSecretStore(root,{...protector,encrypt:async()=>{throw new Error('fail');}});await expect(unavailable.save('openai','new')).rejects.toThrow('R3_SECRET_UNAVAILABLE');expect(await store.read('openai')).toBe('synthetic-old');
    await store.save('openai','synthetic-new');expect(await store.version()).toBe(2);expect((await readFile(join(root,'secrets','openai.json'))).toString()).not.toContain('synthetic');
    await store.remove('openai');expect(await new EncryptedSecretStore(root,protector).state('openai')).toBe('missing');
  }finally{await rm(root,{recursive:true,force:true});}
});
it('fails closed on corrupted envelopes, oversized values and unavailable protection',async()=>{
  const root=await mkdtemp(join(tmpdir(),'codryn-r3-secret-'));
  try{const store=new EncryptedSecretStore(root,protector);await store.save('openai','synthetic');await writeFile(join(root,'secrets','openai.json'),JSON.stringify({version:1,provider:'openai',keyVersion:1,ciphertext:'not base64!'}));expect(await store.state('openai')).toBe('unavailable');await expect(store.read('openai')).rejects.toThrow('R3_SECRET_UNAVAILABLE');await expect(store.save('openai','x'.repeat(4097))).rejects.toThrow('R3_INPUT_INVALID');expect(await new EncryptedSecretStore(root,{...protector,available:async()=>false}).state('openai')).toBe('unavailable');}finally{await rm(root,{recursive:true,force:true});}
});
it('rejects a linked secret directory without touching its target',async()=>{
  const root=await mkdtemp(join(tmpdir(),'codryn-r3-secret-')),outside=await mkdtemp(join(tmpdir(),'codryn-r3-outside-'));
  try{await mkdir(join(outside,'target'));await symlink(join(outside,'target'),join(root,'secrets'),process.platform==='win32'?'junction':'dir');await expect(new EncryptedSecretStore(root,protector).save('openai','synthetic')).rejects.toThrow('R3_SECRET_UNAVAILABLE');await expect(readFile(join(outside,'target','openai.json'))).rejects.toThrow();}finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
it.each([
  {name:'future envelope',patch:{version:2}},
  {name:'wrong provider',patch:{provider:'other'}},
  {name:'zero logical version',patch:{keyVersion:0}},
  {name:'fractional logical version',patch:{keyVersion:1.5}},
  {name:'unsafe logical version',patch:{keyVersion:Number.MAX_SAFE_INTEGER+1}},
  {name:'unknown field',patch:{plaintext:'synthetic-never-decrypt'}},
  {name:'empty ciphertext',patch:{ciphertext:''}}
])('fails closed on $name without accepting or replacing the damaged envelope',async({patch})=>{
  const root=await mkdtemp(join(tmpdir(),'codryn-r3-envelope-'));
  try{await mkdir(join(root,'secrets'));const file=join(root,'secrets','openai.json'),raw=JSON.stringify({version:1,provider:'openai',keyVersion:7,ciphertext:'eA==',...patch});await writeFile(file,raw);const store=new EncryptedSecretStore(root,protector);expect(await store.state('openai')).toBe('unavailable');await expect(store.read('openai')).rejects.toThrow('R3_SECRET_UNAVAILABLE');await expect(store.save('openai','replacement')).rejects.toThrow('R3_SECRET_UNAVAILABLE');expect(await readFile(file,'utf8')).toBe(raw);}finally{await rm(root,{recursive:true,force:true});}
});
it.runIf(process.platform==='win32')('preserves the previous ciphertext and removes its temporary file when atomic replacement fails',async()=>{
  const root=await mkdtemp(join(tmpdir(),'codryn-r3-replace-')),file=join(root,'secrets','openai.json');
  try{const store=new EncryptedSecretStore(root,protector);await store.save('openai','previous-marker');const before=await readFile(file);await chmod(file,0o400);await expect(store.save('openai','replacement-marker')).rejects.toThrow('R3_SECRET_UNAVAILABLE');expect(await readFile(file)).toEqual(before);expect(await store.read('openai')).toBe('previous-marker');expect(await store.version()).toBe(1);expect(await readdir(join(root,'secrets'))).toEqual(['openai.json']);}finally{await chmod(file,0o600).catch(()=>undefined);await rm(root,{recursive:true,force:true});}
});
it('preserves the previous ciphertext and cleans the new temporary file when fsync fails',async()=>{
  const root=await mkdtemp(join(tmpdir(),'codryn-r3-fsync-')),directory=join(root,'secrets'),file=join(directory,'openai.json');let restore:()=>void=()=>undefined,injected=false;
  try{
    const store=new EncryptedSecretStore(root,protector);await store.save('openai','previous-sync-marker');const before=await readFile(file);
    // Patch the actual FileHandle prototype only for this awaited save; no production seam is added.
    const probe=await open(file,'r');const prototype=Object.getPrototypeOf(probe) as {sync():Promise<void>};await probe.close();
    const sync=vi.spyOn(prototype,'sync').mockImplementationOnce(async()=>{
      const temporary=(await readdir(directory)).filter(name=>name.startsWith('.openai-')&&name.endsWith('.tmp'));
      expect(temporary).toHaveLength(1);const bytes=await readFile(join(directory,temporary[0]??''));
      expect(JSON.parse(bytes.toString()) as unknown).toMatchObject({version:1,provider:'openai',keyVersion:2});expect(bytes.toString()).not.toContain('replacement-sync-marker');
      injected=true;throw new Error('synthetic fsync failure');
    });restore=()=>sync.mockRestore();
    await expect(store.save('openai','replacement-sync-marker')).rejects.toThrow('R3_SECRET_UNAVAILABLE');
    expect(injected,'fsync injection must run after the new ciphertext was written').toBe(true);expect(sync).toHaveBeenCalledTimes(1);restore();
    expect(await readFile(file)).toEqual(before);expect(await new EncryptedSecretStore(root,protector).read('openai')).toBe('previous-sync-marker');expect(await store.version()).toBe(1);expect(await readdir(directory)).toEqual(['openai.json']);
  }finally{restore();await rm(root,{recursive:true,force:true});}
});
it('serializes a pending save with reads, a following save and removal without torn envelopes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'codryn-r3-race-'));let enter:()=>void=()=>undefined,release:()=>void=()=>undefined;
  const entered=new Promise<void>(resolve=>{enter=resolve;}),barrier=new Promise<void>(resolve=>{release=resolve;});
  const blocked:SecretProtector={...protector,encrypt:async value=>{if(value==='second-marker'){enter();await barrier;}return protector.encrypt(value);}};
  try{const store=new EncryptedSecretStore(root,blocked);await store.save('openai','first-marker');const second=store.save('openai','second-marker');await entered;const read=store.read('openai'),third=store.save('openai','third-marker'),version=store.version(),remove=store.remove('openai'),missing=store.state('openai');expect(await new EncryptedSecretStore(root,protector).read('openai')).toBe('first-marker');release();await second;expect(await read).toBe('second-marker');await third;expect(await version).toBe(3);await remove;expect(await missing).toBe('missing');expect(await new EncryptedSecretStore(root,protector).state('openai')).toBe('missing');}finally{release();await rm(root,{recursive:true,force:true});}
});
it('rejects a junction user-data root for read, save and removal',async()=>{
  const root=await mkdtemp(join(tmpdir(),'codryn-r3-alias-')),target=await mkdtemp(join(tmpdir(),'codryn-r3-target-'));
  try{
    const store=new EncryptedSecretStore(target,protector);await store.save('openai','protected-marker');const file=join(target,'secrets','openai.json'),before=await readFile(file);
    await symlink(target,join(root,'alias'),process.platform==='win32'?'junction':'dir');const alias=new EncryptedSecretStore(join(root,'alias'),protector);expect(await alias.state('openai')).toBe('unavailable');await expect(alias.read('openai')).rejects.toThrow('R3_SECRET_UNAVAILABLE');await expect(alias.save('openai','replacement')).rejects.toThrow('R3_SECRET_UNAVAILABLE');await expect(alias.remove('openai')).rejects.toThrow('R3_SECRET_UNAVAILABLE');
    expect(await readFile(file)).toEqual(before);
  }finally{await rm(root,{recursive:true,force:true});await rm(target,{recursive:true,force:true});}
});
it('reencrypts without changing the logical version and preserves the old envelope if reencrypt fails',async()=>{
  const root=await mkdtemp(join(tmpdir(),'codryn-r3-reencrypt-'));
  try{
    const store=new EncryptedSecretStore(root,protector);await store.save('openai','synthetic-reencrypt',8);const file=join(root,'secrets','openai.json'),before=await readFile(file);
    const migrate:SecretProtector={...protector,decrypt:async bytes=>({...await protector.decrypt(bytes),shouldReEncrypt:true})};
    await expect(new EncryptedSecretStore(root,{...migrate,encrypt:async()=>{throw new Error('synthetic-reencrypt');}}).read('openai')).rejects.toThrow('R3_SECRET_UNAVAILABLE');expect(await readFile(file)).toEqual(before);
    expect(await new EncryptedSecretStore(root,migrate).read('openai')).toBe('synthetic-reencrypt');expect(await store.version()).toBe(8);
  }finally{await rm(root,{recursive:true,force:true});}
});
it('holds a settings test lease against replacement, removal and run access and releases it on failure',async()=>{
  const root=await mkdtemp(join(tmpdir(),'codryn-r3-settings-race-')),database=openR0Database(join(root,'codryn.sqlite'));runMigrations(database,'2026-10-31T10:00:00Z');
  let enter:()=>void=()=>undefined,release:()=>void=()=>undefined;const entered=new Promise<void>(resolve=>{enter=resolve;}),barrier=new Promise<void>(resolve=>{release=resolve;});
  try{
    const secrets=new EncryptedSecretStore(root,protector),settings=new SqliteProviderSettingsStore(database),access=new InMemoryProviderAccessGate();
    const service=new ProviderSettingsService({secrets,settings,access,assertIdle:async()=>undefined,clock:{now:()=> '2026-10-31T10:00:00Z'},testConnection:async()=>{enter();await barrier;throw new Error('synthetic provider failure');}});
    await service.saveKey('synthetic-race');const testing=service.testKey(AbortSignal.timeout(10000));const failed=expect(testing).rejects.toThrow('synthetic provider failure');await entered;
    await expect(service.saveKey('replacement')).rejects.toThrow('R3_PROJECT_BUSY');await expect(service.removeKey()).rejects.toThrow('R3_PROJECT_BUSY');await expect(access.acquireRunLease()).rejects.toThrow('R3_PROJECT_BUSY');
    release();await failed;expect((await service.get()).testResult).toBe('not_tested');await service.removeKey();expect(await new EncryptedSecretStore(root,protector).state('openai')).toBe('missing');const end=await access.acquireRunLease();end();expect(access.idle()).toBe(true);
  }finally{release();database.close();await rm(root,{recursive:true,force:true});}
});
it.each(['test','save','remove'] as const)('recovers %s after ciphertext committed but settings metadata failed and the service reopened',async action=>{
  const root=await mkdtemp(join(tmpdir(),'codryn-r3-settings-reopen-')),database=openR0Database(join(root,'codryn.sqlite'));runMigrations(database,'2026-10-31T10:00:00Z');
  try{
    const secrets=new EncryptedSecretStore(root,protector),settings=new SqliteProviderSettingsStore(database),access=new InMemoryProviderAccessGate(),clock={now:()=> '2026-10-31T10:00:00Z'};
    const service=new ProviderSettingsService({secrets,settings,access,assertIdle:async()=>undefined,clock});await service.saveKey('old-marker');await settings.recordTest(1,'passed',clock.now());
    const failing=new ProviderSettingsService({secrets,settings:{get:()=>settings.get(),select:(...args)=>settings.select(...args),recordKeyVersion:async()=>{throw new Error('metadata unavailable');},recordTest:(...args)=>settings.recordTest(...args),recordConsent:version=>settings.recordConsent(version)},access,assertIdle:async()=>undefined,clock});
    await expect(failing.saveKey('new-marker')).rejects.toThrow('metadata unavailable');
    const reopened=new ProviderSettingsService({secrets:new EncryptedSecretStore(root,protector),settings:new SqliteProviderSettingsStore(database),access:new InMemoryProviderAccessGate(),assertIdle:async()=>undefined,clock,testConnection:async secret=>({passed:secret==='new-marker',category:null,at:clock.now()})});
    expect(await reopened.get()).toMatchObject({keyVersion:2,testedAt:null,testResult:'not_tested'});
    if(action==='test'){
      expect(await reopened.testKey(AbortSignal.timeout(10000))).toMatchObject({keyVersion:2,testResult:'passed'});
      expect(await settings.get()).toMatchObject({keyVersion:2,testResult:'passed'});
    }else if(action==='save'){
      await reopened.saveKey('third-marker');expect(await reopened.get()).toMatchObject({keyVersion:3,keyState:'stored',testResult:'not_tested'});expect(await secrets.read('openai')).toBe('third-marker');
    }else{
      await reopened.removeKey();expect(await reopened.get()).toMatchObject({keyVersion:3,keyState:'missing',testResult:'not_tested'});
      await reopened.saveKey('fourth-marker');expect(await reopened.get()).toMatchObject({keyVersion:4,keyState:'stored',testResult:'not_tested'});
    }
  }finally{database.close();await rm(root,{recursive:true,force:true});}
});
