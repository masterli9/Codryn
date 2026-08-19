import { randomUUID } from 'node:crypto';
import type { IdGenerator } from '@codryn/core';
import { uuidSchema, type Uuid } from '@codryn/shared';

export class UuidGenerator implements IdGenerator {
  next(): Uuid {
    return uuidSchema.parse(randomUUID());
  }
}
