import { z } from 'zod';
import type { JsonValue, ModelToolDefinition } from '@codryn/shared';
import type { ToolExecutionContext } from '../agent/ports.js';

export type ToolRisk = 'read_project' | 'write_project';

export interface ToolDefinition {
  readonly toolId: string;
  readonly toolVersion: number;
  readonly description: string;
  readonly risk: ToolRisk;
  readonly requiresCanonicalGuard?: boolean;
  readonly inputSchema: z.ZodType;
  readonly outputSchema: z.ZodType;
  handler(input: unknown, signal: AbortSignal, context?: ToolExecutionContext): Promise<unknown>;
}

export class ToolRegistryFailure extends Error {
  constructor(readonly code: 'R1_TOOL_UNKNOWN' | 'R1_TOOL_DUPLICATE') {
    super(code === 'R1_TOOL_UNKNOWN' ? 'Tool is not registered.' : 'Tool ID and version must be unique.');
    this.name = 'ToolRegistryFailure';
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function publicDescriptor(definition: ToolDefinition): ModelToolDefinition {
  return deepFreeze({
    toolId: definition.toolId,
    toolVersion: definition.toolVersion,
    description: definition.description,
    inputSchema: z.toJSONSchema(definition.inputSchema) as Record<string, JsonValue>
  });
}

export class ToolRegistry {
  readonly #definitions = new Map<string, ToolDefinition>();
  readonly descriptors: readonly ModelToolDefinition[];

  constructor(definitions: readonly ToolDefinition[]) {
    for (const definition of definitions) {
      const key = `${definition.toolId}@${definition.toolVersion}`;
      if (this.#definitions.has(key)) throw new ToolRegistryFailure('R1_TOOL_DUPLICATE');
      this.#definitions.set(key, Object.freeze({ ...definition }));
    }
    this.descriptors = Object.freeze(definitions.map(publicDescriptor));
  }

  lookup(toolId: string, toolVersion: number): ToolDefinition {
    const definition = this.#definitions.get(`${toolId}@${toolVersion}`);
    if (definition === undefined) throw new ToolRegistryFailure('R1_TOOL_UNKNOWN');
    return definition;
  }
}
