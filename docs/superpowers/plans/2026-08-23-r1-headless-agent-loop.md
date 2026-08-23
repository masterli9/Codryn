# R1 Headless Agent Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic, read-only R1 agent loop behind a thin internal CLI, with persisted audit events, bounded project tools, and a scripted fake provider that passes the reference scenario ten times out of ten.

**Architecture:** `apps/cli` validates process input and calls one `RunAgentLoop` application service. `backend/core` owns orchestration, state transitions, context assembly, tool registration, permission decisions, and the execution harness; `backend/infrastructure` owns SQLite, filesystem access, and the scripted adapter. Shared Zod schemas are the serializable boundary, and every persisted transition is atomic with its canonical event.

**Tech Stack:** Node.js 24.19.0, npm 11.x workspaces, TypeScript 6.0.3, Zod 4.4.3, `node:sqlite`, Vitest 4.1.7, dependency-cruiser 18.1.0, Windows 11 x64.

**Spec:** `docs/superpowers/specs/2026-08-23-r1-headless-agent-loop-design.md`

## Global Constraints

- Preserve workspace boundaries: `apps/desktop`, `apps/cli`, `backend/core`, `backend/infrastructure`, `shared`, and `tests/support`.
- `backend/core` must not import Electron, `node:sqlite`, `node:fs`, `node:child_process`, or concrete adapters.
- Production code must not import `@codryn/test-support`; fixtures enter only through tests or explicit CLI arguments.
- The CLI is internal and owns no orchestration, tool, permission, or persistence rules.
- R1 is read-only: do not add patch, shell, diff, snapshot, verification, real-provider, Electron UI, or `.codrynignore` behavior.
- Validate every process, provider, tool, persistence, and serialization boundary.
- Do not persist full file contents, absolute personal project roots, environment values, or secrets in events or public errors.
- Use Node 24.19.0 and npm 11.x exactly as enforced by the repository.
- Implement test-first and stage only files named by the current task.
- Process-tree tests remain subject to the documented unsandboxed Windows boundary; R1 itself adds no process-tree behavior.

---

## Planned File Map

```text
apps/cli/
  package.json                         private workspace and CLI scripts
  tsconfig.json                        Node TypeScript boundary
  src/arguments.ts                     strict argv parser
  src/composition-root.ts              R1 infrastructure + core assembly
  src/index.ts                         process adapter and exit codes
  src/scenarios/read-search-summary.ts built-in deterministic scenario
  test/arguments.test.ts               CLI input contract
  test/index.test.ts                   stdout/stderr/exit behavior

backend/core/src/agent/
  model.ts                             internal run, context, and projection types
  ports.ts                             model, filesystem, run, and tool-store ports
  model-response-collector.ts          validated stream aggregation
  context-assembler.ts                 explicit-reference assembly
  run-agent-loop.ts                    single orchestration source of truth
backend/core/src/tools/
  read-only-contracts.ts               file.read@1 and text.search@1 schemas
  tool-registry.ts                     versioned registry and schema export
  controlled-permission-policy.ts      R1 read-only policy
  tool-execution-harness.ts            validate, authorize, execute, normalize

backend/infrastructure/src/model/
  scripted-model-adapter.ts            deterministic network-free adapter
backend/infrastructure/src/filesystem/
  project-filesystem.ts                bounded realpath-safe read/search
  sensitive-path-policy.ts             fixed R1 exclusions
backend/infrastructure/src/persistence/
  sqlite-agent-run-store.ts            atomic run transition + event
  sqlite-tool-call-store.ts            atomic tool transition + event
backend/infrastructure/src/create-r1-infrastructure.ts

shared/src/
  r1-agent.ts                          CLI request/result schemas
  model-contract.ts                    provider stream schemas
  tool-contract.ts                     serializable tool call/result schemas

tests/support/fixtures/r1-project/      deterministic TypeScript fixture
tests/r1/repeatability.test.ts          ten-run semantic acceptance
scripts/verify-r1-repeatability.mjs     focused repeatability command
scripts/verify-r1.mjs                   one-command R1 gate
docs/architecture/r1-agent-loop.md      implemented boundaries and flow
docs/decisions/0003-generic-sessions.md persistence evolution ADR
docs/r1-author-checklist.md             author-understanding gate
```

---

### Task 1: Shared R1 Contracts and Canonical State Graphs

**Files:**
- Create: `shared/src/r1-agent.ts`
- Create: `shared/src/model-contract.ts`
- Create: `shared/src/tool-contract.ts`
- Create: `shared/test/r1-agent.test.ts`
- Create: `shared/test/model-contract.test.ts`
- Create: `shared/test/tool-contract.test.ts`
- Modify: `shared/src/index.ts`
- Modify: `backend/core/src/state/agent-run.ts`
- Modify: `backend/core/src/state/tool-call.ts`
- Modify: `backend/core/test/state-machines.test.ts`

**Interfaces:**
- Produces: `RunAgentRequest`, `RunAgentResult`, `ModelDescriptor`, `ModelRequest`, `ModelStreamEvent`, `ModelToolCall`, `ToolResult`, and their strict Zod schemas.
- Produces: canonical `AgentRunState` and `ToolCallState` graphs used by stores and orchestration.

- [ ] **Step 1: Add failing schema tests**

Test strict success and rejection, including the completed-result discriminator:

```ts
expect(runAgentResultSchema.parse({
  schemaVersion: 1,
  runId,
  status: 'completed',
  stepCount: 3,
  finalText: 'Hotovo.',
  verification: { status: 'not_applicable', reason: 'R1_READ_ONLY_RUN' }
})).toMatchObject({ status: 'completed', finalText: 'Hotovo.' });

expect(() => runAgentResultSchema.parse({
  schemaVersion: 1, runId, status: 'completed', stepCount: 3,
  verification: { status: 'not_applicable', reason: 'R1_READ_ONLY_RUN' }
})).toThrow();
```

Also reject unknown keys, absolute context references, `maxSteps` outside `1..32`, a model stream without a valid event type, and non-JSON tool arguments/results.

- [ ] **Step 2: Run the focused tests and observe missing modules**

Run: `npm test -- shared/test/r1-agent.test.ts shared/test/model-contract.test.ts shared/test/tool-contract.test.ts`

Expected: FAIL because the three modules do not exist.

- [ ] **Step 3: Implement strict shared schemas**

Use these exact top-level shapes:

```ts
export const runAgentRequestSchema = z.object({
  requestId: uuidSchema,
  projectRoot: z.string().min(1),
  task: z.string().trim().min(1).max(16_384),
  contextReferences: z.array(z.string().min(1)).max(8),
  maxSteps: z.number().int().min(1).max(32)
}).strict();

export const modelToolCallSchema = z.object({
  callId: uuidSchema,
  toolId: z.string().min(1),
  toolVersion: z.number().int().positive(),
  arguments: jsonValueSchema
}).strict();

export const toolResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), callId: uuidSchema, output: jsonValueSchema }).strict(),
  z.object({
    ok: z.literal(false), callId: uuidSchema,
    error: z.object({ code: z.string().min(1), message: z.string().min(1) }).strict()
  }).strict()
]);
```

Model capabilities use `'supported' | 'unsupported' | 'unknown'`; `ModelStreamEvent` is a discriminated union of `text_delta`, `tool_call`, `usage`, `completed`, and `failed`. Export all three modules from `shared/src/index.ts`.

- [ ] **Step 4: Replace the R0 state graphs with PRD-compatible graphs**

Set `AgentRun` states to `idle`, `preparing_context`, `waiting_for_model`, `waiting_for_user_input`, `waiting_for_approval`, `executing_tool`, `verifying`, `completed`, `cancelled`, `failed`. Set `ToolCall` transitions exactly as approved in the spec, including validation failures from `received`/`schema_validated` to `failed`.

- [ ] **Step 5: Extend transition tests**

Assert all R1 happy-path transitions, validation-failure branches, permission denial, cancellation branches, and no outgoing transition from every terminal state. Keep all existing R0 expectations that remain semantically valid.

- [ ] **Step 6: Run contracts, core state tests, typecheck, and lint**

Run:

```powershell
npm test -- shared/test backend/core/test/state-machines.test.ts
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add shared/src shared/test backend/core/src/state backend/core/test/state-machines.test.ts
git commit -m "feat(r1): define agent loop contracts and states"
```

---

### Task 2: Generic Session Migration and Atomic Agent Persistence

**Files:**
- Create: `backend/core/src/agent/model.ts`
- Create: `backend/core/src/agent/ports.ts`
- Modify: `backend/core/src/index.ts`
- Modify: `backend/infrastructure/src/persistence/migrations.ts`
- Modify: `backend/infrastructure/src/persistence/sqlite-session-repository.ts`
- Modify: `backend/infrastructure/src/persistence/sqlite-event-store.ts`
- Create: `backend/infrastructure/src/persistence/sqlite-agent-run-store.ts`
- Create: `backend/infrastructure/src/persistence/sqlite-tool-call-store.ts`
- Modify: `backend/infrastructure/src/index.ts`
- Modify: `backend/infrastructure/test/sqlite.test.ts`

**Interfaces:**
- Produces: `AgentRunRecord`, `ToolCallRecord`, `AgentRunStore`, and `ToolCallStore`.
- Produces: migration version 2 with generic `sessions`, preserved R0 rows, `agent_runs`, `tool_calls`, and shared `events` FK.

- [ ] **Step 1: Write migration-preservation tests**

Create a version-1 database, insert the existing R0 `DiagnosticSession` and event, then run the new migrations and assert:

```ts
expect(database.prepare('SELECT id, kind FROM sessions').all()).toEqual([
  { id: session.id, kind: 'diagnostic' }
]);
await expect(new SqliteSessionRepository(database).findById(session.id)).resolves.toEqual(session);
await expect(new SqliteEventStore(database).findBySessionId(session.id)).resolves.toEqual([initialEvent]);
expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
```

Also assert event `sequence`, `event_id`, and payload are unchanged and migration 2 is idempotent.

- [ ] **Step 2: Write atomic store tests**

Define a run in state `idle` and require `createWithInitialEvent`, then transition it to `preparing_context` with one event. Force duplicate event IDs and assert both projection and event transaction roll back. Repeat for a tool call from `received` to `schema_validated`.

- [ ] **Step 3: Run the focused SQLite tests and observe failure**

Run: `npm test -- backend/infrastructure/test/sqlite.test.ts`

Expected: FAIL because migration 2 and the stores do not exist.

- [ ] **Step 4: Define core persistence records and ports**

Use these exact operations:

```ts
export interface AgentRunStore {
  createWithInitialEvent(run: AgentRunRecord, event: EventEnvelope): Promise<void>;
  transitionWithEvent(input: {
    readonly runId: Uuid; readonly from: AgentRunState; readonly to: AgentRunState;
    readonly stepCount: number; readonly failureCode?: AgentRunFailureCode;
    readonly updatedAt: IsoTimestamp; readonly event: EventEnvelope;
  }): Promise<void>;
  findById(runId: Uuid): Promise<AgentRunRecord | null>;
}

export interface ToolCallStore {
  createWithInitialEvent(call: ToolCallRecord, event: EventEnvelope): Promise<void>;
  transitionWithEvent(input: {
    readonly callId: Uuid; readonly from: ToolCallState; readonly to: ToolCallState;
    readonly permissionResult?: 'allowed_by_rule' | 'denied';
    readonly safeResult?: JsonValue; readonly errorCode?: string;
    readonly updatedAt: IsoTimestamp; readonly event: EventEnvelope;
  }): Promise<void>;
}
```

Store methods must compare the persisted `from` state and update exactly one row; zero updated rows is `R1_PERSISTENCE_FAILED`.

- [ ] **Step 5: Implement checksummed migration 2**

Within one SQL migration: create `sessions_new`, copy diagnostics as kind `diagnostic`, rebuild `diagnostic_sessions` and `events` with FKs, rename them, then create strict `agent_runs` and `tool_calls` tables plus indexes on run/event sequence and run/tool creation order. Preserve R0 event sequence values explicitly. Run `PRAGMA foreign_key_check` after the transaction in the migration runner.

- [ ] **Step 6: Implement SQLite stores with transaction ownership checks**

Use `BEGIN IMMEDIATE`, insert/update projection and event, then `COMMIT`. On failure, roll back only if the store started the transaction. Parse every row through strict validators before returning it. Never persist raw exceptions.

- [ ] **Step 7: Run SQLite tests and the full R0 suite**

Run:

```powershell
npm test -- backend/infrastructure/test/sqlite.test.ts
npm test
npm run typecheck
```

Expected: PASS, including existing R0 migration, backup, reopen, and diagnostic tests.

- [ ] **Step 8: Commit**

```powershell
git add backend/core/src/agent backend/core/src/index.ts backend/infrastructure/src/persistence backend/infrastructure/src/index.ts backend/infrastructure/test/sqlite.test.ts
git commit -m "feat(r1): persist generic agent sessions and tool calls"
```

---

### Task 3: Provider Contract Collector and Scripted Fake Adapter

**Files:**
- Create: `backend/core/src/agent/model-response-collector.ts`
- Create: `backend/core/test/model-response-collector.test.ts`
- Create: `backend/infrastructure/src/model/scripted-model-adapter.ts`
- Create: `backend/infrastructure/test/scripted-model-adapter.test.ts`
- Modify: `backend/core/src/agent/ports.ts`
- Modify: `backend/core/src/index.ts`
- Modify: `backend/infrastructure/src/index.ts`

**Interfaces:**
- Consumes: shared `ModelRequest`, `ModelStreamEvent`, and `ModelDescriptor`.
- Produces: `ModelAdapter.stream(request, signal)` and `collectModelResponse()` returning exactly `{ kind: 'final'; text; usage? }` or `{ kind: 'tool_calls'; calls; usage? }`.

- [ ] **Step 1: Write collector tests**

Cover joined text deltas, one and multiple tool calls, usage, terminal adapter failure, missing terminal event, duplicate completion, final text mixed with calls, and abort. Mixed output must return `R1_MODEL_RESPONSE_UNSUPPORTED`.

- [ ] **Step 2: Write scripted-adapter tests**

Create a two-turn scenario and assert emitted events exactly. Call it with a mismatched tool list and mismatched previous result and require `R1_FAKE_SCENARIO_MISMATCH`. Spy on global `fetch` and assert it is never called.

- [ ] **Step 3: Run tests to observe missing implementations**

Run: `npm test -- backend/core/test/model-response-collector.test.ts backend/infrastructure/test/scripted-model-adapter.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement the collector**

Consume the async iterable once, validate every yielded value with `modelStreamEventSchema`, check abort before each event, aggregate no more than 64 KiB text and 32 tool calls, and require one terminal `completed` or `failed` event.

- [ ] **Step 5: Implement `ScriptedModelAdapter`**

Use immutable scenario steps:

```ts
export interface FakeScenarioStep {
  readonly assertRequest: (request: ModelRequest) => void;
  readonly events: readonly ModelStreamEvent[];
}

export interface FakeScenario {
  readonly id: string;
  readonly steps: readonly FakeScenarioStep[];
}
```

Clone and freeze input scenario arrays at construction. Advance one step only after request assertion succeeds. If exhausted or mismatched, yield a `failed` event with stable code and terminate.

- [ ] **Step 6: Run focused and workspace checks**

Run:

```powershell
npm test -- backend/core/test/model-response-collector.test.ts backend/infrastructure/test/scripted-model-adapter.test.ts
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add backend/core/src/agent backend/core/test/model-response-collector.test.ts backend/core/src/index.ts backend/infrastructure/src/model backend/infrastructure/test/scripted-model-adapter.test.ts backend/infrastructure/src/index.ts
git commit -m "feat(r1): add deterministic model adapter contract"
```

---

### Task 4: Bounded Project Filesystem

**Files:**
- Create: `backend/infrastructure/src/filesystem/sensitive-path-policy.ts`
- Create: `backend/infrastructure/src/filesystem/project-filesystem.ts`
- Create: `backend/infrastructure/test/project-filesystem.test.ts`
- Modify: `backend/core/src/agent/ports.ts`
- Modify: `backend/infrastructure/src/index.ts`

**Interfaces:**
- Produces: `ProjectFilesystem.readFile(input, signal)` and `searchText(input, signal)`.
- Produces: limits `1 MiB/file`, `64 KiB/read output`, `500 files`, `8 MiB/search`, `100 matches`, `400 chars/preview`.

- [ ] **Step 1: Write path-boundary and read tests**

Use a temporary root and an external sibling. Cover normal UTF-8, line ranges, truncation, absolute path, `..`, NUL, missing file, directory-as-file, invalid UTF-8, binary NUL, `.env`, `.git`, a symlink inside, and a symlink outside. Skip symlink creation only when Windows explicitly denies fixture symlink privilege; do not reinterpret that skip as a product pass.

- [ ] **Step 2: Write deterministic search tests**

Create files in reverse creation order and assert lexicographic output. Cover file and directory scope, exact case-sensitive columns, max results, preview length, byte/file limits, ignored directories, binary files, symlinks, and abort.

- [ ] **Step 3: Run tests to observe missing adapter**

Run: `npm test -- backend/infrastructure/test/project-filesystem.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement fixed R1 sensitive-path policy**

Deny path segments `.git`, `node_modules`, `dist`, `build`, `out`, `.next`, `.cache`, `coverage`; deny basenames matching `.env`, `.env.*`, `id_rsa`, `id_ed25519`, `*.pem`, `*.key`, and known credential files. Return `{ allowed: false, code, reason }`, never a silent skip for explicit reads.

- [ ] **Step 5: Implement canonical path resolution**

Reject invalid relative syntax before IO. Resolve root once with `realpath`; for each existing target resolve its real path and compare with `relative(rootReal, targetReal)` so only `''` or a non-absolute path without leading `..` is accepted. Search uses `lstat`, never follows directory symlinks, and sorts directory entries before traversal.

- [ ] **Step 6: Implement bounded read and literal search**

Read bytes before UTF-8 decode, reject NUL/binary and invalid round-trip decoding, compute SHA-256 over the whole file, then apply line/output bounds. Search checks `AbortSignal` between files and lines and returns normalized relative `/` paths.

- [ ] **Step 7: Run focused checks**

Run:

```powershell
npm test -- backend/infrastructure/test/project-filesystem.test.ts
npm run typecheck
npm run lint
```

Expected: PASS with only the explicitly justified Windows symlink skip if privilege is unavailable.

- [ ] **Step 8: Commit**

```powershell
git add backend/core/src/agent/ports.ts backend/infrastructure/src/filesystem backend/infrastructure/test/project-filesystem.test.ts backend/infrastructure/src/index.ts
git commit -m "feat(r1): add bounded read-only project filesystem"
```

---

### Task 5: Explicit Context Assembly

**Files:**
- Create: `backend/core/src/agent/context-assembler.ts`
- Create: `backend/core/test/context-assembler.test.ts`
- Modify: `backend/core/src/agent/model.ts`
- Modify: `backend/core/src/index.ts`

**Interfaces:**
- Consumes: `ProjectFilesystem`, task, project identity, and up to eight relative references.
- Produces: `AssembledContext { modelContent, sources, totalBytes }`, where source metadata contains path, SHA-256, bytes, and `explicit_reference`.

- [ ] **Step 1: Write failing context tests**

Assert ordered assembly, normalized duplicate rejection, eight-reference boundary, 128 KiB total boundary, forbidden reference failure, abort, and audit metadata that does not contain file content or project root.

- [ ] **Step 2: Run focused test**

Run: `npm test -- backend/core/test/context-assembler.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement `ContextAssembler`**

Normalize references to forward-slash relative paths, reject duplicates before reading, call the injected filesystem sequentially, sum UTF-8 byte lengths, and fail the whole assembly with `R1_CONTEXT_LIMIT_EXCEEDED` rather than silently dropping a reference.

- [ ] **Step 4: Verify focused and core tests**

Run:

```powershell
npm test -- backend/core/test/context-assembler.test.ts
npm test -- backend/core/test
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/core/src/agent/context-assembler.ts backend/core/src/agent/model.ts backend/core/test/context-assembler.test.ts backend/core/src/index.ts
git commit -m "feat(r1): assemble explicit bounded context"
```

---

### Task 6: Versioned Tool Registry and Controlled Permission Policy

**Files:**
- Create: `backend/core/src/tools/read-only-contracts.ts`
- Create: `backend/core/src/tools/tool-registry.ts`
- Create: `backend/core/src/tools/controlled-permission-policy.ts`
- Create: `backend/core/test/tool-registry.test.ts`
- Create: `backend/core/test/controlled-permission-policy.test.ts`
- Modify: `backend/core/src/index.ts`

**Interfaces:**
- Produces: `file.read@1`, `text.search@1`, `ToolDefinition`, `ToolRegistry`, and `ControlledPermissionPolicy.decide()`.
- Produces: JSON Schema generated from each definition's Zod schema.

- [ ] **Step 1: Write registry tests**

Assert registration and lookup by ID/version, duplicate rejection, generated JSON Schema, strict argument/output validation, and immutable public descriptors without handlers.

- [ ] **Step 2: Write policy tests**

Require `allowed_by_rule` with `R1_SAFE_READ_WITHIN_PROJECT` only for risk `read_project` after validated path evidence. Unknown risk, invalid evidence, and sensitive/outside-root evidence must return `denied` with a stable reason.

- [ ] **Step 3: Run tests to observe failure**

Run: `npm test -- backend/core/test/tool-registry.test.ts backend/core/test/controlled-permission-policy.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement exact read-only schemas**

Implement the input and output shapes from the spec with `.strict()`. Defaults are applied only for omitted optional fields, never malformed values. Generate JSON Schema from the same input schema using Zod's JSON-schema conversion.

- [ ] **Step 5: Implement registry and policy**

Freeze registrations at construction. Registry lookup returns a definition or `R1_TOOL_UNKNOWN`; it never guesses a version. Permission decisions include `result`, `ruleId`, and `reason` and contain no file content.

- [ ] **Step 6: Run checks and commit**

Run:

```powershell
npm test -- backend/core/test/tool-registry.test.ts backend/core/test/controlled-permission-policy.test.ts
npm run typecheck
npm run lint
```

Then:

```powershell
git add backend/core/src/tools backend/core/test/tool-registry.test.ts backend/core/test/controlled-permission-policy.test.ts backend/core/src/index.ts
git commit -m "feat(r1): register and authorize read-only tools"
```

---

### Task 7: Audited Tool Execution Harness

**Files:**
- Create: `backend/core/src/tools/tool-execution-harness.ts`
- Create: `backend/core/test/tool-execution-harness.test.ts`
- Modify: `backend/core/src/agent/model.ts`
- Modify: `backend/core/src/index.ts`

**Interfaces:**
- Consumes: `ToolRegistry`, `ControlledPermissionPolicy`, `ToolCallStore`, `Clock`, and `IdGenerator`.
- Produces: `ToolExecutionHarness.execute(call, runId, signal): Promise<ToolResult>`.

- [ ] **Step 1: Write the happy-path lifecycle test**

Use fakes to require states/events in this order:

```text
received -> schema_validated -> permission_decided -> queued -> running -> succeeded
```

Assert the handler receives parsed/defaulted input exactly once and the successful result is output-schema validated.

- [ ] **Step 2: Write rejection and failure tests**

Cover unknown tool, invalid input, policy denial, handler throw, invalid handler output, abort before running, and abort during handler. For unknown/invalid calls assert handler invocation count `0`; for denied calls assert state never reaches `queued`.

- [ ] **Step 3: Run test to observe missing harness**

Run: `npm test -- backend/core/test/tool-execution-harness.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement lifecycle helpers**

Create one event factory that uses injected clock/IDs, `source: 'core'`, run correlation ID, and metadata-only payloads. Persist each transition through `ToolCallStore.transitionWithEvent`; do not append a second standalone event for the same transition.

- [ ] **Step 5: Implement execution and normalization**

Catch handler exceptions and map them to `R1_TOOL_EXECUTION_FAILED`; never expose `Error.message`. Validation failures return `R1_TOOL_INPUT_INVALID` or `R1_TOOL_OUTPUT_INVALID`. Safe result persisted in `tool_calls` is a bounded metadata projection; the full validated output exists only in the returned in-memory `ToolResult`.

- [ ] **Step 6: Run checks and commit**

Run:

```powershell
npm test -- backend/core/test/tool-execution-harness.test.ts
npm run typecheck
npm run lint
```

Then:

```powershell
git add backend/core/src/tools/tool-execution-harness.ts backend/core/src/agent/model.ts backend/core/test/tool-execution-harness.test.ts backend/core/src/index.ts
git commit -m "feat(r1): execute read-only tools through audited harness"
```

---

### Task 8: `RunAgentLoop` Happy Path, Failures, and Cancellation

**Files:**
- Create: `backend/core/src/agent/run-agent-loop.ts`
- Create: `backend/core/test/run-agent-loop.test.ts`
- Modify: `backend/core/src/index.ts`

**Interfaces:**
- Consumes: `ContextAssembler`, `ModelAdapter`, `ToolRegistry`, `ToolExecutionHarness`, `AgentRunStore`, `Clock`, and `IdGenerator`.
- Produces: `RunAgentLoop.execute(request, signal): Promise<RunAgentResult>`.

- [ ] **Step 1: Write the three-turn happy-path test**

Fake context, model stream, harness, stores, clock, and IDs. Require search call, read call, final text, `stepCount: 3`, `status: completed`, and `verification: { status: 'not_applicable', reason: 'R1_READ_ONLY_RUN' }`. Assert model request history contains full tool outputs in memory while persisted events contain no fixture content.

- [ ] **Step 2: Write orchestration failure tests**

Cover invalid input before persistence, context failure, missing tool-calling capability, unsupported mixed model response, adapter failure, tool failure returned to the next model turn, max-step stop before an extra adapter call, persistence failure, invalid state transition, and duplicate model call ID.

- [ ] **Step 3: Write cancellation tests**

Abort during context assembly, adapter wait, and tool execution. Each test requires exactly one terminal `agent_run.cancelled` event and no operation after cancellation.

- [ ] **Step 4: Run test to observe missing service**

Run: `npm test -- backend/core/test/run-agent-loop.test.ts`

Expected: FAIL.

- [ ] **Step 5: Implement event-first run creation and transitions**

Validate the request, create run ID/correlation ID, persist `idle` plus `agent_run.created`, then transition through `preparing_context`. Every later transition uses `AgentRunStore.transitionWithEvent`. Keep the in-memory state only after persistence succeeds so memory never gets ahead of SQLite.

- [ ] **Step 6: Implement the sequential loop**

Before each adapter call check abort and `stepCount < maxSteps`; transition to `waiting_for_model`, increment only after a terminal model response, collect it, then either complete or execute tool calls sequentially. After tool results, return to `waiting_for_model` with accumulated conversation. Reject final empty text.

- [ ] **Step 7: Implement stable failure mapping**

Map known R1 failures without changing code/message. Map unknown values to `R1_INTERNAL_ERROR`; log only through the injected redacting logger port. A failed persistence write may prevent a final event, so return `R1_PERSISTENCE_FAILED` and never claim the projection was updated.

- [ ] **Step 8: Run core and workspace checks**

Run:

```powershell
npm test -- backend/core/test/run-agent-loop.test.ts
npm test -- backend/core/test
npm run typecheck
npm run lint
npm run check:deps
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add backend/core/src/agent/run-agent-loop.ts backend/core/test/run-agent-loop.test.ts backend/core/src/index.ts
git commit -m "feat(r1): orchestrate deterministic read-only agent runs"
```

---

### Task 9: R1 Infrastructure Bundle and Thin CLI

**Files:**
- Create: `backend/infrastructure/src/create-r1-infrastructure.ts`
- Modify: `backend/infrastructure/src/index.ts`
- Create: `apps/cli/package.json`
- Create: `apps/cli/tsconfig.json`
- Create: `apps/cli/src/arguments.ts`
- Create: `apps/cli/src/composition-root.ts`
- Create: `apps/cli/src/index.ts`
- Create: `apps/cli/src/scenarios/read-search-summary.ts`
- Create: `apps/cli/test/arguments.test.ts`
- Create: `apps/cli/test/index.test.ts`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `createR1Infrastructure({ userDataPath, projectRoot, scenario })` with one DB connection and idempotent `close()`.
- Produces: `parseArguments(argv)` and `runCli(dependencies, argv): Promise<number>`.

- [ ] **Step 1: Write argument parser tests**

Test the exact six arguments from the spec, repeated context up to eight, default max steps 8, and rejection of unknown flags, missing values, duplicate scalar flags, relative absolute-path arguments, unsupported scenario, and out-of-range steps.

- [ ] **Step 2: Write CLI behavior tests**

Inject a fake composition root. Assert one request, one JSON line on stdout, no stdout on input error, fixed stderr without stack/path, and exit codes `0`, `1`, and `2`. Assert SIGINT aborts the supplied controller once.

- [ ] **Step 3: Run tests to observe missing CLI**

Run: `npm test -- apps/cli/test`

Expected: FAIL.

- [ ] **Step 4: Add the private CLI workspace**

Use package name `@codryn/cli`, `type: module`, `private: true`, dependencies on core/infrastructure/shared `0.0.0`, and scripts `typecheck` plus `start:r1` using Node's TypeScript execution path already supported by Node 24. Do not add a second transpiler dependency.

- [ ] **Step 5: Compose infrastructure once**

Open `<userDataPath>/codryn.sqlite`, run migrations, construct shared clock/IDs/logger, stores, `ProjectFilesystem`, scripted adapter, registry entries, permission policy, harness, context assembler, and one `RunAgentLoop`. Register handlers that delegate only to `ProjectFilesystem.readFile` and `searchText`.

- [ ] **Step 6: Implement the built-in scenario**

The scenario asserts `README.md` context, emits `text.search@1` for `formatGreeting`, asserts ordered matches, emits `file.read@1` for `src/greeting.ts`, then returns the fixed Czech summary `Funkce formatGreeting je definovaná v src/greeting.ts a používá se v src/index.ts.`

- [ ] **Step 7: Implement process entry**

`index.ts` calls `runCli`, sets `process.exitCode`, and never calls `process.exit()` during normal completion. Register and remove a single SIGINT listener in `finally`. Serialize results through `runAgentResultSchema` before stdout.

- [ ] **Step 8: Install workspace links and run checks**

Run:

```powershell
npm install --ignore-scripts
npm test -- apps/cli/test
npm run typecheck
npm run lint
npm run check:deps
```

Expected: lockfile contains `apps/cli`; all checks PASS.

- [ ] **Step 9: Commit**

```powershell
git add apps/cli backend/infrastructure/src/create-r1-infrastructure.ts backend/infrastructure/src/index.ts package-lock.json
git commit -m "feat(r1): expose agent loop through internal CLI"
```

---

### Task 10: Fixture and Ten-Run Semantic Repeatability Gate

**Files:**
- Create: `tests/support/fixtures/r1-project/README.md`
- Create: `tests/support/fixtures/r1-project/package.json`
- Create: `tests/support/fixtures/r1-project/src/greeting.ts`
- Create: `tests/support/fixtures/r1-project/src/index.ts`
- Create: `tests/support/fixtures/r1-project/src/preview.ts`
- Create: `tests/r1/repeatability.test.ts`
- Create: `scripts/verify-r1-repeatability.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: fixed fixture symbol `formatGreeting` with one definition and two references.
- Produces: `npm run test:r1-repeatability`.

- [ ] **Step 1: Add the deterministic fixture**

Keep it dependency-free. `greeting.ts` exports `formatGreeting(name: string): string`; `index.ts` and `preview.ts` import and call it. README describes the project but does not reveal the exact answer expected from search.

- [ ] **Step 2: Write the ten-run acceptance test**

For each run use a fresh user-data directory and deterministic clock/ID sequence. Invoke the same composition root used by CLI. Load events from SQLite and project them to:

```ts
interface SemanticEvent {
  readonly eventType: string;
  readonly state?: string;
  readonly toolId?: string;
  readonly toolVersion?: number;
  readonly permissionResult?: string;
  readonly outcome?: string;
}
```

Strip UUIDs, timestamps, duration, and database sequence only. Assert all ten semantic arrays equal the first and every result equals the fixed completed result with three steps.

- [ ] **Step 3: Run the test and fix only fixture/composition defects**

Run: `npm test -- tests/r1/repeatability.test.ts`

Expected: PASS 10/10. If it fails, do not weaken the semantic projection to hide differences.

- [ ] **Step 4: Add the focused script and package command**

`verify-r1-repeatability.mjs` uses `spawnSync` with `shell: false`, inherited stdio, Windows `npm.cmd`, and runs exactly the focused Vitest file. Add `"test:r1-repeatability": "node scripts/verify-r1-repeatability.mjs"`.

- [ ] **Step 5: Run fixture acceptance and full tests**

Run:

```powershell
npm run test:r1-repeatability
npm test
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add tests/support/fixtures/r1-project tests/r1 scripts/verify-r1-repeatability.mjs package.json
git commit -m "test(r1): prove ten-run agent loop repeatability"
```

---

### Task 11: Architecture Proof, ADR, Verification Command, and Author Gate

**Files:**
- Modify: `dependency-cruiser.config.mjs`
- Modify: `tests/architecture/dependency-rules.test.ts`
- Create: `docs/architecture/r1-agent-loop.md`
- Create: `docs/decisions/0003-generic-sessions.md`
- Create: `docs/r1-author-checklist.md`
- Create: `scripts/verify-r1.mjs`
- Modify: `package.json`
- Modify: `PROJECT_CONTEXT.md`

**Interfaces:**
- Produces: `npm run verify:r1` as the complete R1 gate.
- Produces: enforceable CLI/core/infrastructure dependency boundaries.

- [ ] **Step 1: Add failing architecture fixtures**

Extend the architecture test with temporary violations proving:

- `apps/cli/src/index.ts` cannot import `backend/infrastructure/src/persistence/*`;
- `backend/core` cannot import `node:fs/promises`;
- production cannot import the R1 fixture from `tests/support`.

Each deliberate violation must fail with the expected rule name, while the real repository passes.

- [ ] **Step 2: Tighten dependency rules**

Allow only `apps/cli/src/composition-root.ts` to import `@codryn/infrastructure`; deny infrastructure imports from other CLI source files. Extend shared independence and core runtime-adapter rules to `apps/cli` without weakening desktop rules.

- [ ] **Step 3: Document implemented R1 boundaries**

Create `r1-agent-loop.md` with the approved Mermaid flow, a successful event sequence, ownership table, persisted-vs-memory data table, and explicit R2 handoff. State that fake adapter is a provider double and R1 completion is not verification of a code change.

- [ ] **Step 4: Record ADR 0003**

Use the repository ADR headings. Record generic `sessions`, subtype projections, rebuilt event FK, R0 data preservation, rejected separate event tables, migration evidence, and the R2 consequence.

- [ ] **Step 5: Add the twelve-item author checklist**

Copy the twelve concrete understanding questions from the approved spec into `docs/r1-author-checklist.md`, each as an unchecked author-owned explanation item.

- [ ] **Step 6: Implement `verify:r1`**

Follow `verify-r0.mjs`: `spawnSync`, inherited stdio, `shell: false`, stop on first non-zero. Run exactly:

```text
npm run typecheck
npm run lint
npm run check:deps
npm test
npm run test:r1-repeatability
npm run package
node scripts/verify-packaged-r0.mjs
```

Print `R1 verification passed.` only after all seven commands exit `0`.

- [ ] **Step 7: Update living project context**

Add a dated R1 design/implementation note stating the implemented boundaries, generic session migration, read-only tool limits, fake scenario, verification command, and the fact that R2 still owns writes/shell/safe return. Do not rewrite historical sections.

- [ ] **Step 8: Run documentation and architecture checks**

Run:

```powershell
npm test -- tests/architecture/dependency-rules.test.ts
npm run check:deps
npm run typecheck
npm run lint
git diff --check
```

Expected: PASS; inspect any Markdown hard-break whitespace before changing it.

- [ ] **Step 9: Commit**

```powershell
git add dependency-cruiser.config.mjs tests/architecture docs/architecture/r1-agent-loop.md docs/decisions/0003-generic-sessions.md docs/r1-author-checklist.md scripts/verify-r1.mjs package.json PROJECT_CONTEXT.md
git commit -m "docs(r1): record architecture and verification gate"
```

---

### Task 12: Clean-Install R1 Acceptance and Handoff

**Files:**
- Verify only; modify files only to fix failures proven by this gate.

**Interfaces:**
- Consumes: all R1 tasks.
- Produces: auditable R1 acceptance evidence and a clean feature branch ready for review.

- [ ] **Step 1: Confirm exact runtime and clean task scope**

Run:

```powershell
node --version
npm --version
git status --short --branch
```

Expected: Node `v24.19.0`, npm `11.x`, branch `feat/r1-headless-agent-loop`, and no unrelated staged files.

- [ ] **Step 2: Perform clean dependency installation**

Run: `npm ci`

Expected: PASS from committed lockfile and runtime gate.

- [ ] **Step 3: Run the complete R1 gate**

Run: `npm run verify:r1`

Expected: all seven stages PASS, repeatability 10/10, packaged R0 report has eleven passes, and final output is `R1 verification passed.`

- [ ] **Step 4: Audit persisted evidence**

Open one test-owned R1 database/report and verify event order, relative paths, permission reason, three model steps, and absence of full source contents, absolute personal paths, environment values, and secrets. Preserve only repository-approved ignored artifacts.

- [ ] **Step 5: Run final Git checks**

Run:

```powershell
git diff --check
git status --short
git log --oneline --decorate -15
```

Expected: no unstaged implementation drift, generated outputs ignored, `Dokumentace příklady/` untouched, and focused commits matching Tasks 1–11.

- [ ] **Step 6: Complete the author handoff**

Walk through `docs/r1-author-checklist.md` without reading implementation line by line. Record any unanswered item as an open handoff issue; R1 is not complete until all twelve can be explained accurately.

---

## Final Definition of Done

- [ ] `npm ci` succeeds under Node 24.19.0 and npm 11.x.
- [ ] `npm run verify:r1` exits `0` on Windows 11 x64.
- [ ] The built-in read/search/final scenario succeeds ten times out of ten with semantically identical event traces.
- [ ] Unknown tools and invalid arguments never invoke a handler.
- [ ] Step limit, adapter failure, persistence failure, and cancellation produce truthful terminal results.
- [ ] Read/search cannot escape the project root, including through symlinks.
- [ ] Events contain audit metadata but no full source contents, absolute personal roots, environment values, or secrets.
- [ ] SQLite migration 2 preserves R0 sessions/events and keeps foreign keys valid.
- [ ] CLI, core, infrastructure, shared, and test-support boundaries are enforced by a rejecting architecture fixture.
- [ ] Existing R0 tests, Electron package, and packaged smoke remain green.
- [ ] R1 does not implement or imply write, shell, diff, safe return, real provider, or product UI support.
- [ ] The author can explain all twelve R1 checklist items.
