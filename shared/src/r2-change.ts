import { z } from 'zod';

const textWithoutNulSchema = z.string().refine(
  (value) => !value.includes('\0'),
  'R2_PATCH_NUL'
);

const patchEditSchema = z.object({
  oldText: textWithoutNulSchema.min(1),
  newText: textWithoutNulSchema
}).strict();

export const patchInputSchema = z.object({
  path: textWithoutNulSchema.min(1).max(1024),
  expectedHash: z.string().regex(/^[0-9a-f]{64}$/),
  edits: z.array(patchEditSchema).min(1).max(16)
}).strict().superRefine((value, context) => {
  const bytes = value.edits.reduce((total, edit) => (
    total + new TextEncoder().encode(edit.oldText).byteLength +
    new TextEncoder().encode(edit.newText).byteLength
  ), 0);
  if (bytes > 64 * 1024) {
    context.addIssue({
      code: 'custom',
      message: 'R2_PATCH_EDIT_BYTES_EXCEEDED',
      path: ['edits']
    });
  }
});

export type PatchInput = z.infer<typeof patchInputSchema>;
