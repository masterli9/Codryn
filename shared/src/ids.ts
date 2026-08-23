import { z } from 'zod';

export const uuidSchema = z.uuid();
export const isoTimestampSchema = z.iso.datetime({ offset: true });

export type Uuid = z.infer<typeof uuidSchema>;
export type IsoTimestamp = z.infer<typeof isoTimestampSchema>;
