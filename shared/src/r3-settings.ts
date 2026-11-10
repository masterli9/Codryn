import { z } from 'zod';
import { isoTimestampSchema } from './ids.js';
import { modelDescriptorSchema } from './model-contract.js';
import { r3ModeSchema } from './r3-chat.js';
export const r3ProviderSettingsSchema = z.object({ mode: r3ModeSchema, modelId: z.string().min(1), model: modelDescriptorSchema, maxSteps: z.number().int().min(1).max(32), keyState: z.enum(['missing', 'stored', 'unavailable']), keyVersion: z.number().int().nonnegative(), testedAt: isoTimestampSchema.nullable(), testResult: z.enum(['not_tested', 'passed', 'failed']), dataPolicyVersion: z.string().min(1), consentVersion: z.string().nullable(), dataPolicy: z.object({ version: z.string().min(1), requiresConfirmation: z.boolean(), notice: z.string().min(1), sourceUrls: z.array(z.url()) }).strict() }).strict().refine(value => value.modelId === value.model.modelId && value.dataPolicyVersion === value.dataPolicy.version);
export type R3ProviderSettings = z.infer<typeof r3ProviderSettingsSchema>;
