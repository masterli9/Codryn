import { expect,it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
it('rejects missing phases, unsupported report schema and unproven process termination',async()=>{
  const run=promisify(execFile);const script="import {validateR3Reports,requiredPhases} from './scripts/verify-packaged-r3.mjs';const base=requiredPhases.map(phase=>({schemaVersion:1,phase,buildHash:'h',passed:true,noPlaintextPassed:true,runtime:{platform:'win32'},secretRestartPassed:true,workflowPassed:true,cancelTreePassed:true}));if(!validateR3Reports(base,'h'))process.exit(2);for(const bad of [base.slice(1),base.map(r=>({...r,schemaVersion:2})),base.map(r=>({...r,cancelTreePassed:false})),base.map(r=>({...r,noPlaintextPassed:false}))]){let rejected=false;try{validateR3Reports(bad,'h')}catch{rejected=true}if(!rejected)process.exit(3);}console.log('passed');";
  expect((await run(process.execPath,['--input-type=module','-e',script],{cwd:process.cwd(),timeout:10000,windowsHide:true})).stdout.trim()).toBe('passed');
});
