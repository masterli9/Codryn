import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createR1Infrastructure, createR2Infrastructure, UuidGenerator } from '@codryn/infrastructure';
import type { PermissionView } from '@codryn/shared';
import type { CliArguments } from './arguments.js';
import { formatPermissionPrompt, parsePermissionAnswer } from './permission-prompt.js';
import { readSearchSummaryScenario } from './scenarios/read-search-summary.js';

async function prompt(view: PermissionView): Promise<'allow_once' | 'deny'> {
  process.stderr.write(formatPermissionPrompt(view));
  const readline = createInterface({ input: stdin, output: stdout });
  try { return parsePermissionAnswer(await readline.question('')); }
  finally { readline.close(); }
}

export async function createCliInfrastructure(input: CliArguments) {
  const ids = new UuidGenerator();
  if (input.scenario === 'change-verify-return') {
    return createR2Infrastructure({
      ...input,
      scenario: 'change-verify-return',
      permissionResponder: prompt
    });
  }
  const infrastructure = await createR1Infrastructure({
    ...input,
    ids,
    scenario: readSearchSummaryScenario({ first: ids.next(), second: ids.next() })
  });
  return { agentLoop: { execute: (request: Parameters<typeof infrastructure.agentLoop.execute>[0], signal: AbortSignal) => infrastructure.agentLoop.execute(request, signal) }, close: infrastructure.close };
}
