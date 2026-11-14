import { Worker } from 'node:worker_threads';
import { dirname, isAbsolute, join } from 'node:path';
import { typescriptQueryInputSchema, typescriptQueryOutputSchema } from '@codryn/shared';
import type { TypeScriptQueryInput, TypeScriptQueryOutput } from '@codryn/shared';
import { developmentTypeScriptCli } from './typescript-installation.js';
import { emptyTypeScriptQuery } from './typescript-query-result.js';

interface Options { timeoutMs?: number; standardLibrary?: string }
export type TypeScriptQueryRunner = Pick<TypeScriptQueryClient, 'query'>;

export class TypeScriptQueryClient {
  private readonly active = new Map<Worker, () => Promise<void>>();
  private closed = false;
  private readonly standardLibrary: string;
  private readonly timeoutMs: number;

  constructor(private readonly filename: string, options: Options = {}) {
    this.standardLibrary = options.standardLibrary ?? join(dirname(developmentTypeScriptCli()), '..', 'lib');
    this.timeoutMs = Math.max(1, Math.min(5000, options.timeoutMs ?? 5000));
  }

  async query(root: string, raw: TypeScriptQueryInput, revision: number, signal: AbortSignal): Promise<TypeScriptQueryOutput> {
    if (this.closed || signal.aborted) return emptyTypeScriptQuery(revision, 'cancelled');
    const input = typescriptQueryInputSchema.safeParse(raw);
    if (!input.success || !isAbsolute(root) || !Number.isSafeInteger(revision) || revision < 0) return emptyTypeScriptQuery(0, 'worker_failed');
    let worker: Worker;
    try {
      worker = new Worker(this.filename, { workerData: { root, input: input.data, revision, standardLibrary: this.standardLibrary },
        resourceLimits: { maxOldGenerationSizeMb: 384, stackSizeMb: 4 } });
    } catch { return emptyTypeScriptQuery(revision, 'worker_failed'); }
    return new Promise(resolve => {
      let teardown: Promise<void> | undefined;
      const failed = emptyTypeScriptQuery(revision, 'worker_failed');
      const finish = (result: TypeScriptQueryOutput) => teardown ??= (async () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        await worker.terminate().catch(() => undefined);
        this.active.delete(worker);
        resolve(result);
      })();
      const abort = () => { void finish(emptyTypeScriptQuery(revision, 'cancelled')); };
      const timer = setTimeout(() => { void finish(emptyTypeScriptQuery(revision, 'worker_timeout')); }, this.timeoutMs);
      this.active.set(worker, () => finish(emptyTypeScriptQuery(revision, 'cancelled')));
      worker.once('message', raw => {
        const reply = typescriptQueryOutputSchema.safeParse(raw);
        void finish(reply.success && reply.data.revision === revision ? reply.data : failed);
      });
      worker.once('error', () => { void finish(failed); });
      worker.once('exit', () => { void finish(failed); });
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.all([...this.active.values()].map(stop => stop()));
  }
}
