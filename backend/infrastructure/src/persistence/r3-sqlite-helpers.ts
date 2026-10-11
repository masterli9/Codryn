import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
export function transaction<T>(database: DatabaseSync, effect: () => T): T {
  database.exec('BEGIN IMMEDIATE');
  try { const result = effect(); database.exec('COMMIT'); return result; }
  catch (error) { if (database.isTransaction) database.exec('ROLLBACK'); throw error; }
}
export function text(value: SQLOutputValue | undefined): string {
  if (typeof value !== 'string') throw new Error('R3_INTERNAL'); return value;
}
export function nullableText(value: SQLOutputValue | undefined): string | null { return value === null ? null : text(value); }
export function integer(value: SQLOutputValue | undefined): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error('R3_INTERNAL'); return value;
}
export function parseJson(value: SQLOutputValue | undefined): unknown { return JSON.parse(text(value)) as unknown; }
