import { RunR0Diagnostics } from '@codryn/core';
import { createR0Infrastructure,createR3Infrastructure,createDesktopRuntimeFactory,createR3Provider } from '@codryn/infrastructure';
import { safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import { ElectronSecretProtector } from './secrets/electron-secret-protector.js';
import { resolveNodeRuntime } from './runtime/node-runtime.js';
import { desktopTestProvider } from './testing/desktop-test-provider.js';
import type { DesktopTestScenario } from './testing/desktop-test-provider.js';

export interface ApplicationServices {
  readonly runR0Diagnostics: RunR0Diagnostics;
  close(): void;
}

export async function createDesktopApplicationServices(userDataPath:string,testScenario?:DesktopTestScenario){
  return createR3Infrastructure({userDataPath,secretProtector:new ElectronSecretProtector(safeStorage),runtimeFactory:resources=>async input=>{
    const runtime=await resolveNodeRuntime(input.signal,await resources.projects.root(input.projectId));
    return createDesktopRuntimeFactory({...resources,userDataPath,nodeExecutable:runtime.executable,...(testScenario?{providerFactory:desktopTestProvider(testScenario)}:{})})(input);
  },preflight:async(mode,root)=>{if(mode==='demo'){const runtime=await resolveNodeRuntime(AbortSignal.timeout(6000),root);if(!runtime.available)throw new Error('R3_RUNTIME_UNAVAILABLE');try{const provider=await createR3Provider({mode,projectRoot:root,nodeExecutable:runtime.executable,ids:{next:randomUUID},secrets:{state:async()=> 'missing',read:async()=>{throw new Error('R3_SECRET_UNAVAILABLE');},save:async()=>undefined,remove:async()=>undefined}});provider.dispose();}catch{throw new Error('R3_INPUT_INVALID');}}}});
}

export async function createApplicationServices(
  userDataPath: string,
  fixtureDirectory: string
): Promise<ApplicationServices> {
  const infrastructure = await createR0Infrastructure({ userDataPath, fixtureDirectory });
  return {
    runR0Diagnostics: new RunR0Diagnostics(infrastructure),
    close: () => infrastructure.close()
  };
}
