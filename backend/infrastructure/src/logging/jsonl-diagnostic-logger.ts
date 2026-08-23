import { appendFile, mkdir, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { DiagnosticLogger, LogEntry } from '@codryn/core';
import type { JsonValue } from '@codryn/shared';
import { redactLogValue, type RedactionPolicy } from './redact.js';

export interface JsonlDiagnosticLoggerOptions {
  readonly directory: string;
  readonly maxBytes?: number;
  readonly redactionPolicy: RedactionPolicy;
}

const defaultMaxBytes = 2 * 1024 * 1024;
const activeFilename = 'codryn.log.jsonl';
const rotatedFilename = 'codryn.log.jsonl.1';
const minimumTruncatedLine = `${JSON.stringify({ level: 'error', event: '', data: { truncated: true } })}\n`;
const minimumTruncatedLineBytes = Buffer.byteLength(minimumTruncatedLine, 'utf8');

export class JsonlDiagnosticLogger implements DiagnosticLogger {
  private readonly directory: string;
  private readonly maxBytes: number;
  private readonly redactionPolicy: RedactionPolicy;
  private readonly activePath: string;
  private readonly rotatedPath: string;
  private writeChain: Promise<void> = Promise.resolve();

  public constructor(options: JsonlDiagnosticLoggerOptions) {
    this.directory = options.directory;
    this.maxBytes = options.maxBytes ?? defaultMaxBytes;
    this.redactionPolicy = options.redactionPolicy;
    this.activePath = join(this.directory, activeFilename);
    this.rotatedPath = join(this.directory, rotatedFilename);

    if (!Number.isSafeInteger(this.maxBytes) || this.maxBytes <= 0) {
      throw new RangeError('maxBytes must be a positive safe integer');
    }
    if (this.maxBytes < minimumTruncatedLineBytes) {
      throw new RangeError(`maxBytes must be at least ${minimumTruncatedLineBytes} bytes, the minimum fallback line size`);
    }
  }

  public write(entry: LogEntry): Promise<void> {
    const operation = this.writeChain.then(() => this.writeEntry(entry));
    this.writeChain = operation.catch(() => undefined);
    return operation;
  }

  private async writeEntry(entry: LogEntry): Promise<void> {
    const redacted = redactLogValue(entry as unknown as JsonValue, this.redactionPolicy) as unknown as LogEntry;
    let line = `${JSON.stringify(redacted)}\n`;
    if (Buffer.byteLength(line, 'utf8') > this.maxBytes) {
      line = this.createTruncatedLine(redacted);
    }
    await mkdir(this.directory, { recursive: true });
    const currentBytes = await this.currentFileSize();
    const lineBytes = Buffer.byteLength(line, 'utf8');
    if (currentBytes !== undefined && currentBytes + lineBytes > this.maxBytes) {
      await this.removeRotatedFile();
      await rename(this.activePath, this.rotatedPath);
    }
    await appendFile(this.activePath, line, 'utf8');
  }

  private async currentFileSize(): Promise<number | undefined> {
    try {
      return (await stat(this.activePath)).size;
    } catch (error) {
      if (isMissingFile(error)) return undefined;
      throw error;
    }
  }

  private async removeRotatedFile(): Promise<void> {
    try {
      await unlink(this.rotatedPath);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }

  private createTruncatedLine(entry: LogEntry): string {
    const data = { truncated: true } as const;
    const event = typeof entry.event === 'string' ? entry.event : '';
    const encode = (eventName: string): string => `${JSON.stringify({ level: 'error', event: eventName, data })}\n`;
    if (Buffer.byteLength(encode(event), 'utf8') <= this.maxBytes) return encode(event);

    const characters = Array.from(event);
    let low = 0;
    let high = characters.length;
    let best = '';
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const candidate = characters.slice(0, middle).join('');
      if (Buffer.byteLength(encode(candidate), 'utf8') <= this.maxBytes) {
        best = candidate;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return encode(best);
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
