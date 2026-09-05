import { randomUUID } from 'node:crypto';
import { runAgentResultSchema, type RunAgentRequest, type RunAgentResult } from '@codryn/shared';
import { parseArguments } from './arguments.js';
import { createCliInfrastructure } from './composition-root.js';

type Infrastructure = { readonly agentLoop: { execute(request: RunAgentRequest, signal: AbortSignal): Promise<RunAgentResult> }; close(): void };
export interface CliDependencies {
  createInfrastructure(input: { readonly userDataPath: string; readonly projectRoot: string; readonly scenario: 'read-search-summary' }): Promise<Infrastructure>;
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
    const result = await infrastructure.agentLoop.execute({ requestId: randomUUID(), projectRoot: input.projectRoot, task: input.task, contextReferences: [...input.contextReferences], maxSteps: input.maxSteps }, controller.signal);
    dependencies.writeStdout(`${JSON.stringify(runAgentResultSchema.parse(result))}\n`);
    return result.status === 'completed' ? 0 : 1;
  } catch { dependencies.writeStderr('R1 CLI execution failed.\n'); return 1; }
  finally { try { infrastructure?.close(); } finally { removeSigint(); } }
}

if (process.argv[1]?.endsWith('/index.ts') || process.argv[1]?.endsWith('\\index.ts')) {
  runCli(defaults, process.argv.slice(2)).then((exitCode) => { process.exitCode = exitCode; });
}
