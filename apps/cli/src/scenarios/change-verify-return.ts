import type { FakeScenario } from '@codryn/infrastructure';
import type { ModelRequest, Uuid } from '@codryn/shared';

const callIds = Object.freeze({
  search: '00000000-0000-4000-8000-000000000011' as Uuid,
  read: '00000000-0000-4000-8000-000000000012' as Uuid,
  patch: '00000000-0000-4000-8000-000000000013' as Uuid,
  command: '00000000-0000-4000-8000-000000000014' as Uuid
});

function result(request: ModelRequest, index: number): Record<string, unknown> {
  const value = request.previousToolResults[index];
  if (!value?.ok || typeof value.output !== 'object' || value.output === null || Array.isArray(value.output)) throw new Error('scenario');
  return value.output as Record<string, unknown>;
}

function assertHistory(request: ModelRequest, expected: number, previousResults: number): void {
  if (request.history?.length !== expected || request.previousToolResults.length !== previousResults) throw new Error('scenario');
}

export function changeVerifyReturnScenario(input: { readonly expectedHash: string; readonly projectRoot: string; readonly runtimeExecutable?: string; readonly callIds?: Readonly<typeof callIds> }): FakeScenario {
  const ids = input.callIds ?? callIds;
  const runtimeExecutable = input.runtimeExecutable ?? process.execPath;
  return {
    id: 'change-verify-return',
    steps: [
      { assertRequest(request) { if (request.context.length !== 0) throw new Error('scenario'); assertHistory(request, 0, 0); }, events: [{ type: 'tool_call', call: { callId: ids.search, toolId: 'text.search', toolVersion: 1, arguments: { query: 'return a - b', path: '.' } } }, { type: 'completed' }] },
      { assertRequest(request) { assertHistory(request, 2, 1); const search = result(request, 0); if (search.truncated !== false || !Array.isArray(search.matches) || !search.matches.some((match) => typeof match === 'object' && match !== null && (match as { path?: unknown }).path === 'sum.mjs')) throw new Error('scenario'); }, events: [{ type: 'tool_call', call: { callId: ids.read, toolId: 'file.read', toolVersion: 1, arguments: { path: 'sum.mjs' } } }, { type: 'completed' }] },
      { assertRequest(request) { assertHistory(request, 4, 2); const read = result(request, 1); if (read.path !== 'sum.mjs' || read.contentHash !== input.expectedHash || read.content !== 'export function sum(a, b) { return a - b; }\n') throw new Error('scenario'); }, events: [{ type: 'tool_call', call: { callId: ids.patch, toolId: 'file.patch', toolVersion: 1, arguments: { path: 'sum.mjs', expectedHash: input.expectedHash, edits: [{ oldText: 'export function sum(a, b) { return a - b; }\n', newText: 'export function sum(a, b) { return a + b; }\n' }] } } }, { type: 'completed' }] },
      { assertRequest(request) { assertHistory(request, 6, 3); const patch = result(request, 2); if (patch.status !== 'applied' || patch.path !== 'sum.mjs') throw new Error('scenario'); }, events: [{ type: 'tool_call', call: { callId: ids.command, toolId: 'command.run', toolVersion: 1, arguments: { command: { executable: runtimeExecutable, args: ['--test', 'sum.test.mjs'], cwd: input.projectRoot, timeoutMs: 30_000, maxOutputBytes: 256 * 1024 }, reason: 'Verify the repaired fixture.', impact: 'Runs the targeted project test once.' } } }, { type: 'completed' }] },
      { assertRequest(request) { assertHistory(request, 8, 4); const command = result(request, 3); if (command.status !== 'succeeded' || command.exitCode !== 0 || command.treeStopped !== true || command.truncated !== false) throw new Error('scenario'); }, events: [{ type: 'text_delta', text: 'Oprava byla aplikována a cílený test ji ověřil.' }, { type: 'completed' }] }
    ]
  };
}

export { callIds };
