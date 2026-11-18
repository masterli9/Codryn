import { expect,it } from 'vitest';
import { ExtensionRegistry } from '../src/extensions/extension-registry.js';
it('resolves an exact registered version without granting permissions or running code',()=>{
  const registry=new ExtensionRegistry();
  const manifest={id:'planning',kind:'skill' as const,name:'Planning',version:'1.0.0',description:'Plan a bounded change.',capabilities:['planning' as const],requiredPermissions:['read_project' as const]};
  registry.register(manifest);
  expect(registry.list()).toEqual([manifest]);
  expect(registry.resolve('planning','1.0.0')).toEqual(manifest);
  expect(()=>registry.register(manifest)).toThrow();
  expect(()=>registry.resolve('planning','2.0.0')).toThrow();
});
