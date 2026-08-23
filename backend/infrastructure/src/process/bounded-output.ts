import { StringDecoder } from 'node:string_decoder';

export interface BoundedOutputSnapshot {
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
}

type OutputStream = 'stdout' | 'stderr';

function decodeUtf8(chunks: readonly Buffer[], suppressTerminalPartial: boolean): string {
  const decoder = new StringDecoder('utf8');
  const decoded = chunks.map((chunk) => decoder.write(chunk)).join('');
  return suppressTerminalPartial ? decoded : decoded + decoder.end();
}

export class BoundedOutput {
  private readonly stdoutChunks: Buffer[] = [];
  private readonly stderrChunks: Buffer[] = [];
  private remainingBytes: number;
  private stdoutTruncated = false;
  private stderrTruncated = false;
  private stdoutLimitSliced = false;
  private stderrLimitSliced = false;
  private limitNotified = false;

  constructor(
    maxBytes: number,
    private readonly notifyLimit: () => void
  ) {
    this.remainingBytes = maxBytes;
  }

  appendStdout(chunk: Buffer): void {
    this.append('stdout', chunk);
  }

  appendStderr(chunk: Buffer): void {
    this.append('stderr', chunk);
  }

  snapshot(): BoundedOutputSnapshot {
    return {
      stdout: decodeUtf8(this.stdoutChunks, this.stdoutLimitSliced),
      stderr: decodeUtf8(this.stderrChunks, this.stderrLimitSliced),
      stdoutTruncated: this.stdoutTruncated,
      stderrTruncated: this.stderrTruncated
    };
  }

  private append(stream: OutputStream, chunk: Buffer): void {
    if (chunk.length <= this.remainingBytes) {
      this.chunks(stream).push(Buffer.from(chunk));
      this.remainingBytes -= chunk.length;
      return;
    }

    if (this.remainingBytes > 0) {
      this.chunks(stream).push(Buffer.from(chunk.subarray(0, this.remainingBytes)));
      this.remainingBytes = 0;
      this.markLimitSliced(stream);
    }
    this.markTruncated(stream);

    if (!this.limitNotified) {
      this.limitNotified = true;
      this.notifyLimit();
    }
  }

  private chunks(stream: OutputStream): Buffer[] {
    return stream === 'stdout' ? this.stdoutChunks : this.stderrChunks;
  }

  private markTruncated(stream: OutputStream): void {
    if (stream === 'stdout') this.stdoutTruncated = true;
    else this.stderrTruncated = true;
  }

  private markLimitSliced(stream: OutputStream): void {
    if (stream === 'stdout') this.stdoutLimitSliced = true;
    else this.stderrLimitSliced = true;
  }
}
