import { randomUUID } from 'node:crypto';
import { r2RunResultSchema, runAgentResultSchema, type RunAgentRequest, type RunAgentResult, type R2RunResult } from '@codryn/shared';
import { parseArguments, type CliArguments } from './arguments.js';
import { createCliInfrastructure } from './composition-root.js';

type Infrastructure = { readonly agentLoop: { execute?(request: RunAgentRequest, signal: AbortSignal): Promise<RunAgentResult>; executeR2?(request: RunAgentRequest, signal: AbortSignal): Promise<R2RunResult> }; close(): void };
export interface CliDependencies {
  createInfrastructure(input: CliArguments): Promise<Infrastructure>;
  writeStdout(line: string): void;
  writeStderr(line: string): void;
  createAbortController(): AbortController;
  onSigint?(listener: () => void): () => void;
}
const defaults: CliDependencies = { createInfrastructure: createCliInfrastructure, writeStdout: (line) => process.stdout.write(line), writeStderr: (line) => process.stderr.write(line), createAbortController: () => new AbortController(), onSigint(listener) { process.once('SIGINT', listener); return () => process.off('SIGINT', listener); } };

export async function runCli(dependencies: CliDependencies, argv: readonly string[]): Promise<number> {
  let input;
  try { input = parseArguments(argv); } catch { dependencies.writeStderr('Invalid R1 CLI arguments.\n'); return 2; }
  const controller = dependencies.createAbortController();
  const removeSigint = dependencies.onSigint?.(() => controller.abort()) ?? (() => {});
  let infrastructure: Infrastructure | undefined;
  try {
    infrastructure = await dependencies.createInfrastructure(input);
    const request = { requestId: randomUUID(), projectRoot: input.projectRoot, task: input.task, contextReferences: [...input.contextReferences], maxSteps: input.maxSteps };
    const result = input.scenario === 'change-verify-return'
      ? await infrastructure.agentLoop.executeR2?.(request, controller.signal)
      : await infrastructure.agentLoop.execute?.(request, controller.signal);
    if (result === undefined) throw new Error('CLI profile is not available.');
    dependencies.writeStdout(`${JSON.stringify(input.scenario === 'change-verify-return' ? r2RunResultSchema.parse(result) : runAgentResultSchema.parse(result))}\n`);
    return result.status === 'completed' ? 0 : 1;
  } catch { dependencies.writeStderr('R1 CLI execution failed.\n'); return 1; }
  finally { try { infrastructure?.close(); } finally { removeSigint(); } }
}

if (process.argv[1]?.endsWith('/index.ts') || process.argv[1]?.endsWith('\\index.ts')) {
  runCli(defaults, process.argv.slice(2)).then((exitCode) => { process.exitCode = exitCode; });
}
