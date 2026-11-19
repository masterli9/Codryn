import { expect, it } from 'vitest';
import { r3SmokeDiagnostic } from '../src/smoke/r3-smoke-diagnostic.js';

it('reports a fixed smoke step and safe error identity without arbitrary text', () => {
  expect(r3SmokeDiagnostic('revert',new DOMException('private fixture text','TimeoutError')))
    .toEqual({step:'revert',errorName:'TimeoutError',code:'R3_SMOKE_INTERNAL'});
  expect(r3SmokeDiagnostic('diff',new TypeError('private file contents')))
    .toEqual({step:'diff',errorName:'TypeError',code:'R3_SMOKE_INTERNAL'});
  expect(r3SmokeDiagnostic('snapshot',new Error('R2_WORKSPACE_CANCELLED')))
    .toEqual({step:'snapshot',errorName:'Error',code:'R2_WORKSPACE_CANCELLED'});
  expect(r3SmokeDiagnostic('snapshot',Object.assign(new Error('private'),{code:'EBUSY'})).code).toBe('EBUSY');
  expect(r3SmokeDiagnostic('snapshot',{name:'private',message:'private',code:'private'}))
    .toEqual({step:'snapshot',errorName:'other',code:'R3_SMOKE_INTERNAL'});
});
