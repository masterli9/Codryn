import type { SecretProtector } from '@codryn/core';
interface SafeStorageFacade {
  isAsyncEncryptionAvailable():Promise<boolean>;
  encryptStringAsync(value:string):Promise<Buffer>;
  decryptStringAsync(bytes:Buffer):Promise<{result:string;shouldReEncrypt:boolean}>;
}
export class ElectronSecretProtector implements SecretProtector {
  constructor(private readonly storage:SafeStorageFacade){}
  async available():Promise<boolean>{try{return await this.storage.isAsyncEncryptionAvailable();}catch{return false;}}
  async encrypt(value:string):Promise<Uint8Array>{try{if(!await this.available())throw new Error('unavailable');return await this.storage.encryptStringAsync(value);}catch{throw new Error('R3_SECRET_UNAVAILABLE');}}
  async decrypt(bytes:Uint8Array):Promise<{value:string;shouldReEncrypt:boolean}>{try{if(!await this.available())throw new Error('unavailable');const result=await this.storage.decryptStringAsync(Buffer.from(bytes));if(typeof result.result!=='string'||typeof result.shouldReEncrypt!=='boolean')throw new Error('invalid');return {value:result.result,shouldReEncrypt:result.shouldReEncrypt};}catch{throw new Error('R3_SECRET_UNAVAILABLE');}}
}
