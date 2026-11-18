import { z } from 'zod';
export const extensionManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,59}$/),
  kind: z.enum(['skill','plugin']),
  name: z.string().trim().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().trim().min(1).max(500),
  capabilities: z.array(z.enum(['planning','verification'])).min(1).max(2),
  requiredPermissions: z.array(z.enum(['read_project','write_project','command_project'])).min(1).max(3)
}).strict().refine(value=>new Set(value.capabilities).size===value.capabilities.length && new Set(value.requiredPermissions).size===value.requiredPermissions.length);
export const builtinWorkflowSchema = z.enum(['planning@1.0.0','verification@1.0.0']);
export type ExtensionManifest = z.infer<typeof extensionManifestSchema>;
export type BuiltinWorkflow = z.infer<typeof builtinWorkflowSchema>;
