import { z } from 'zod';
import { projectRelativePathSchema } from '@codryn/shared';
import type { ProjectFileReadResult, ProjectTextSearchResult } from '../agent/ports.js';
import type { ToolDefinition } from './tool-registry.js';

const safeRelativePathSchema = projectRelativePathSchema.refine(
  (path) => !path.includes('\0') && !path.replaceAll('\\', '/').split('/').some((segment) => segment === '..' || segment.length === 0),
  'Project path must not escape its root.'
);

export const fileReadInputSchema = z.object({
  path: safeRelativePathSchema,
  startLine: z.number().int().min(1).default(1),
  maxLines: z.number().int().min(1).max(400).default(200)
}).strict();

export const fileReadOutputSchema = z.object({
  path: safeRelativePathSchema,
  content: z.string(),
  startLine: z.number().int().min(1),
  endLine: z.number().int().nonnegative(),
  totalLines: z.number().int().nonnegative(),
  truncated: z.boolean(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();

export const textSearchInputSchema = z.object({
  query: z.string().min(1).max(512),
  path: safeRelativePathSchema.default('.'),
  maxResults: z.number().int().min(1).max(100).default(50)
}).strict();

export const textSearchOutputSchema = z.object({
  matches: z.array(z.object({
    path: safeRelativePathSchema,
    line: z.number().int().min(1),
    column: z.number().int().min(1),
    preview: z.string().max(400)
  }).strict()),
  truncated: z.boolean(),
  filesSearched: z.number().int().nonnegative(),
  bytesSearched: z.number().int().nonnegative()
}).strict();

export function fileReadTool(handler: (input: z.output<typeof fileReadInputSchema>, signal: AbortSignal) => Promise<ProjectFileReadResult>): ToolDefinition {
  return { toolId: 'file.read', toolVersion: 1, description: 'Read bounded UTF-8 text from the open project.', risk: 'read_project', inputSchema: fileReadInputSchema, outputSchema: fileReadOutputSchema, handler };
}

export function textSearchTool(handler: (input: z.output<typeof textSearchInputSchema>, signal: AbortSignal) => Promise<ProjectTextSearchResult>): ToolDefinition {
  return { toolId: 'text.search', toolVersion: 1, description: 'Search bounded literal text in the open project.', risk: 'read_project', inputSchema: textSearchInputSchema, outputSchema: textSearchOutputSchema, handler };
}
