import type { Clock } from '@codryn/core';

export class SystemClock implements Clock {
  now(): string {
    return new Date().toISOString();
  }
}
