import { expect,it } from 'vitest';
import { ProviderSettingsService } from '../src/secrets/provider-settings-service.js';
import { InMemoryProviderAccessGate } from '../src/secrets/provider-access-gate.js';
import { r3ModelDescriptor } from '../src/desktop/model-catalog.js';
import type { ProviderSettingsStore,SecretStore } from '../src/secrets/ports.js';
import type { R3ProviderSettings } from '@codryn/shared';
it('keeps save separate from test and consent, rejects mutation while a run holds its lease',async()=>{
  let settings:R3ProviderSettings={mode:'demo',modelId:'r3-demo-reference',model:r3ModelDescriptor('demo'),maxSteps:16,keyState:'missing',keyVersion:0,testedAt:null,testResult:'not_tested',dataPolicyVersion:'1',consentVersion:null,dataPolicy:{version:'1',requiresConfirmation:true,notice:'Project transmission',sourceUrls:[]}};
  let secret:string|null=null,version=0;
  const secrets:SecretStore & {version():Promise<number>}={state:async()=>secret===null?'missing':'stored',read:async()=>secret??'',save:async(_p,key)=>{secret=key;version++;},remove:async()=>{secret=null;version++;},version:async()=>version};
  const store:ProviderSettingsStore={get:async()=>settings,select:async(mode,maxSteps)=>{settings={...settings,mode,maxSteps,model:r3ModelDescriptor(mode),modelId:r3ModelDescriptor(mode).modelId};},recordKeyVersion:async(keyVersion)=>{settings={...settings,keyVersion,testedAt:null,testResult:'not_tested'};},recordTest:async(_v,result,at)=>{settings={...settings,testResult:result,testedAt:at};},recordConsent:async(consentVersion)=>{settings={...settings,consentVersion};}};
  const access=new InMemoryProviderAccessGate(),service=new ProviderSettingsService({secrets,settings:store,access,assertIdle:async()=>undefined,clock:{now:()=> '2026-10-11T10:00:00Z'}});
  await service.saveKey('synthetic');expect(await service.get()).toMatchObject({keyState:'stored',keyVersion:1,testResult:'not_tested',consentVersion:null});expect(JSON.stringify(await service.get())).not.toContain('synthetic');
  const release=await access.acquireRunLease();await expect(service.removeKey()).rejects.toThrow('R3_PROJECT_BUSY');expect(secret).toBe('synthetic');release();await service.removeKey();expect((await service.get()).keyState).toBe('missing');
  await expect(service.confirmDataPolicy('old')).rejects.toThrow('R3_CONSENT_REQUIRED');await service.confirmDataPolicy('1');expect((await service.get()).consentVersion).toBe('1');
});
