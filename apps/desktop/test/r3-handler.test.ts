import { randomUUID } from 'node:crypto';
import { expect,it,vi } from 'vitest';
import { createR3Handler,assertR3Sender } from '../src/ipc/r3-handler.js';
import type { R3Services,R3SenderEvent } from '../src/ipc/r3-handler.js';
it('returns only the backend active run identity without reading project snapshots',async()=>{
  const target={projectId:randomUUID(),chatId:randomUUID(),jobId:randomUUID()},activeTarget=vi.fn().mockReturnValue(target),snapshot=vi.fn();const services={manager:{activeTarget},snapshot} as unknown as R3Services;
  const handler=createR3Handler({services,assertSender:()=>undefined,chooseDirectory:async()=>null,subscriptions:{attach:vi.fn(),detach:vi.fn()}});
  expect(await handler({} as R3SenderEvent,{operation:'run.active',requestId:randomUUID()})).toEqual({ok:true,value:target});expect(snapshot).not.toHaveBeenCalled();
  expect(await handler({} as R3SenderEvent,{operation:'run.active',requestId:randomUUID(),root:'E:/escape'})).toMatchObject({ok:false,error:{code:'R3_INPUT_INVALID'}});expect(activeTarget).toHaveBeenCalledTimes(1);
  activeTarget.mockReturnValue(null);expect(await handler({} as R3SenderEvent,{operation:'run.active',requestId:randomUUID()})).toEqual({ok:true,value:null});
  activeTarget.mockReturnValue({...target,secret:'hidden'});expect(await handler({} as R3SenderEvent,{operation:'run.active',requestId:randomUUID()})).toMatchObject({ok:false,error:{code:'R3_INTERNAL'}});
});
it('rejects foreign window, iframe, URL and destroyed senders before any service',()=>{
  const main={url:'file:///app/index.html'},window={id:10,mainFrame:main,isDestroyed:()=>false},event={sender:window,senderFrame:main};
  expect(()=>assertR3Sender(event,window,'file:///app/index.html')).not.toThrow();
  const windowsFrame={url:'file:///E:/app/index.html'},windowsSender={...window,mainFrame:windowsFrame};expect(()=>assertR3Sender({sender:windowsSender,senderFrame:windowsFrame},windowsSender,'file://E:\\app\\index.html')).not.toThrow();
  for(const bad of [{...event,sender:{...window,id:11}},{...event,senderFrame:{url:main.url}},{...event,senderFrame:{...main,url:'https://evil.invalid'}},{...event,sender:{...window,isDestroyed:()=>true}}])expect(()=>assertR3Sender(bad,window,main.url)).toThrow('R3_SENDER_REJECTED');
});
it('validates the allowlist and strips raw errors, folder cancellation creates no project',async()=>{
  const list=vi.fn().mockResolvedValue([]),open=vi.fn(),services={projects:{list,open}} as unknown as R3Services;
  const handler=createR3Handler({services,assertSender:()=>undefined,chooseDirectory:async()=>null,subscriptions:{attach:vi.fn(),detach:vi.fn()}});
  expect(await handler({} as R3SenderEvent,{operation:'project.open',requestId:randomUUID(),root:'E:\\escape'})).toMatchObject({ok:false,error:{code:'R3_INPUT_INVALID'}});expect(open).not.toHaveBeenCalled();
  expect(await handler({} as R3SenderEvent,{operation:'project.open',requestId:randomUUID()})).toEqual({ok:true,value:{cancelled:true}});
  list.mockRejectedValueOnce(new Error('synthetic-secret'));const response=await handler({} as R3SenderEvent,{operation:'project.list',requestId:randomUUID()});expect(response).toMatchObject({ok:false,error:{code:'R3_INTERNAL'}});expect(JSON.stringify(response)).not.toContain('synthetic-secret');
});
