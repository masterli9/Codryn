import { parentPort, workerData } from 'node:worker_threads';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { typescriptQueryInputSchema } from '@codryn/shared';
import { ContextPathPolicy, ContextPathPolicyError } from '../filesystem/context-path-policy.js';
import { executeTypeScriptQuery } from './typescript-query-engine.js';
import { emptyTypeScriptQuery } from './typescript-query-result.js';

const requestSchema = z.object({
  root: z.string().max(4096).refine(isAbsolute), standardLibrary: z.string().max(4096).refine(isAbsolute),
  input: typescriptQueryInputSchema, revision: z.number().int().nonnegative()
}).strict();
const request = requestSchema.parse(workerData);
if (!parentPort) throw new Error('R4_TYPESCRIPT_WORKER_REQUIRED');
const port = parentPort;
void ContextPathPolicy.fromProjectRoot(request.root).then(policy => executeTypeScriptQuery(request.input, {
  root: request.root, standardLibrary: request.standardLibrary, policy, expectedRevision: request.revision, signal: AbortSignal.timeout(5000)
})).catch((error: unknown) => error instanceof ContextPathPolicyError
  ? emptyTypeScriptQuery(request.revision, 'policy_invalid', 'unsupported')
  : emptyTypeScriptQuery(request.revision, 'worker_failed')).then(reply => port.postMessage(reply));
