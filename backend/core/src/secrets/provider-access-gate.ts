import type { ProviderAccessGate } from './ports.js';
export class InMemoryProviderAccessGate implements ProviderAccessGate {
  private runs=0;
  private settings=false;
  private closing=false;
  async acquireRunLease():Promise<()=>void> {
    if(this.settings||this.closing)throw new Error('R3_PROJECT_BUSY');this.runs++;let released=false;
    return ()=>{if(!released){released=true;this.runs--;}};
  }
  async withSettingsLease<T>(effect:()=>Promise<T>):Promise<T> {
    if(this.settings||this.runs>0||this.closing)throw new Error('R3_PROJECT_BUSY');this.settings=true;
    try{return await effect();}finally{this.settings=false;}
  }
  beginShutdown():void{this.closing=true;}
  idle():boolean{return this.runs===0&&!this.settings;}
}
