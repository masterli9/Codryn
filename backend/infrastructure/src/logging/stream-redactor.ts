type Stream='stdout'|'stderr'|'model';
interface State {buffer:string;discarding:boolean}
const credential=/(?:[A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE[_-]?KEY)[A-Z0-9_]*)\s*[:=]\s*[^\s"'`]*$/i;
const assignments=/(?:[A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE[_-]?KEY)[A-Z0-9_]*)\s*[:=]\s*[^\s"'`]+/gi;
export class StreamRedactor {
  private readonly states=new Map<Stream,State>();private readonly secrets:string[];private readonly keep:number;
  constructor(options:{secrets:readonly string[]}){this.secrets=options.secrets.filter(Boolean);this.keep=Math.max(128,...this.secrets.map(secret=>secret.length-1));}
  private state(stream:Stream):State{let state=this.states.get(stream);if(!state){state={buffer:'',discarding:false};this.states.set(stream,state);}return state;}
  private safe(value:string):string{let text=value;for(const secret of this.secrets)text=text.split(secret).join('[redacted]');return text.replace(assignments,'[redacted]');}
  push(stream:Stream,text:string):string{
    const state=this.state(stream);
    if(state.discarding){const boundary=text.search(/[\s"'`]/);if(boundary<0)return '';text=text.slice(boundary);state.discarding=false;}
    state.buffer+=text;
    // Replace complete known secrets before splitting the retained suffix, so no secret prefix escapes.
    for(const secret of this.secrets)state.buffer=state.buffer.split(secret).join('[redacted]');
    state.buffer=state.buffer.replace(/(?:[A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE[_-]?KEY)[A-Z0-9_]*)\s*[:=]\s*[^\s"'`]+(?=[\s"'`])/gi,'[redacted]');
    const pending=credential.exec(state.buffer);
    let split=Math.max(0,state.buffer.length-this.keep);
    if(pending){split=Math.min(split,pending.index);if(state.buffer.length-pending.index>4096){const output=this.safe(state.buffer.slice(0,pending.index))+'[redacted]';state.buffer='';state.discarding=true;return output;}}
    // Do not cut a surrogate pair.
    if(split>0&&/[\uD800-\uDBFF]/.test(state.buffer[split-1]??''))split--;
    const prefix=state.buffer.slice(0,split);state.buffer=state.buffer.slice(split);return this.safe(prefix);
  }
  finish(stream:Stream):string{const state=this.state(stream);const value=state.buffer;state.buffer='';state.discarding=false;return this.safe(value).replace(credential,'[redacted]');}
  dispose():void{this.states.clear();this.secrets.splice(0);}
}
