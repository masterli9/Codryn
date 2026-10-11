import { expect,it } from 'vitest';
import { ReferenceVerificationPolicy } from '../src/verification/reference-verification-policy.js';
it('covers only known input under a complete trusted reference check',()=>{
  const policy=new ReferenceVerificationPolicy();
  const base={changedPaths:['sum.mjs','other.ts'],observedPaths:['sum.mjs','sum.test.mjs','other.ts'],complete:true,manifestValid:true,commandTrusted:true};
  expect(policy.assess(base)).toEqual({profileId:'r2-sum-v1',coveredPaths:['sum.mjs'],uncoveredPaths:['other.ts']});
  for(const change of [{complete:false},{manifestValid:false},{commandTrusted:false},{observedPaths:['sum.mjs']}])expect(policy.assess({...base,...change}).coveredPaths).toEqual([]);
  expect(policy.assess({...base,changedPaths:['other.ts']})).toEqual({profileId:'r2-sum-v1',coveredPaths:[],uncoveredPaths:['other.ts']});
});
