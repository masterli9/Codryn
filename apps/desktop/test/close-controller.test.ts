import { expect,it,vi } from 'vitest';
import { CloseController } from '../src/lifecycle/close-controller.js';
it('coalesces close requests and preserves the database after uncertain termination',async()=>{
  let release:(answer:'stay'|'stop')=>void=()=>undefined;const answer=new Promise<'stay'|'stop'>(resolve=>{release=resolve;});const confirm=vi.fn(()=>answer),shutdown=vi.fn(async()=>({stopped:false})),close=vi.fn(),finish=vi.fn();
  const controller=new CloseController({confirm,shutdown,close,finish});const first=controller.requestClose(),second=controller.requestClose();expect(confirm).toHaveBeenCalledOnce();release('stop');expect(await first).toBe('failed');expect(await second).toBe('failed');expect(close).not.toHaveBeenCalled();expect(finish).not.toHaveBeenCalled();
  shutdown.mockResolvedValueOnce({stopped:true});expect(await controller.requestClose()).toBe('closed');expect(close).toHaveBeenCalledOnce();expect(finish).toHaveBeenCalledOnce();
});
