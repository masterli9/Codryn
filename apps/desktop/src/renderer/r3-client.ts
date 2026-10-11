import { r3IpcRequestSchema,r3ResponseSchemas } from '@codryn/shared';
import type { R3Operation,R3IpcRequest,R3ResponseFor,R3Update } from '@codryn/shared';
export interface R3Bridge {invoke<O extends R3Operation>(input:Extract<R3IpcRequest,{operation:O}>):Promise<R3ResponseFor<O>>;onUpdate(listener:(value:R3Update)=>void):()=>void}
type Input<O extends R3Operation>=Omit<Extract<R3IpcRequest,{operation:O}>,'operation'|'requestId'>&{requestId?:string};
type Value<O extends R3Operation>=Extract<R3ResponseFor<O>,{ok:true}>['value'];
export class R3Client {
  constructor(private readonly bridge:R3Bridge){}
  async call<O extends R3Operation>(operation:O,input:Input<O>):Promise<Value<O>>{
    const request=r3IpcRequestSchema.parse({...input,operation,requestId:input.requestId??crypto.randomUUID()});
    const response=r3ResponseSchemas[operation].parse(await this.bridge.invoke(request as Extract<R3IpcRequest,{operation:O}>));
    if(!response.ok)throw new Error(`${response.error.code}: ${response.error.message}`);return response.value as Value<O>;
  }
  attach(chatId:string){return this.call('stream.attach',{chatId,afterCursor:0});}
  detach(subscriptionId:string){return this.call('stream.detach',{subscriptionId});}
  snapshot(chatId:string){return this.call('chat.snapshot',{chatId});}
  onUpdate(listener:(value:R3Update)=>void){return this.bridge.onUpdate(listener);}
}
