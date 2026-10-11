import { expect,it,vi } from 'vitest';
import { R3ProjectService } from '../src/desktop/project-service.js';
it('resolves a canonical available root without rescanning Git and rejects replaced roots',async()=>{
  const inspect=vi.fn(async()=>({mode:'non-git' as const,reason:'not_repository' as const})),canonicalize=vi.fn(async()=>({root:'C:\\project',identity:'c:\\project'})),service=new R3ProjectService({store:{get:async()=>({id:'p',displayName:'P',available:true,mode:'git',limitations:[]}),root:async()=> 'C:\\project',list:vi.fn(),remember:vi.fn()},ids:{next:()=> 'id'},canonicalizeRoot:canonicalize,openWorkspace:vi.fn(),inspectGit:inspect});
  expect(await service.root('p')).toBe('C:\\project');expect(inspect).not.toHaveBeenCalled();canonicalize.mockResolvedValueOnce({root:'C:\\other',identity:'c:\\other'});await expect(service.root('p')).rejects.toThrow('R3_PROJECT_UNAVAILABLE');
});
