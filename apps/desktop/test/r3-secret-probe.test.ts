import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { expect,it } from 'vitest';
import { ElectronSecretProtector } from '../src/secrets/electron-secret-protector.js';
const exec=promisify(execFile);
it('maps the asynchronous decrypt object and preserves reencryption advice',async()=>{
  const protector=new ElectronSecretProtector({isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async()=>Buffer.from([1,2]),decryptStringAsync:async()=>({result:'synthetic',shouldReEncrypt:true})});
  expect(await protector.decrypt(new Uint8Array([1,2]))).toEqual({value:'synthetic',shouldReEncrypt:true});
  const unavailable=new ElectronSecretProtector({isAsyncEncryptionAvailable:async()=>false,encryptStringAsync:async()=>{throw new Error('unavailable');},decryptStringAsync:async()=>{throw new Error('unavailable');}});
  await expect(unavailable.encrypt('synthetic')).rejects.toThrow('R3_SECRET_UNAVAILABLE');
});
it.runIf(process.platform==='win32')('proves protected persistence across two actual Electron processes without plaintext fallback',async()=>{
  const result=await exec(process.execPath,[resolve('scripts/spikes/r3-secret-probe.mjs')],{cwd:resolve('.'),timeout:30000,windowsHide:true,maxBuffer:65536});
  const report:unknown=JSON.parse(result.stdout.trim());
  expect(report).toMatchObject({schemaVersion:1,platform:'win32',encryption:true,restartDecrypt:true,replacePreserved:true,deniedPlaintextFallback:true,passed:true});
});
