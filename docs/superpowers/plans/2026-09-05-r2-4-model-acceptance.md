# R2.4 – model, celý cyklus a akceptace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prokázat úplný cyklus deterministicky i s vybraným skutečným modelem.
**Architecture:** Rozšířit stávající smyčku, připojit R2 infrastrukturu a normalizovat skutečné API za původním ModelAdapter portem.
**Tech Stack:** TypeScript, Vitest, SQLite, HTTP stream transport za portem, CLI.
**Spec:** [R2 návrh](../specs/2026-09-05-r2-change-lifecycle-design.md), §9–11.
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


## M1: Historie modelu a pravdivé dokončení R2

**Files – vytvořit:** `shared/src/r2-agent.ts`,
`shared/test/r2-agent.test.ts`,
`backend/core/src/agent/model-history.ts`,
`backend/core/src/agent/r2-completion.ts`,
`backend/core/test/model-history.test.ts`,
`backend/core/test/r2-completion.test.ts`,
`backend/infrastructure/src/persistence/r2-agent-details-migration.ts`.
**Upravit:** `shared/src/model-contract.ts`, `shared/src/index.ts`,
`backend/core/src/agent/run-agent-loop.ts`,
`backend/core/src/agent/model-response-collector.ts`,
`backend/core/src/agent/ports.ts`, core exporty,
stávající collector/loop/model-contract testy a migrace registry (verze 9).
**Consumes:** R1 ModelToolCall/ToolResult, P5 VerificationRecord, D2 diff.
**Produces:** request history, normalizovaný usage/error, R2 result a
backendové rozhodnutí dokončení.

```ts
export type ModelTurn =
  | { kind: 'assistant'; text: string; calls: readonly ModelToolCall[] }
  | { kind: 'tool'; result: ToolResult };
export interface R2RunResult {
  schemaVersion: 2; runId: string; stepCount: number;
  status: 'completed' | 'failed' | 'cancelled';
  finalText: string;
  changeSetId: string | null;
  verification: { status: 'verified' | 'unverified' | 'stale';
    recordId: string | null; reason: string };
  recoveryRequired: boolean;
}
export function canComplete(input: {
  changed: boolean; verification: 'verified' | 'unverified' | 'stale';
  recoveryRequired: boolean; pending: boolean;
}): boolean {
  return input.changed && input.verification === 'verified' &&
    !input.recoveryRequired && !input.pending;
}
```

- [ ] **1. Přidat test odmítnutí nepodloženého dokončení.**

```ts
import { canComplete } from '../src/agent/r2-completion.js';
test('model final text cannot override stale verification', () => {
  expect(canComplete({ changed: true, verification: 'stale',
    recoveryRequired: false, pending: false })).toBe(false);
});
```

  Collector test: stream text_delta + tool_call + completed vytvoří tool
  response s commentary. Stejný stream bez completed nespustí žádný tool.
- [ ] **2. Spustit** `npm.cmd test -- backend/core/test/model-history.test.ts backend/core/test/r2-completion.test.ts backend/core/test/model-response-collector.test.ts shared/test/r2-agent.test.ts`.
- [ ] **3. Doplnit historii a R2 completion profile.**
  `ModelRequest.history` přidat jako optional pole s default prázdným polem
  pro R1 fixtures. Ukládat celé assistant call skupiny a odpovídající tool
  výsledky v pořadí; serializace pro API není úkolem core.
  `previousToolResults` ponechat pro R1, odvozovat jej ze stejné historie,
  neudržovat dvě nezávislé pravdy.

```ts
export function appendToolTurn(history: readonly ModelTurn[], result: ToolResult): ModelTurn[] {
  return [...history, { kind: 'tool', result }];
}
```

  Collected response `tool_calls` získá `text: string`; čistý final zůstává.
  Stejný callId nepoužít podruhé. Usage: nullable input/output/cached/reasoning
  tokeny, doplnit režim zda reasoning již patří do output, aby nebyl dvojitě
  účtován. Neznámé údaje jsou null. Chyby modelu normalizovat na auth,
  rate_limit, timeout, interrupted, invalid_tool_call, provider_error.
  Nové R2 kódy přidat bez zpětné úpravy checksumů: migration 9 přidá
  `agent_run_details(run_id PK/FK, failure_code, result_json)` místo
  přestavby historického R1 failure CHECK. R2 detail je autorita R2 výsledku;
  starý sloupec zůstane NULL nebo kompatibilní obecný R1 kód.

  Smyčka dostane backendový run profile `'read_only' | 'change'` z composition
  root, nikoli samovolně od modelu. R1 execute zachová schéma 1 a golden trace.
  R2 change profile nepřejde do completed, pokud canComplete=false; vrátí
  failed s pravdivým neověřeným stavem, diff i změny zůstávají dostupné.
  Nespuštěný R2 patch neznamená úspěšnou opravu. CLI může interně předat
  režim explicitně, produktový read-only tok se tím neruší.
  Výstupní overload `executeR2(request, signal): Promise<R2RunResult>`
  sdílí vnitřní loop engine s execute; nevytvářet druhou smyčku.
  Zapečetit change set i při cancel/fail; recovery_required není sealed.

  Při stale patchi model může znovu číst a opravit plán. Při recovery se
  další účinky běhu blokují. Limit 32 kroků zůstává; stream max 120 s,
  idle timeout 30 s, cancel ukončí transport. Promise timeout musí zrušit
  síťový požadavek, nestačí jen přestat čekat.
- [ ] **4. Matrix:** mixed output, truncated JSON, duplicate call, tool error
  a další opravný tah, step limit, usage null, stale final, cancelled after
  write, event failure, read-only schema 1 a R1 repeatability.
- [ ] **5. Commit:** `feat(r2): track model history and verified completion`.

## M2: Celý fake cyklus, CLI a recovery po restartu

**Files – vytvořit:** `backend/infrastructure/src/create-r2-infrastructure.ts`,
`backend/core/src/agent/recover-r2-run.ts`,
`apps/cli/src/scenarios/change-verify-return.ts`,
`apps/cli/test/change-verify-return.test.ts`,
`backend/infrastructure/test/r2-recovery.test.ts`,
`tests/support/fixtures/r2-project/README.md`,
`tests/support/fixtures/r2-project/sum.mjs`,
`tests/support/fixtures/r2-project/sum.test.mjs`,
`scripts/verify-r2-repeatability.mjs`.
**Upravit:** CLI composition root/index/arguments, package scripts,
infrastructure exports, test support R2 fixture a `vitest.config.ts`.
**Consumes:** W–P hotové služby, M1 executeR2.
**Produces:** `createR2Infrastructure({projectRoot, userDataPath, model,
permissionResponder})`; vrátí `{agentLoop, changes, permissions, recover,
close}`. `changes` je GetChangeDiff+RevertChanges, `permissions`
PermissionService; `recover.execute(projectId, signal)` obnoví jen
explicitně podporované stavy bez síťového pokračování.

- [ ] **1. Přidat scénářový test.** Helper
  `runR2Fixture(mode: 'git' | 'non-git'): Promise<{status: string;
  verification: string; readCalls: number; returnedToBaseline: boolean;
  indexPreserved: boolean}>` vytvořit v CLI testu, volá skutečnou composition
  a služby. Test support nepřenáší business pravidla.

```ts
test.each(['git', 'non-git'] as const)('complete cycle in %s', async mode => {
  const result = await runR2Fixture(mode);
  expect(result.status).toBe('completed');
  expect(result.verification).toBe('verified');
  expect(result.readCalls).toBeGreaterThanOrEqual(2);
  expect(result.returnedToBaseline).toBe(true);
  expect(result.indexPreserved).toBe(true);
});
```

- [ ] **2. Spustit** `npm.cmd test -- apps/cli/test/change-verify-return.test.ts backend/infrastructure/test/r2-recovery.test.ts`.
- [ ] **3. Implementovat fixture a propojení.**

```js
// tests/support/fixtures/r2-project/sum.mjs — záměrná fixture chyba
export function sum(a, b) { return a - b; }
```

```js
// tests/support/fixtures/r2-project/sum.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { sum } from './sum.mjs';
test('sum adds both operands', () => assert.equal(sum(2, 3), 5));
```

  Fake pořadí: search → read aktuálního souboru → patch s hashem skutečného
  read resultu → `command.run` přes `process.execPath --test sum.test.mjs`
  s backendovým test purpose → final. Hash ani výsledný úspěch nesmí být
  napevno dosazen z očekávání. Test responder schválí pouze přesnou fixture
  kombinaci executable/args/cwd/digest, ne libovolný modelový příkaz.
  Nejprve doložit, že fixture test skutečně failuje před opravou.

  Po final volá test explicitní uživatelský revert a porovná manifest před
  odstraněním temp adresáře. Iterovat 10krát pro každý režim, bez ručního
  resetu a s novou composition v každém běhu; ukládat významovou trace bez
  UUID/časů. Golden očekávání obsahují deny/stale i successful větve.

  CLI nové vstupy: `--scenario change-verify-return`, `--provider fake`;
  explicitní operace `--operation diff|revert|recover|permission` s ID.
  Žádná z nich nevystaví obecný SQL/filesystem přístup. R1 argumenty nadále
  fungují. stdout jediný validovaný result JSON, lidské prompty na stderr.

  Recovery po backend restartu: pending oprávnění lze znovu zobrazit;
  allowed-but-unclaimed se před spuštěním znovu předloží k potvrzení;
  claimed/running shell je failed/unknown effect bez automatického replay.
  Souborové intents řeší W4. Konverzační pokračování po backend restartu
  R2 nepodporuje bez kompletního transient kontextu: konzistentně uzavře
  přerušený run jako failed, zachová diff/revert a dovolí nový run.
  Restart samotného klienta při živém backendu nesmí claim opakovat.
  `recover` nikdy nevolá model.

  Pending request lze po restartu zobrazit a zamítnout; k novému spuštění
  uživatel vytváří nový run/call. Staré povolení se označí expired, nikoli
  tiše použije v novém běhu. Tento limit uvést v CLI textu a handoffu R3.
- [ ] **4. Matrix:** crash before/after claim/spawn/publish/confirm, duplicate
  revert, audit failure, negative test repair, stale external edit,
  cancellation, index preservation. Nové skutečné procesní testy přidat
  do host-integration.
- [ ] **5. Commit:** `feat(r2): compose recoverable headless change cycle`.

## M3: Provider kontrakt, ochrana kontextu a offline API adaptéry

**Files – vytvořit:** `backend/infrastructure/src/model/provider-transport.ts`,
`backend/infrastructure/src/model/openai-responses-adapter.ts`,
`backend/infrastructure/src/model/gemini-adapter.ts`,
`backend/infrastructure/src/model/provider-errors.ts`,
`backend/infrastructure/src/model/session-secret.ts`,
`backend/infrastructure/src/filesystem/context-path-policy.ts`,
`backend/infrastructure/test/provider-contract.test.ts`,
`backend/infrastructure/test/provider-context.test.ts`,
`docs/architecture/r2-provider-contract.md`.
**Upravit:** composition factory, infrastructure exports,
R1 filesystem/context assembler wiring pro R2 policy.
**Consumes:** M1 ModelRequest.history a ModelAdapter port.
**Produces:** oba omezené kandidátní adaptéry pro stejný kontrakt; plné
produkční dokončení vybraného kandidáta v M4. Žádné živé volání v tomto úkolu.

```ts
export interface ProviderTransport {
  stream(request: {
    url: string; headers: Readonly<Record<string,string>>;
    body: unknown;
  }, signal: AbortSignal): AsyncIterable<unknown>;
}
export interface ProviderAdapterOptions {
  modelId: string; key: () => string;
  transport: ProviderTransport; ids: IdGenerator;
}
```

  Transport je infrastructure detail, nepřidávat jej do core.
  Konkrétní adapter implementuje existující
  `stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent>`.
  Klíč získává closure; není v serializovaném requestu modelu ani stavu DB.
- [ ] **1. Přidat offline kontraktní suite.** Testovací factory
  `adapterCase(provider: 'openai' | 'gemini', fixture: 'two-tools' |
  'broken-stream' | 'auth-error')` v testu vrátí
  `{adapter: ModelAdapter; first: ModelRequest; followup:
  (calls: readonly ModelToolCall[]) => ModelRequest; sent: unknown[]}`.
  Mock transport vrací provider-native streamy podle aktuálně načtené
  dokumentace, síť je v testu zakázaná.

```ts
test.each(['openai', 'gemini'] as const)('%s preserves call/result pairing', async p => {
  const f = adapterCase(p, 'two-tools');
  const first = await collectModelResponse(
    f.adapter.stream(f.first, new AbortController().signal),
    new AbortController().signal);
  expect(first.kind).toBe('tool_calls');
  if (first.kind !== 'tool_calls') throw new Error('Expected calls');
  const next = f.followup(first.calls);
  await collectModelResponse(f.adapter.stream(next, new AbortController().signal),
    new AbortController().signal);
  expect(f.sent).toHaveLength(2);
  expect(JSON.stringify(f.sent)).not.toContain('TEST_SECRET_CANARY');
});
```

  `sent` zachycuje jen body, nikoli auth headers. Zvlášť assertovat, že
  správný klíč dostal pouze transport a nikdy log/event/model content.
- [ ] **2. Spustit** `npm.cmd test -- backend/infrastructure/test/provider-contract.test.ts backend/infrastructure/test/provider-context.test.ts`.
- [ ] **3. Implementovat normalizaci podle primární dokumentace.**
  Dokument `r2-provider-contract.md` při implementaci zaznamená přesný API
  formát/verzi, dostupný model, capability, datum a zdroj. Výchozí kandidáti
  jsou PRD GPT-5.6 Luna a Gemini gemini-2.5-flash; jejich dostupnost se musí
  ověřit, nikoli odvodit z názvu v Codexu.

  OpenAI Responses: mapovat function call a odpověď pomocí externího
  call_id. Interní UUID je vlastní ID; adapter uchovává bijektivní mapu
  external↔internal v paměti běhu. Zachovat potřebné provider output položky
  pro další tah; nezasílat pouze tool result bez původního volání.
  [Oficiální function calling](https://developers.openai.com/api/docs/guides/function-calling).

  Gemini: použít jeden konkrétní dokumentovaný API formát a zachovat plné
  části předchozí odpovědi nutné pro navazující function response.
  Provider opaque signatures se nesumarizují ani neposílají jinému modelu.
  [Function calling](https://ai.google.dev/gemini-api/docs/function-calling),
  [generateContent signatures](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures).
  Tyto zdroje byly načteny 5. 9. 2026; při implementaci se ověří znovu.
  Převzatý princip: zachování párování a opaque stavu. Žádný provider
  SDK nesmí automaticky vykonávat nástroje mimo harness.

```ts
export function normalizeProviderError(status: number | null, timedOut: boolean) {
  if (timedOut) return 'timeout' as const;
  if (status === 401 || status === 403) return 'auth' as const;
  if (status === 429) return 'rate_limit' as const;
  return 'provider_error' as const;
}
```

  Transport parser má max 2 MiB response, 64 KiB tool arguments, 32 calls,
  idle 30 s/total 120 s. Zruší fetch i stream reader a ignoruje pozdní data.
  Tool event se emituje až po kompletních argumentech; collector navíc
  vyžaduje completed. SDK auto retries vypnout; při unknown response
  neprovádět transparentní opakování již dokončených akcí.
  Opaque stav pouze v paměti runu; po konci jej zahodit. Restart backendu
  znamená M2 omezenou obnovu, žádný odhad API historie.

  Context policy před live: sdílená cesta pro search/read/reference v R2
  respektuje kořenový `.codrynignore`. Minimum parseru: prázdné řádky,
  komentář #, kořenové relativní vzory, *, **, ?, trailing / pro adresář;
  negace ! a neznámá syntaxe způsobí explicitní configuration error,
  nikoli tiché ignorování. Citlivé výchozí cesty mají přednost.
  Ignorovaná explicitní reference vyžaduje zvláštní jednorázové rozhodnutí,
  R2 bez této obsluhy bezpečně odmítá odeslání. Kompletní R4 UX a indexy
  zůstávají mimo tuto práci. Neposílat vůbec userData/blobs/.git.
  Změna policy vyžaduje znovu sestavit aktuální kontext.
- [ ] **4. Matrix:** API auth/rate/timeout, stream uprostřed JSON, usage
  missing/reasoning, commentary+calls, external ID collisions, signature
  roundtrip, unsupported capability, no key, secret split chunks,
  ignored path z každého vstupu, policy změna a unexpected tool name.
- [ ] **5. Commit:** `feat(r2): normalize provider tool streams and context boundaries`.

## M4: Omezený provider eval a první živý model

**Files – vytvořit:** `scripts/eval-r2-providers.mjs`,
`scripts/verify-r2-live.mjs`,
`backend/core/src/agent/provider-eval.ts`,
`backend/core/test/provider-eval.test.ts`,
`docs/evals/r2-provider-eval.md`,
`docs/decisions/0007-r2-provider-selection.md`.
**Upravit:** CLI args/composition, package scripts, PROJECT_CONTEXT.md,
vybraný adapter z M3.
**Consumes:** M2 celý fake průchod, M3 offline kontrakt.
**Produces:** datovaný eval report, OD-04 rozhodnutí, živý report pěti pokusů;
`summarizeTrials(trials: readonly Trial[]): EvalSummary`.

```ts
export interface Trial {
  id: string; provider: string; model: string;
  successful: boolean; failureOwner: 'model' | 'adapter' | 'harness' | 'api' | null;
  validCalls: number; invalidCalls: number; repairedAfterError: boolean;
  durationMs: number; costUsd: number | null;
}
export interface EvalSummary {
  attempts: number; successes: number; knownCostUsd: number;
  unknownCostTrials: number; liveGatePassed: boolean;
}
export function summarizeTrials(trials: readonly Trial[]): EvalSummary {
  return {
    attempts: trials.length,
    successes: trials.filter(t => t.successful).length,
    knownCostUsd: trials.reduce((n, t) => n + (t.costUsd ?? 0), 0),
    unknownCostTrials: trials.filter(t => t.costUsd === null).length,
    liveGatePassed: trials.length === 5 && trials.filter(t => t.successful).length >= 4
  };
}
```

- [ ] **1. Přidat test chybějících metrik a neúplné série.**

```ts
import { summarizeTrials } from '../src/agent/provider-eval.js';
test('zero trials is not a passing live gate', () => {
  expect(summarizeTrials([])).toEqual({
    attempts: 0, successes: 0, knownCostUsd: 0,
    unknownCostTrials: 0, liveGatePassed: false
  });
});
```

- [ ] **2. Spustit** `npm.cmd test -- backend/core/test/provider-eval.test.ts`.
- [ ] **3. Implementovat report a opt-in CLI.** Před sítí vyžadovat
  explicitní `--live --max-cost-usd <positive number>`, vybraný provider
  a model, klíč získaný přes skrytý session prompt. Žádný klíč v argv,
  commitu, .env projektu ani transcriptu. Bez klíče lokální úkoly dál
  fungují; živé pokusy nezačnou a report uvede blokovaný live krok.

  Eval: každý dostupný kandidát dostane totožné zadání, 3 syntetické varianty
  (prostá oprava, stale hash vyžadující re-read, test failure vyžadující
  další opravu), každá dvakrát; 6 pokusů/kandidát, max 12 model requestů
  na pokus a 4096 output tokenů na request. Ne všechny modely mají stejné
  číselné nastavení reasoning; report zaznamená skutečně použitou hodnotu.
  Před requestem rezervovat konzervativní cenu za celý input + maximální
  output dle aktuálního ceníku; unknown cena znemožní vynucení USD stropu
  a vyžaduje nejprve doplnit ceníkový profil. Usage reconciliace nesmí
  reasoning účtovat dvakrát. Limit requestů funguje i při usage=null.

  V reportu uchovat všechny pokusy včetně neúspěchů, hashe fixture a scénáře,
  datum/model/settings/ceník/podmínky s oficiálními odkazy. Neopakovat
  špatný pokus tajně; nový protokol má nové ID a vazbu na předchozí.
  Výběr: nejprve žádná bezpečnostní regrese, poté dokončení a oprava,
  následně cena dokončeného úkolu a latence. Nerozhodovat jen dle token ceny.

  Po výběru znovu spustit 5 předem určených live pokusů standardního cyklu;
  úspěch vyžaduje vlastní změnu, relevantní test, diff a ověřený revert.
  Otestovat vybraný model v obou Git režimech; pět základních pokusů
  rozdělit 3 Git / 2 non-Git a vyžadovat aspoň jeden úspěch v každém.
  Pokus zmařený API patří do reportu; nesmí se odmazat kvůli 4/5.
  Pokud není dostupný celý evaluovaný vzorek, live gate je neověřená.

  OD-04: zapsat kandidáty, vyloučené varianty, data a vítěze, konkrétní
  model ID a capability. Žádný výběr před daty. Potřebné nové poskytovatele
  ani nákladový strop agent neautorizuje za uživatele.
- [ ] **4. Lokální testy PASS, pak až autorizovaný live run.**
  Nevyžadovat klíč během samotného psaní tohoto plánu. Přidat test budget
  stop před další sítí, chybějící ceník, null usage a zakázaný fallback provider.
- [ ] **5. Commit:** `feat(r2): evaluate and select first live provider`.
  Report nikdy neobsahuje secrets nebo soukromý workspace obsah.

## M5: Technická akceptace a předání autora

**Files – vytvořit:** `scripts/verify-r2.mjs`,
`scripts/verify-packaged-r2.mjs`,
`tests/packaged/r2-smoke.test.ts`,
`apps/desktop/src/smoke/run-r2-smoke.ts`,
`docs/architecture/r2-change-lifecycle.md`,
`docs/r2-author-checklist.md`, `docs/r2-acceptance.md`.
**Upravit:** package scripts, `vitest.config.ts`,
`apps/desktop/src/main.ts`, `apps/desktop/src/composition-root.ts`,
`apps/desktop/forge.config.ts`, PROJECT_CONTEXT.md.
**Consumes:** W1–M4 důkazy.
**Produces:** lokální `verify:r2`, oddělený `verify:r2:live`,
traceability a handoff.

- [ ] **1. Přidat smoke assertion** nad reportem packaged hostu. Helper
  `runPackagedR2Smoke(): Promise<{schemaVersion: number; database: string;
  guardedWrite: string; processTree: string; returnedToBaseline: boolean}>`
  v testu spustí zabalený executable s interním R2 smoke flagem, fixture
  cwd a timeoutem 30 s; nesmí spouštět live model.

```ts
test('packaged R2 keeps native boundaries operational', async () => {
  const report = await runPackagedR2Smoke();
  expect(report).toMatchObject({ schemaVersion: 1, database: 'pass',
    guardedWrite: 'pass', processTree: 'pass', returnedToBaseline: true });
}, 30_000);
```

- [ ] **2. Spustit** `npm.cmd test -- tests/packaged/r2-smoke.test.ts`.
  Chybějící build je neověřený build krok, ne přeskočený důkaz.
- [ ] **3. Implementovat verify script** po vzoru R1 s explicitními timeouty.

```js
const checks = [
  ['npm.cmd', ['run', 'typecheck']],
  ['npm.cmd', ['run', 'lint']],
  ['npm.cmd', ['run', 'check:deps']],
  ['npm.cmd', ['test']],
  ['npm.cmd', ['run', 'test:r1-repeatability']],
  ['npm.cmd', ['run', 'test:r2-repeatability']],
  ['npm.cmd', ['run', 'package']],
  [process.execPath, ['scripts/verify-packaged-r0.mjs']],
  [process.execPath, ['scripts/verify-packaged-r2.mjs']]
];
```

  Windows npm wrapper jako stávající verify-r1; check proces max 10 min,
  timeout ukončí jeho vlastní strom a skončí failure. Test v `npm test`
  nesmí vyžadovat nový build před package krokem: packaged assertion
  spouští explicitně verify-packaged-r2 po balení; vyjmout jej z výchozího
  globu stejně pro nový samostatný test projekt.
  Přidat package scripts `test:r2-repeatability`, `verify:r2`,
  `eval:r2-providers`, `verify:r2:live`. Live není součástí výchozího verify.

  Acceptance dokument: požadavek → soubor → test → report → omezení →
  datum. O1 UI kritéria jen omezeně splněno, žádné označení celé O1.
  Autor checklist obsahuje hash/revision, journal crash, dirty Git,
  approval claim, stale verification, process tree, provider eval a
  proč shell není sandbox; položky nechává nezaškrtnuté autorovi.
- [ ] **4. Finální gate:** z čistého izolovaného checkoutu na podporovaném
  runtime `npm.cmd ci`, `npm.cmd run verify:r2`, zvlášť autorizovaný
  `npm.cmd run verify:r2:live`; uchovat skutečný report a checksum buildů.
  Před příkazem ci ověřit stav a runtime; neodstraňovat uživatelův workspace.
  R1 regrese i packaged R0 musí projít. `git diff --check`,
  přesný staging, `git status --short --branch`.
- [ ] **5. Commit:** `docs(r2): record acceptance and author handoff`.
  Stav R2 complete jen při všech technických branách a live důkazu;
  autorské porozumění evidovat odděleně, nezaškrtávat za autora.

## Výstup R2.4

Předání obsahuje opakovatelný lokální cyklus, samostatný živý důkaz,
konkrétní modelové rozhodnutí, podporované recovery a známá omezení.
Výpadek API nebo neúspěšný Windows experiment zůstává viditelnou
nesplněnou branou, i když ostatní práce prošla.
