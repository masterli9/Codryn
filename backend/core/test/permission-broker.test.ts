import { expect,it } from 'vitest';
import { DesktopPermissionBroker } from '../src/desktop/permission-broker.js';
it('resolves an existing waiter once, preserves duplicate semantics and rejects after cancellation',async()=>{
  const broker=new DesktopPermissionBroker(),signal=new AbortController();
  const pending=broker.wait('permission','digest',signal.signal);
  expect(broker.answer('permission','other','allow_once')).toBe('rejected');expect(broker.answer('permission','digest','allow_once')).toBe('accepted');expect(broker.answer('permission','digest','allow_once')).toBe('duplicate');expect(broker.answer('permission','digest','deny')).toBe('rejected');expect(await pending).toBe('allow_once');
  const aborted=new AbortController(),waiting=broker.wait('cancelled','digest',aborted.signal);aborted.abort();await expect(waiting).rejects.toThrow();expect(broker.answer('cancelled','digest','allow_once')).toBe('rejected');
});
