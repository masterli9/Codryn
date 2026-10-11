import { expect,it } from 'vitest';
import { trustedNodePath } from '../src/runtime/node-runtime.js';
it('rejects project, relative and empty PATH entries without executing them',()=>{
  expect(trustedNodePath('E:\\project;.;C:\\Program Files\\nodejs;;E:\\project\\bin', 'E:\\project')).toBe('C:\\Program Files\\nodejs');
  expect(trustedNodePath('E:\\project;.', 'E:\\project')).toBe('');
});
