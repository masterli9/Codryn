import type { R3Snapshot,R3Update } from '@codryn/shared';
interface Client {attach(id:string):Promise<{subscriptionId:string;snapshot:R3Snapshot}>;detach(id:string):unknown;snapshot(id:string):Promise<R3Snapshot>;onUpdate(listener:(value:R3Update)=>void):()=>void}
interface State {snapshot:R3Snapshot|null;selectedChatId:string|null;connection:'loading'|'connected'|'failed';error:string|null}
export class DesktopStore {
  private state:State={snapshot:null,selectedChatId:null,connection:'loading',error:null};
  private readonly listeners=new Set<()=>void>();
  private epoch=0;private subscription:string|undefined;private disposed=false;private loading=false;private dirty=false;private confirmedCursor=0;
  private early:R3Update[]=[];
  private readonly unsubscribe:()=>void;
  constructor(private readonly client:Client){this.unsubscribe=client.onUpdate(value=>this.update(value));}
  get=()=>this.state;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return ()=>this.listeners.delete(listener);};
  private publish(value:Partial<State>){this.state={...this.state,...value};for(const listener of this.listeners)listener();}
  private detach(id:string){void Promise.resolve(this.client.detach(id)).catch(()=>undefined);}
  async select(chatId:string):Promise<void>{
    if(this.disposed)return;const epoch=++this.epoch;if(this.subscription)this.detach(this.subscription);this.subscription=undefined;this.early=[];this.confirmedCursor=0;this.publish({selectedChatId:chatId,snapshot:null,connection:'loading',error:null});
    try{const attached=await this.client.attach(chatId);if(this.disposed||epoch!==this.epoch){this.detach(attached.subscriptionId);return;}this.subscription=attached.subscriptionId;this.confirmedCursor=attached.snapshot.cursor;this.publish({snapshot:attached.snapshot,connection:'connected'});const early=this.early;this.early=[];for(const update of early)this.update(update);}
    catch{if(epoch===this.epoch&&!this.disposed)this.publish({connection:'failed',error:'Spojení s pracovní plochou se nepodařilo obnovit. Zkuste načíst chat znovu.'});}
  }
  private update(value:R3Update){
    if(this.disposed||value.chatId!==this.state.selectedChatId)return;
    if(!this.subscription){if(this.early.length<256)this.early.push(value);else this.early=[{kind:'resync_required',chatId:value.chatId,cursor:value.cursor}];return;}
    if(value.kind==='resync_required'||value.cursor>this.confirmedCursor+1){void this.select(value.chatId);return;}
    if(value.cursor<=this.confirmedCursor)return;this.confirmedCursor=value.cursor;void this.refresh();
  }
  async refresh():Promise<void>{
    const id=this.state.selectedChatId;if(!id||this.disposed)return;if(this.loading){this.dirty=true;return;}
    const epoch=this.epoch;this.loading=true;
    try{const snapshot=await this.client.snapshot(id);if(epoch===this.epoch&&!this.disposed){this.confirmedCursor=Math.max(this.confirmedCursor,snapshot.cursor);this.publish({snapshot,connection:'connected',error:null});}}
    catch{if(epoch===this.epoch&&!this.disposed)this.publish({connection:'failed',error:'Aktuální stav není dostupný. Poslední zobrazená data mohou být starší.'});}
    finally{this.loading=false;if(this.dirty){this.dirty=false;void this.refresh();}}
  }
  dispose(){this.disposed=true;++this.epoch;this.unsubscribe();if(this.subscription)this.detach(this.subscription);this.listeners.clear();}
}
