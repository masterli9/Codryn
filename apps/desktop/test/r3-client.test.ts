import { expect,it,vi } from 'vitest';
import { r0DiagnosticRequestSchema } from '@codryn/shared';
import { R3Client } from '../src/renderer/r3-client.js';
it('validates the legacy diagnostics bridge and handles its backend rejection',async()=>{
  const diagnostics=vi.fn().mockResolvedValue({ok:false,error:{code:'R0_INTERNAL_ERROR',message:'Diagnostika je zaneprázdněná.'}}),client=new R3Client({invoke:vi.fn(),onUpdate:()=>()=>undefined},diagnostics);
  await expect(client.runDiagnostics()).rejects.toThrow('Diagnostika je zaneprázdněná.');expect(r0DiagnosticRequestSchema.safeParse(diagnostics.mock.calls[0]?.[0]).success).toBe(true);
  diagnostics.mockResolvedValueOnce({ok:true,report:{overallStatus:'passed'}});await expect(client.runDiagnostics()).rejects.toThrow();
  diagnostics.mockResolvedValueOnce({ok:false,error:{code:'UNTRUSTED',message:'Bad'}});await expect(client.runDiagnostics()).rejects.toThrow();
});
