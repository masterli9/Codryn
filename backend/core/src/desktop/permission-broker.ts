interface Waiting {digest:string;resolve:(value:'allow_once'|'deny')=>void;answer:'allow_once'|'deny'|null;dispose:()=>void}
/** Passes the user's answer to the existing harness; never decides or claims a permission itself. */
export class DesktopPermissionBroker {
  private readonly waiting=new Map<string,Waiting>();
  wait(id:string,digest:string,signal:AbortSignal):Promise<'allow_once'|'deny'> {
    if(this.waiting.has(id))return Promise.reject(new Error('R3_REQUEST_MISMATCH'));
    return new Promise((resolve,reject)=>{
      const onAbort=()=>{this.waiting.delete(id);signal.removeEventListener('abort',onAbort);reject(new Error('R1_CANCELLED'));};
      this.waiting.set(id,{digest,resolve,answer:null,dispose:()=>signal.removeEventListener('abort',onAbort)});
      signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();
    });
  }
  answer(id:string,digest:string,decision:'allow_once'|'deny'):'accepted'|'duplicate'|'rejected' {
    const waiter=this.waiting.get(id);if(!waiter||waiter.digest!==digest)return 'rejected';
    if(waiter.answer)return waiter.answer===decision?'duplicate':'rejected';
    waiter.answer=decision;waiter.dispose();waiter.resolve(decision);return 'accepted';
  }
  release(id:string):void {this.waiting.get(id)?.dispose();this.waiting.delete(id);}
}
