import { expect,it } from 'vitest';
import { StreamRedactor } from '../src/logging/stream-redactor.js';
it('redacts a known credential across every chunk split and preserves unrelated UTF-8 text',()=>{
  const secret='synthetic-marker-123';
  for(let split=1;split<secret.length;split++) {const redactor=new StreamRedactor({secrets:[secret]});const text=redactor.push('model','Začátek '+secret.slice(0,split))+redactor.push('model',secret.slice(split)+' konec')+redactor.finish('model');expect(text).toBe('Začátek [redacted] konec');expect(text).not.toContain(secret);}
});
it('keeps streams independent and never flushes an incomplete credential assignment raw',()=>{
  const redactor=new StreamRedactor({secrets:[]});const text=redactor.push('stdout','API_KEY=')+redactor.push('stdout','sensitive')+redactor.finish('stdout');expect(text).not.toContain('sensitive');expect(text).toContain('[redacted]');expect(redactor.push('stderr','普通 text')+redactor.finish('stderr')).toBe('普通 text');
  const oversized=new StreamRedactor({secrets:[]});expect(oversized.push('model','TOKEN='+ 'x'.repeat(5000))+oversized.finish('model')).not.toContain('x'.repeat(100));
});
it('does not expose the suffix of a completed long credential at the retained buffer boundary',()=>{
  const redactor=new StreamRedactor({secrets:[]});const value='dangerous'.repeat(30);const text=redactor.push('stdout','TOKEN='+value+' trailing text')+redactor.finish('stdout');expect(text).toBe('[redacted] trailing text');
});
