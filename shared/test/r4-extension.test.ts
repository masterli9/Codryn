import { expect,it } from 'vitest';
import { extensionManifestSchema } from '../src/r4-extension.js';
const valid={id:'planning',kind:'skill',name:'Planning',version:'1.0.0',description:'Plan a bounded change.',capabilities:['planning'],requiredPermissions:['read_project']};
it('validates skill and plugin manifests and rejects unknown authority',()=>{
  expect(extensionManifestSchema.safeParse(valid).success).toBe(true);
  expect(extensionManifestSchema.safeParse({...valid,kind:'plugin'}).success).toBe(true);
  expect(extensionManifestSchema.safeParse({...valid,capabilities:['arbitrary_code']}).success).toBe(false);
  expect(extensionManifestSchema.safeParse({...valid,requiredPermissions:['network']}).success).toBe(false);
});
