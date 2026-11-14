import { typescriptQueryInputSchema, typescriptQueryOutputSchema } from '@codryn/shared';
import type { TypeScriptQueryInput, TypeScriptQueryOutput } from '@codryn/shared';
import type { ToolDefinition } from './tool-registry.js';

export function typescriptQueryTool(query: (input: TypeScriptQueryInput, signal: AbortSignal) => Promise<TypeScriptQueryOutput>): ToolDefinition {
  return {
    toolId: 'typescript.query', toolVersion: 1, risk: 'read_project',
    description: 'Inspect current TypeScript definitions, references, types, signatures, exports, diagnostics or import edges in one project path. Use either a symbol name or 1-based line and column for symbol queries. Limited results may omit unavailable declarations.',
    inputSchema: typescriptQueryInputSchema, outputSchema: typescriptQueryOutputSchema,
    async handler(input, signal) {
      return typescriptQueryOutputSchema.parse(await query(typescriptQueryInputSchema.parse(input), signal));
    }
  };
}
