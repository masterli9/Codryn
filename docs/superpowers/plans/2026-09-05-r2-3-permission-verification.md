# R2.3 – oprávnění, procesy a ověření Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spustit právě jednou schválený omezený příkaz a pravdivě evidovat jeho výsledek.
**Architecture:** Core řídí permission request a verifikaci; Windows runner realizuje proces.
**Tech Stack:** TypeScript, SQLite, Vitest, Windows procesní experiment.
**Spec:** [R2 návrh](../specs/2026-09-05-r2-change-lifecycle-design.md), §7–8.
**Společné kontrakty:** [R2 index](2026-09-05-r2-implementation.md).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-05-r2-change-lifecycle-design.md` (schváleno autorem v této relaci).
- Windows 11; současný repository runtime: Node `24.19.0`, npm `>=11 <12`, TypeScript `6.0.3`. Před instalací ověřit `node --version` a `npm.cmd --version`; neobcházet runtime gate.
- `RunAgentLoop` zůstává jedinou agentní smyčkou.
- R2 neslibuje izolaci libovolného shellu od souborů nebo sítě.
- Backend je zdroj pravdy; bez produktového UI, cloudu, vzdáleného Gitu a subagentních produktových funkcí.
- Migrace 0–3 a jejich checksumy se nemění. Produkční kód neimportuje `tests/support`.
- Jeden patch mění jeden existující textový soubor; UTF-8 s volitelným BOM, původní konce řádků, nejvýše 1 MiB před i po změně.
- Model ani CLI nesmí zadat vlastní runId, projectId nebo obnovený obsah pro privilegovanou operaci. Tyto identity doplní backend.
- Dokončovací důkaz vychází ze skutečných výsledků, ne z textu modelu. Fake a live brána jsou oddělené.
- Každý úkol končí testem, kontrolou diffu a samostatným commitem pouze jeho souborů. Push/PR vyžadují explicitní zadání.
- Nezasahovat do `Dokumentace příklady/`. Fixture a uživatelská data držet mimo skutečný uživatelův projekt.
- Všechny uvedené příkazy běží z kořene Codrynu. Na Windows používat `npm.cmd`; test runner má limit 15 s, host testy explicitně 30 s, celé gate procesy nejvýše 10 minut.
- Příkazy v tomto dokumentu jsou budoucí kroky implementace; při psaní plánu se nespouštěly.


## P1: Windows process-tree brána

**Files – vytvořit:** `scripts/spikes/r2-process-probe.mjs`,
`scripts/spikes/r2-process-worker.ps1`,
`backend/infrastructure/test/r2-process-probe.test.ts`,
`docs/decisions/0006-r2-process-ownership.md`.
**Upravit:** `vitest.config.ts`.
**Consumes:** Windows 11, syntetické procesní fixture R0.
**Produces:** report `{supported: boolean; orphanCount: number;
maxTerminationDelayMs: number; cases: {name: string; passed: boolean}[]}`
a ADR s rozhodnutím použitelnosti a přesnými build/package soubory.

- [ ] **1. Přidat červený test**, který zavolá probe přes execFile stejně jako
  W1, s timeoutem 25 s a maxBuffer 64 KiB.

```ts
test('owned process tree is gone within the O1 bound', async () => {
  const { promisify } = await import('node:util');
  const { execFile } = await import('node:child_process');
  const { stdout } = await promisify(execFile)(process.execPath,
    ['scripts/spikes/r2-process-probe.mjs'],
    { timeout: 25_000, maxBuffer: 64 * 1024 });
  const r = JSON.parse(stdout);
  expect(r.supported).toBe(true);
  expect(r.orphanCount).toBe(0);
  expect(r.maxTerminationDelayMs).toBeLessThanOrEqual(2000);
  expect(r.cases.every((c: {passed: boolean}) => c.passed)).toBe(true);
}, 30_000);
```

- [ ] **2. Spustit** `npm.cmd test -- backend/infrastructure/test/r2-process-probe.test.ts`.
- [ ] **3. Ověřit Job Object nebo ekvivalent.** Zahájení uživatelského kódu
  musí nastat až po převzetí vlastnictví celého podporovaného stromu.
  Testovat root, child, grandchild, brzký exit rodiče, timeout, cancel,
  limit výstupu, host crash a opakované použití PID. Probe handshake
  používá signály souborů/pipe, ne odhad pořadí pomocí sleep.

```js
const scenarios = [
  'child', 'grandchild', 'early-parent-exit', 'timeout',
  'cancel', 'output-limit', 'host-crash', 'pid-reuse-evidence'
];
// Spustit každou fixture, evidovat skutečnou identitu a ukončení potomků.
// Procesní chyby jsou nonzero exit probe; stdout obsahuje pouze JSON report.
```

  [Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
  je primární referencí ověřenou 5. 9. 2026 pro skupinovou správu procesů.
  Dokumentace není důkaz vhodnosti konkrétního Node/Electron bridge.
  V ADR uvést původ, případnou licenci převzaté závislosti, build cestu,
  host-crash chování, podporované potomky a nepodporované breakaway případy.
- [ ] **4. PASS nebo zamítnuté ADR.** Při failure nezařadit shell tool.
  `taskkill /T /F` z R0 není automaticky schválená náhrada.
  Ověřit mechanismus také v zabaleném Electron hostiteli před P3 gate.
- [ ] **5. Commit:** `test(r2): prove Windows process ownership`.

## P2: Trvalé jednorázové oprávnění

**Files – vytvořit:** `shared/src/r2-permission.ts`,
`backend/core/src/permissions/permission-service.ts`,
`backend/core/src/permissions/ports.ts`,
`backend/infrastructure/src/persistence/r2-permission-migration.ts`,
`backend/infrastructure/src/persistence/sqlite-permission-store.ts`,
`backend/core/test/permission-service.test.ts`,
`backend/infrastructure/test/permission-store.test.ts`.
**Upravit:** migrace registry (verze 6), shared/core/infrastructure exporty,
`backend/core/src/agent/ports.ts`, `backend/core/src/agent/model.ts`,
`backend/infrastructure/src/persistence/sqlite-tool-call-store.ts`.
**Consumes:** existující PermissionRequest state graph, W5 bezpečná projekce.
**Produces:** `PermissionService.request(spec): Promise<PermissionView>`,
`decide(input): Promise<'accepted' | 'duplicate' | 'rejected'>`,
`claim(id, digest): Promise<boolean>`.

```ts
export interface CommandSpec {
  executable: string; args: readonly string[]; cwd: string;
  timeoutMs: number; maxOutputBytes: number;
}
export interface PermissionView {
  id: string; callId: string; digest: string;
  command: CommandSpec; reason: string; impact: string;
  state: 'pending' | 'allowed_once' | 'denied' | 'expired' | 'cancelled';
}
export interface PermissionDecisionInput {
  id: string; digest: string; decision: 'allow_once' | 'deny';
}
export interface PermissionStore {
  create(request: PermissionView): Promise<void>;
  get(id: string): Promise<PermissionView | null>;
  decide(input: PermissionDecisionInput): Promise<'accepted' | 'duplicate' | 'rejected'>;
  claim(id: string, digest: string): Promise<boolean>;
  closePending(id: string, state: 'expired' | 'cancelled'): Promise<boolean>;
}
```

  request spec obsahuje `{callId: string; command: CommandSpec;
  reason: string; impact: string}`; run/project binding získává z call store.
  constructor: `PermissionService({store, ids, clock, digest})`, kde digest
  je kanonický SHA-256 nad nástrojem/verzí, normalizovaným příkazem a identitou
  projektu; JSON řazení klíčů je stabilní. Store atomicky přiděluje claim.
- [ ] **1. Přidat test dvojího schválení.** Helper
  `createPermissionFixture()` v testu vytvoří service s in-memory store,
  fixními hodinami, UUID generátorem a jeden request.

```ts
test('approval and execution claim cannot be consumed twice', async () => {
  const { service, request } = createPermissionFixture();
  const input = { id: request.id, digest: request.digest,
    decision: 'allow_once' as const };
  expect(await service.decide(input)).toBe('accepted');
  expect(await service.decide(input)).toBe('duplicate');
  expect(await service.claim(request.id, request.digest)).toBe(true);
  expect(await service.claim(request.id, request.digest)).toBe(false);
});
```

- [ ] **2. Spustit** `npm.cmd test -- backend/core/test/permission-service.test.ts backend/infrastructure/test/permission-store.test.ts`.
- [ ] **3. Implementovat CAS rozhodnutí a claim.**

```sql
CREATE TABLE permission_requests (
  id TEXT PRIMARY KEY,
  call_id TEXT NOT NULL UNIQUE REFERENCES tool_calls(call_id),
  digest TEXT NOT NULL, safe_input_json TEXT NOT NULL CHECK(json_valid(safe_input_json)),
  state TEXT NOT NULL CHECK(state IN ('pending','allowed_once','denied','expired','cancelled')),
  claimed INTEGER NOT NULL DEFAULT 0 CHECK(claimed IN (0,1)),
  created_at TEXT NOT NULL
) STRICT;
UPDATE permission_requests SET state='allowed_once'
WHERE id=? AND digest=? AND state='pending';
UPDATE permission_requests SET claimed=1
WHERE id=? AND digest=? AND state='allowed_once' AND claimed=0;
```

  UPDATE+audit+tool decision proběhnou ve stejné SQLite transakci.
  Migrace 6 přestaví tool_calls se zachováním všech sloupců a FK, přidá
  allowed_once v permission_result; nikdy needitovat SQL migrace 2.
  Snapshot v DB smí obsahovat pouze příkaz bez tajemství.
  Argument s klíčem/hodnotou známého tajemství odmítnout před requestem;
  redigovaný text nelze použít jako rekonstruovaný skutečný příkaz.
  Pending request přežije restart. Claimed request se nikdy automaticky
  nespustí znovu: i pád před spawnem se vede jako nejistý pokus.

  Pozdější opačná odpověď je rejected, shodná duplicate. Vstupní digest
  ze starého snapshotu nemůže povolit změněný příkaz. Nová akce má nové ID.
- [ ] **4. Matrix:** deny, cancel, stale digest, jiný project, duplicate
  z více DB connections, restart před/po claim, event insert rollback.
  V3→nejnovější migrace zachová FK, tool stavy a R1 permission audit.
- [ ] **5. Commit:** `feat(r2): persist one-shot command approvals`.

## P3: Omezený příkaz v harnessu a CLI

**Files – vytvořit:** `backend/core/src/tools/command-tool.ts`,
`backend/core/src/process/ports.ts`,
`backend/infrastructure/src/process/r2-command-runner.ts`,
`backend/infrastructure/src/process/command-environment.ts`,
`apps/cli/src/permission-prompt.ts`,
`backend/infrastructure/test/r2-command-runner.test.ts`,
`backend/core/test/command-tool.test.ts`,
`apps/cli/test/permission-prompt.test.ts`.
**Upravit:** registry/harness/policy, agent state graph+tests,
`apps/cli/src/index.ts`, `apps/cli/src/arguments.ts`, CLI tests,
`vitest.config.ts`.
**Consumes:** P1 pass, P2 permission, W5 execution context.
**Produces:** `command.run@1`; `CommandRunner.run(spec: CommandSpec,
signal: AbortSignal): Promise<CommandResult>`;
`buildCommandEnvironment(env: Record<string,string|undefined>):
Record<string,string>`.

```ts
export interface CommandResult {
  status: 'succeeded' | 'failed' | 'timed_out' | 'cancelled' | 'termination_failed';
  exitCode: number | null; stdout: string; stderr: string;
  truncated: boolean; durationMs: number; treeStopped: boolean;
}
```

- [ ] **1. Přidat deny/no-spawn a secret inheritance test.**

```ts
import { buildCommandEnvironment } from '../src/process/command-environment.js';
test('provider secrets never reach child process environment', () => {
  const env = buildCommandEnvironment({ PATH: 'bin', SystemRoot: 'C:\\Windows',
    OPENAI_API_KEY: 'CANARY', GEMINI_API_KEY: 'CANARY', PRIVATE_TOKEN: 'CANARY' });
  expect(JSON.stringify(env)).not.toContain('CANARY');
  expect(env.PATH).toBe('bin');
});
```

  Core fake runner počítá run calls; denied permission musí vrátit tool
  denied a count=0. CLI vstup bez odpovědi není allow.
- [ ] **2. Spustit** `npm.cmd test -- backend/core/test/command-tool.test.ts backend/infrastructure/test/r2-command-runner.test.ts apps/cli/test/permission-prompt.test.ts`.
- [ ] **3. Implementovat runner a waiting flow.**
  R2 defaults: timeout 30 s, maximum 120 s; stdout+stderr společně 256 KiB;
  128 argumentů, každý max 4096 znaků, celkem 32 KiB. Cwd musí být kanonický
  adresář projektu. Shell není implicitní: executable+args se spouští
  s `shell:false`; pokud je executable shell, jeho celý argv je schvalovaný
  vstup. `.cmd` wrapper sestavuje adapter deterministicky a zobrazuje
  skutečný vykonaný příkaz, nikoli původní nezabalenou zkratku.

```ts
export function buildCommandEnvironment(env: Record<string, string | undefined>) {
  const allowed = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP',
    'COMSPEC', 'PATHEXT']);
  return Object.fromEntries(Object.entries(env)
    .filter(([key, value]) => allowed.has(key.toUpperCase()) && value !== undefined)
    .map(([key, value]) => [key, value!]));
}
```

  Zakázat dědění NODE_OPTIONS, npm config, credential proměnných a provider
  klíčů. Redakce známého secret canary probíhá streamově včetně tokenu
  rozděleného mezi chunky. Po output limit ukončit podporovaný strom,
  uvést truncated a nevracet verified. Při selhání ukončení uvést
  termination_failed/treeStopped=false; nikdy nezabíjet cizí port/PID.

  Harness: schema → permission pending → run waiting_for_approval →
  valid decision → revalidate cwd/command fingerprint → claim → queued →
  running → skutečný výsledek. Rozšířit agent graph executing_tool→
  waiting_for_approval, protože rozhodnutí vzniká až po validaci volání.
  Stav waiting není konečným výsledkem celé relace. CLI během čekání drží
  execute promise, na stderr zobrazí přesný bezpečný příkaz a načte
  explicitní allow/deny. Non-TTY vrátí čitelný požadavek a skončí bez
  spuštění; v DB zůstane pending pro podporované pozdější rozhodnutí.
  EOF a SIGINT nesmějí automaticky povolit.
- [ ] **4. Matrix:** timeout ukončení ≤2 s dle AC-O1-08, potomci,
  předčasný parent exit, host crash, false claim, stale cwd, newline/quote
  v argumentu, output split secret, default env, cancellation při pending
  a při běhu. Host testy serializovat.
- [ ] **5. Commit:** `feat(r2): execute explicitly approved bounded commands`.

## P4: Pozorování workspace a lease

**Files – vytvořit:** `backend/core/src/workspace/observe-workspace.ts`,
`backend/infrastructure/src/filesystem/workspace-observer.ts`,
`backend/infrastructure/src/persistence/r2-lease-migration.ts`,
`backend/infrastructure/src/persistence/sqlite-lease-store.ts`,
`backend/core/test/workspace-state.test.ts`,
`backend/infrastructure/test/workspace-observer.test.ts`,
`backend/infrastructure/test/lease-store.test.ts`.
**Upravit:** migration registry (7), W3 store, exporty.
**Consumes:** W3 WorkspaceStore, D1 Git identity.
**Produces:** WorkspaceObserver a LeaseStore dle indexu;
`shouldAdvance(previous: WorkspaceObservation, next: WorkspaceObservation):
boolean`.

- [ ] **1. Přidat test neúplného pozorování.**

```ts
import { shouldAdvance } from '../src/workspace/observe-workspace.js';
test('lost observation invalidates confidence even with identical content', () => {
  expect(shouldAdvance(
    { fingerprint: 'x', gitIdentity: null, complete: true },
    { fingerprint: 'x', gitIdentity: null, complete: false }
  )).toBe(true);
});
```

- [ ] **2. Spustit** `npm.cmd test -- backend/core/test/workspace-state.test.ts backend/infrastructure/test/workspace-observer.test.ts backend/infrastructure/test/lease-store.test.ts`.
- [ ] **3. Implementovat pozorování a serializaci.**

```ts
export function shouldAdvance(a: WorkspaceObservation, b: WorkspaceObservation) {
  return a.fingerprint !== b.fingerprint ||
    a.gitIdentity !== b.gitIdentity || a.complete !== b.complete;
}
```

  Hash manifestu: seřazené relativní cesty a byte hashe relevantních souborů.
  Max 5000 souborů/64 MiB na pozorování/5 s; překročení znamená
  complete=false, žádné tvrzení aktuálního ověření. Citlivé cesty nečíst.
  Sleduje se watcher generace mezi začátkem/koncem kontroly. Overflow,
  restart nebo neznámá změna invaliduje; watcher sám není důkaz absence
  změny. Před/po testu provést fresh manifest a Git read-only snapshot.
  ABA změnu (obsah se změní a vrátí) musí zachytit generace; při ztraceném
  sledování raději výsledek neověřený.

```sql
CREATE TABLE resource_leases (
  resource_key TEXT PRIMARY KEY, owner TEXT NOT NULL,
  fence INTEGER NOT NULL CHECK(fence > 0), expires_at INTEGER NOT NULL,
  effect_active INTEGER NOT NULL CHECK(effect_active IN (0,1))
) STRICT;
```

  acquire/renew/release používají BEGIN IMMEDIATE a owner+fence CAS.
  `markEffect(lease, active)` aktualizuje effect_active pouze při shodě
  owner+fence; záznam začátku navíc vyžaduje nevypršelý lease. Konec
  původního vlastníka lze potvrdit i po expiraci, ale ne po změně fence.
  Klíče: kanonický worktree/ref, lockfile, DB identita; nikdy globální
  project mutex pro všechny editace. Vypršelý effect_active lease se
  automaticky nepřebírá. P3 označuje začátek a potvrzený konec účinku
  atomicky se stavem execution; nový vlastník získá vyšší fence až po
  ověření, že původní efekt skončil.
  R2 nevystavuje Git mutation/package/migration nástroje; ověřit model
  lease na simulovaných zdrojích bez tvrzení kompletního Git workspace.
- [ ] **4. Matrix:** dvě DB connections, jiné klíče současně, starý owner
  po expiraci, process-active lease, externí editace, HEAD změna,
  stejný obsah bez události, ABA, watcher overflow, scan limit,
  read failure a restart. Own write revize+event transakčně jako W3.
- [ ] **5. Commit:** `feat(r2): track workspace freshness and resource leases`.

## P5: VerificationRecord a pravdivý výsledek

**Files – vytvořit:** `shared/src/r2-verification.ts`,
`backend/core/src/verification/verify-command.ts`,
`backend/core/src/verification/verification-store.ts`,
`backend/infrastructure/src/persistence/r2-verification-migration.ts`,
`backend/infrastructure/src/persistence/sqlite-verification-store.ts`,
`backend/core/test/verify-command.test.ts`,
`backend/infrastructure/test/verification-store.test.ts`.
**Upravit:** registry (verze migrace 8), exporty,
P3 command tool a core tests.
**Consumes:** CommandResult, WorkspaceSnapshot.
**Produces:** `VerificationRecord`, `assessVerification(input): status`,
`VerifyCommand.execute(command: CommandSpec, actor: ChangeActor,
signal: AbortSignal): Promise<VerificationRecord>`.

```ts
export interface VerificationRecord {
  id: string; runId: string; callId: string; projectId: string;
  kind: 'test'; command: CommandSpec; scope: 'project';
  revision: number; fingerprint: string; occurredAt: string;
  result: 'passed' | 'failed' | 'incomplete'; stale: boolean;
  reason: string; exitCode: number | null;
}
export interface Assessment {
  exitCode: number | null; treeStopped: boolean; truncated: boolean;
  processStatus: CommandResult['status'];
  before: WorkspaceSnapshot; after: WorkspaceSnapshot;
  watcherChanged: boolean; relevant: boolean;
}
```

- [ ] **1. Přidat test „zelený exit nestačí“.**

```ts
import { assessVerification } from '../src/verification/verify-command.js';
test('successful process is incomplete after relevant workspace change', () => {
  const before = { revision: 1, fingerprint: 'a', gitIdentity: null, complete: true };
  const after = { ...before, revision: 2, fingerprint: 'b' };
  expect(assessVerification({ exitCode: 0, treeStopped: true,
    truncated: false, processStatus: 'succeeded', before, after,
    watcherChanged: true, relevant: true })).toBe('incomplete');
});
```

- [ ] **2. Spustit** `npm.cmd test -- backend/core/test/verify-command.test.ts backend/infrastructure/test/verification-store.test.ts`.
- [ ] **3. Implementovat deterministické posouzení.**

```ts
export function assessVerification(i: Assessment): VerificationRecord['result'] {
  if (!i.relevant || !i.treeStopped || i.truncated ||
    !i.before.complete || !i.after.complete || i.watcherChanged ||
    i.before.revision !== i.after.revision ||
    i.before.fingerprint !== i.after.fingerprint)
    return 'incomplete';
  if (i.processStatus === 'succeeded' && i.exitCode === 0) return 'passed';
  if (i.processStatus === 'failed' && i.exitCode !== null) return 'failed';
  return 'incomplete';
}
```

  Observe before až po schválení těsně před spawnem, after po potvrzeném
  ukončení stromu. P3 tool dovolí atribut účelu testu, ale samotné označení
  modelem `test` neurčuje relevant=true. Pro R2 fixture backend zná konkrétní
  test entry; ostatní příkazy mají explicitní důvod omezené relevance.
  P5 nevytváří implicitní druhé spuštění příkazu: obaluje P3 schválený
  runner jedním před/po pozorováním.
  `VerificationStore.append(record)` uloží DTO a event atomicky;
  `current(runId, snapshot)` vrací historický record s odvozeným stale,
  nikdy nemaže původní pass.

```sql
CREATE TABLE verification_records (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES agent_runs(run_id),
  call_id TEXT NOT NULL REFERENCES tool_calls(call_id),
  project_id TEXT NOT NULL REFERENCES workspaces(id),
  revision INTEGER NOT NULL, record_json TEXT NOT NULL CHECK(json_valid(record_json)),
  occurred_at TEXT NOT NULL,
  FOREIGN KEY(run_id,call_id) REFERENCES tool_calls(run_id,call_id)
) STRICT;
```

  Pro neznámý rozsah je scope=project a jakákoli relevantní změna invaliduje.
  Změna mimo projekt nezvyšuje revizi; nepřidávat nepodloženou jemnou cache.
- [ ] **4. Matrix:** pass, failed test, timeout, cancellation, output cap,
  stale po další editaci i návratu, no observer, watcher overflow, jiná
  Git identita, audit failure. Modelová zpráva „hotovo“ nic z toho nepřebije.
- [ ] **5. Společné gate a commit:** `feat(r2): bind verification to observed workspace state`.

## Výstup R2.3

Shell má prokázaný životní cyklus, pending/deny/claim audit a konzervativní
ověření. Dosud bez celého živého modelového scénáře; ten uzavírá R2.4.
