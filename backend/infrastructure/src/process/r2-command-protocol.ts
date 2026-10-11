import { StringDecoder } from 'node:string_decoder';
import { z } from 'zod';

const base64 = z.string().max(350_000).refine(value => value.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value));
const identity = z.object({ pid: z.number().int().positive(), creationTime: z.string().regex(/^\d{15,20}$/) }).strict();
const frame = z.discriminatedUnion('type', [
  z.object({ type: z.literal('output'), stream: z.enum(['stdout','stderr']), sequence: z.number().int().positive(), data: base64.refine(value => Buffer.from(value,'base64').length <= 4096) }).strict(),
  z.object({ type: z.literal('owned'), jobName: z.string().regex(/^Codryn-R3-[a-f0-9-]{36}$/), worker: identity, target: identity }).strict(),
  z.object({ type: z.literal('result'), status: z.enum(['succeeded','failed','timed_out','cancelled','termination_failed']), exitCode: z.number().int().nullable(), stdout: base64, stderr: base64, truncated: z.boolean(), durationMs: z.number().int().nonnegative(), treeStopped: z.boolean() }).strict(),
  z.object({ type: z.literal('error'), code: z.literal('R2_COMMAND_WORKER_FAILED') }).strict()
]);
export type CommandFrame = z.infer<typeof frame>;

/** Bounded JSON-lines parser; no callback receives unvalidated worker data. */
export class R2CommandProtocol {
  private readonly decoder = new StringDecoder('utf8');
  private pending = '';
  private sequence = 0;
  private terminal = false;
  private owned = false;
  push(bytes: Buffer): CommandFrame[] {
    this.pending += this.decoder.write(bytes);
    if (Buffer.byteLength(this.pending) > 768 * 1024) throw new Error('R3_COMMAND_PROTOCOL_LIMIT');
    const frames: CommandFrame[] = [];
    for (let newline = this.pending.indexOf('\n'); newline >= 0; newline = this.pending.indexOf('\n')) {
      const line = this.pending.slice(0,newline).trim();
      this.pending = this.pending.slice(newline + 1);
      if (!line) continue;
      if (this.terminal) throw new Error('R3_COMMAND_PROTOCOL_TERMINAL');
      const value = frame.parse(JSON.parse(line));
      if (value.type === 'output' && value.sequence !== ++this.sequence) throw new Error('R3_COMMAND_PROTOCOL_SEQUENCE');
      if (value.type === 'owned') { if (this.owned) throw new Error('R3_COMMAND_PROTOCOL_OWNED'); this.owned = true; }
      if (value.type === 'result' || value.type === 'error') this.terminal = true;
      frames.push(value);
    }
    return frames;
  }
  finish(): void {
    this.pending += this.decoder.end();
    if (this.pending.trim() || !this.terminal) throw new Error('R3_COMMAND_PROTOCOL_INCOMPLETE');
  }
}
