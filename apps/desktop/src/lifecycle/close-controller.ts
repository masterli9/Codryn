export class CloseController {
  private pending:Promise<'stay'|'closed'|'failed'>|undefined;
  private closed=false;
  constructor(private readonly dependencies:{confirm:()=>Promise<'stay'|'stop'>;shutdown:(signal:AbortSignal)=>Promise<{stopped:boolean}>;close:()=>void;finish:()=>void}){}
  requestClose():Promise<'stay'|'closed'|'failed'>{if(this.closed)return Promise.resolve('closed');if(this.pending)return this.pending;this.pending=this.execute().finally(()=>{this.pending=undefined;});return this.pending;}
  private async execute():Promise<'stay'|'closed'|'failed'>{
    try{if(await this.dependencies.confirm()==='stay')return 'stay';const signal=AbortSignal.timeout(10000),result=await this.dependencies.shutdown(signal);if(!result.stopped||signal.aborted)return 'failed';this.dependencies.close();this.closed=true;this.dependencies.finish();return 'closed';}catch{return 'failed';}
  }
}
