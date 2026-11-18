type Mode = 'shared' | 'exclusive';
interface Waiter {
  mode: Mode;
  signal: AbortSignal;
  grant: () => void;
  reject: (error: unknown) => void;
  abort: () => void;
}
interface State { shared: number; exclusive: boolean; queue: Waiter[] }

/** FIFO admission. An exclusive waiter stops newer shared admissions. */
export class ResourceBarrier {
  private readonly states = new Map<string, State>();
  shared<T>(key: string, signal: AbortSignal, action: () => Promise<T>): Promise<T> {
    return this.run(key,'shared',signal,action);
  }
  exclusive<T>(key: string, signal: AbortSignal, action: () => Promise<T>): Promise<T> {
    return this.run(key,'exclusive',signal,action);
  }
  private async run<T>(key: string, mode: Mode, signal: AbortSignal, action: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    let state = this.states.get(key);
    if (!state) { state={shared:0,exclusive:false,queue:[]};this.states.set(key,state); }
    if (state.queue.length >= 128) throw new Error('R3_PROJECT_BUSY');
    const current = state;
    await new Promise<void>((grant,reject)=>{
      const waiter: Waiter = {mode,signal,grant,reject,abort:()=>undefined};
      waiter.abort=()=>{
        const index=current.queue.indexOf(waiter);
        if(index<0)return;
        current.queue.splice(index,1);reject(signal.reason);this.drain(key,current);
      };
      signal.addEventListener('abort',waiter.abort,{once:true});
      current.queue.push(waiter);this.drain(key,current);
    });
    try { signal.throwIfAborted();return await action(); }
    finally {
      if(mode==='exclusive')current.exclusive=false;else current.shared--;
      this.drain(key,current);
    }
  }
  private drain(key: string, state: State): void {
    if(state.exclusive)return;
    const first=state.queue[0];
    if(!first){if(state.shared===0)this.states.delete(key);return;}
    if(first.mode==='exclusive'&&state.shared>0)return;
    while(state.queue.length&&state.shared<8){
      const waiter=state.queue[0];
      if(!waiter||((waiter.mode==='exclusive')&&state.shared>0))return;
      state.queue.shift();waiter.signal.removeEventListener('abort',waiter.abort);
      if(waiter.mode==='exclusive')state.exclusive=true;else state.shared++;
      waiter.grant();
      if(state.exclusive)return;
    }
  }
}
