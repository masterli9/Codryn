import { r3ModeSchema } from '@codryn/shared';
import type { R3Mode,R3ProviderSettings } from '@codryn/shared';
import type { Clock } from '../diagnostics/ports.js';
import type { ProviderAccessGate,ProviderSettingsStore,SecretStore } from './ports.js';
export class ProviderSettingsService {
  constructor(private readonly dependencies:{secrets:SecretStore;settings:ProviderSettingsStore;access:ProviderAccessGate;assertIdle:()=>Promise<void>;clock:Clock;testConnection?:(secret:string,signal:AbortSignal)=>Promise<{passed:boolean;category:unknown;at:string}>}){}
  async get():Promise<R3ProviderSettings>{const settings=await this.dependencies.settings.get(),keyState=await this.dependencies.secrets.state('openai');const version=keyState==='stored'?await this.dependencies.secrets.version?.():undefined;const mismatch=version!==undefined&&version!==settings.keyVersion;return {...settings,keyState,...(mismatch?{keyVersion:version,testedAt:null,testResult:'not_tested' as const}:{})};}
  async saveKey(value:string):Promise<void>{if(!value.trim()||value.length>4096||value.includes('\0'))throw new Error('R3_INPUT_INVALID');await this.dependencies.access.withSettingsLease(async()=>{await this.dependencies.assertIdle();const settings=await this.dependencies.settings.get();await this.dependencies.secrets.save('openai',value.trim(),settings.keyVersion+1);const version=await this.dependencies.secrets.version?.()??settings.keyVersion+1;await this.dependencies.settings.recordKeyVersion(version);});}
  async removeKey():Promise<void>{await this.dependencies.access.withSettingsLease(async()=>{await this.dependencies.assertIdle();const settings=await this.dependencies.settings.get();await this.dependencies.secrets.remove('openai');await this.dependencies.settings.recordKeyVersion(settings.keyVersion+1);});}
  async select(mode:R3Mode,maxSteps:number):Promise<void>{if(!r3ModeSchema.safeParse(mode).success||!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>32)throw new Error('R3_INPUT_INVALID');await this.dependencies.access.withSettingsLease(async()=>{await this.dependencies.assertIdle();await this.dependencies.settings.select(mode,maxSteps);});}
  async confirmDataPolicy(version:string):Promise<void>{await this.dependencies.access.withSettingsLease(async()=>{const settings=await this.dependencies.settings.get();if(version!==settings.dataPolicy.version)throw new Error('R3_CONSENT_REQUIRED');await this.dependencies.settings.recordConsent(version);});}
  async testKey(signal:AbortSignal):Promise<R3ProviderSettings>{
    await this.dependencies.access.withSettingsLease(async()=>{
      await this.dependencies.assertIdle();if(!this.dependencies.testConnection)throw new Error('R3_SECRET_UNAVAILABLE');
      const before=await this.get();if(before.keyState!=='stored')throw new Error('R3_SECRET_UNAVAILABLE');
      const secret=await this.dependencies.secrets.read('openai');const result=await this.dependencies.testConnection(secret,signal);
      const after=await this.get();if(after.keyVersion!==before.keyVersion||after.keyState!=='stored')throw new Error('R3_STALE_VIEW');
      await this.dependencies.settings.recordTest(before.keyVersion,result.passed?'passed':'failed',result.at);
    });return this.get();
  }
  async ensureProjectTransmissionAllowed():Promise<void>{const settings=await this.get();if(settings.keyState!=='stored')throw new Error('R3_SECRET_UNAVAILABLE');if(settings.dataPolicy.requiresConfirmation&&settings.consentVersion!==settings.dataPolicy.version)throw new Error('R3_CONSENT_REQUIRED');}
}
