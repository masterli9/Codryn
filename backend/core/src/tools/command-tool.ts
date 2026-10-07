import { commandSpecSchema, type CommandSpec } from '@codryn/shared';
import { z } from 'zod';
import type { CommandResult } from '../process/ports.js';
import type { ToolDefinition } from './tool-registry.js';
import type { ToolExecutionContext } from '../agent/ports.js';

const commandRunInputSchema = z.object({
  command: commandSpecSchema,
  reason: z.string().min(1).max(4096),
  impact: z.string().min(1).max(4096)
}).strict();

const commandResultSchema = z.object({
  status: z.enum(['succeeded', 'failed', 'timed_out', 'cancelled', 'termination_failed']),
  exitCode: z.number().int().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  truncated: z.boolean(),
  durationMs: z.number().int().nonnegative(),
  treeStopped: z.boolean()
}).strict();

const commandRunOutputSchema = z.union([
  commandResultSchema,
  z.object({ status: z.literal('rejected'), code: z.string().min(1) }).strict()
]);

export interface CommandExecutor {
  run(spec: CommandSpec, signal: AbortSignal, context?: ToolExecutionContext): Promise<CommandResult>;
}

export function commandRunTool(executor: CommandExecutor): ToolDefinition {
  return {
    toolId: 'command.run',
    toolVersion: 1,
    description: 'Run one explicitly approved bounded project command.',
    risk: 'command_project',
    inputSchema: commandRunInputSchema,
    outputSchema: commandRunOutputSchema,
    async handler(input, signal, context) {
      if (context === undefined) return { status: 'rejected', code: 'R2_TOOL_CONTEXT_INVALID' };
      const value = commandRunInputSchema.parse(input);
      return executor.run(value.command, signal, context);
    }
  };
}
