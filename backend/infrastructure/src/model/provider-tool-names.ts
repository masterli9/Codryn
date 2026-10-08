import type { ModelToolDefinition } from '@codryn/shared';
import { ProviderAdapterError } from './provider-errors.js';

/**
 * Provider function names are deliberately separate from Codryn tool IDs.
 * OpenAI and Gemini both restrict function identifiers more than the internal
 * registry does; the mapping also prevents a provider from inventing a tool.
 */
export function externalToolName(toolId: string, version: number): string {
  return `codryn_${toolId.replace(/[^A-Za-z0-9_]/g, '_')}_v${version}`;
}

export function externalToolMap(tools: readonly ModelToolDefinition[]): Map<string, ModelToolDefinition> {
  const map = new Map<string, ModelToolDefinition>();
  for (const tool of tools) {
    const name = externalToolName(tool.toolId, tool.toolVersion);
    if (map.has(name)) throw new ProviderAdapterError('invalid_tool_call');
    map.set(name, tool);
  }
  return map;
}
