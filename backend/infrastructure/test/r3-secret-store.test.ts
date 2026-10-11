import { mkdtemp,readFile,rm,writeFile,mkdir,symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect,it } from 'vitest';
import type { SecretProtector } from '@codryn/core';
import { EncryptedSecretStore } from '../src/secrets/encrypted-secret-store.js';
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
