import { patchInputSchema, projectRelativePathSchema } from '@codryn/shared';
import { z } from 'zod';
import type { ChangeActor, MutationResult } from '../changes/ports.js';
import type { ToolDefinition } from './tool-registry.js';

export interface PatchExecutor {
  execute(input: unknown, actor: ChangeActor, signal: AbortSignal): Promise<MutationResult>;
}

const filePatchOutputSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('applied'),
    path: projectRelativePathSchema,
    beforeHash: z.string().regex(/^[0-9a-f]{64}$/),
    afterHash: z.string().regex(/^[0-9a-f]{64}$/),
    changeId: z.string().min(1),
    revision: z.number().int().nonnegative()
  }).strict(),
  z.object({ status: z.literal('rejected'), code: z.string().min(1) }).strict(),
  z.object({ status: z.literal('recovery_required'), operationId: z.string().min(1) }).strict()
]);

function safePatchResult(result: MutationResult): z.infer<typeof filePatchOutputSchema> {
  if (result.status === 'applied') {
    return {
      status: 'applied',
      path: result.entry.path,
      beforeHash: result.entry.beforeHash,
      afterHash: result.entry.afterHash,
      changeId: result.entry.id,
      revision: result.revision
    };
  }
  return result;
}

export function filePatchTool(executor: PatchExecutor): ToolDefinition {
  return {
    toolId: 'file.patch',
    toolVersion: 1,
    description: 'Apply one guarded, targeted text patch to an existing project file.',
    risk: 'write_project',
    requiresCanonicalGuard: true,
    inputSchema: patchInputSchema,
    outputSchema: filePatchOutputSchema,
    async handler(input, signal, context) {
      if (context === undefined) return { status: 'rejected', code: 'R2_TOOL_CONTEXT_INVALID' };
      return safePatchResult(await executor.execute(input, context, signal));
    }
  };
}
