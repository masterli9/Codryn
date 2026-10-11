import type { DatabaseSync } from 'node:sqlite';
import { r3ModelDescriptor } from '@codryn/core';
import type { ProviderSettingsStore } from '@codryn/core';
import { r3ModeSchema,r3ProviderSettingsSchema } from '@codryn/shared';
import type { IsoTimestamp,R3Mode,R3ProviderSettings } from '@codryn/shared';
import { integer } from './r3-sqlite-helpers.js';
export const r3DataPolicy={version:'openai-api-2026-10-11',requiresConfirmation:true,notice:'Reálný režim posílá zadání a vybraný projektový obsah OpenAI. Používá store:false; to nevylučuje zpracování v provozních záznamech pro ochranu služby. API data se standardně nepoužívají k trénování bez vašeho souhlasu. Požadavky jsou účtované poskytovatelem.',sourceUrls:['https://developers.openai.com/api/docs/guides/your-data']};
export class SqliteProviderSettingsStore implements ProviderSettingsStore {
  constructor(private readonly database:DatabaseSync){}
  async get():Promise<R3ProviderSettings>{const row=this.database.prepare('SELECT * FROM provider_settings WHERE id=1').get();if(!row)throw new Error('R3_INTERNAL');const mode=r3ModeSchema.parse(row.mode),model=r3ModelDescriptor(mode);return r3ProviderSettingsSchema.parse({mode,modelId:model.modelId,model,maxSteps:row.max_steps,keyState:'missing',keyVersion:row.key_version,testedAt:row.tested_at,testResult:row.test_result,dataPolicyVersion:r3DataPolicy.version,consentVersion:row.consent_version,dataPolicy:r3DataPolicy});}
  async select(mode:R3Mode,maxSteps:number):Promise<void>{r3ModeSchema.parse(mode);if(!Number.isSafeInteger(maxSteps)||maxSteps<1||maxSteps>32)throw new Error('R3_INPUT_INVALID');this.database.prepare('UPDATE provider_settings SET mode=?,max_steps=? WHERE id=1').run(mode,maxSteps);}
  async recordKeyVersion(version:number):Promise<void>{if(!Number.isSafeInteger(version)||version<0)throw new Error('R3_INPUT_INVALID');this.database.prepare("UPDATE provider_settings SET key_version=?,tested_at=NULL,test_result='not_tested' WHERE id=1").run(version);}
  async recordTest(version:number,result:'passed'|'failed',at:IsoTimestamp):Promise<void>{const row=this.database.prepare('SELECT key_version FROM provider_settings WHERE id=1').get();if(integer(row?.key_version)!==version)throw new Error('R3_STALE_VIEW');this.database.prepare('UPDATE provider_settings SET tested_at=?,test_result=? WHERE id=1 AND key_version=?').run(at,result,version);}
  async recordConsent(version:string):Promise<void>{if(version!==r3DataPolicy.version)throw new Error('R3_CONSENT_REQUIRED');this.database.prepare('UPDATE provider_settings SET consent_version=? WHERE id=1').run(version);}
}
