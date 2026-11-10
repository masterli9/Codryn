interface StreamBatcherOptions {flushBytes:4096;flushMs:50;write:(sequence:number,text:string)=>Promise<void>;onError?:(error:unknown)=>void}
export class StreamBatcher {
  private buffer='';private sequence=0;private closed=false;private failure:unknown;private timer:ReturnType<typeof setTimeout>|undefined;private tail:Promise<void>=Promise.resolve();
  constructor(private readonly options:StreamBatcherOptions){}
  private queued(effect:()=>Promise<void>):Promise<void>{const promise=this.tail.then(async()=>{if(this.failure)throw this.failure;await effect();});this.tail=promise.catch(error=>{this.failure=error;this.options.onError?.(error);});return promise;}
  private take():string{let bytes=0,characters=0;for(const point of this.buffer){const size=new TextEncoder().encode(point).length;if(bytes+size>this.options.flushBytes)break;bytes+=size;characters+=point.length;}const text=this.buffer.slice(0,characters);this.buffer=this.buffer.slice(characters);return text;}
  async push(text:string):Promise<void>{if(this.closed)throw new Error('R3_STALE_VIEW');await this.queued(async()=>{this.buffer+=text;while(new TextEncoder().encode(this.buffer).length>=this.options.flushBytes){const batch=this.take();await this.options.write(this.sequence+1,batch);this.sequence++;}if(this.buffer&&!this.timer)this.timer=setTimeout(()=>{this.timer=undefined;void this.flush().catch(()=>undefined);},this.options.flushMs);});}
  async flush():Promise<void>{if(this.timer){clearTimeout(this.timer);this.timer=undefined;}await this.queued(async()=>{while(this.buffer){const batch=this.take();await this.options.write(this.sequence+1,batch);this.sequence++;}});}
  async close(state:'complete'|'interrupted'):Promise<void>{void state;this.closed=true;await this.flush();}
}
