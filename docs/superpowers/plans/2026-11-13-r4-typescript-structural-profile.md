# R4 TypeScript Structural Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agent bezpečně získá definice, reference, typy, signatury, diagnostiku a import/export vazby v malém TypeScript/React projektu a nejméně 18 z 20 předem určených strukturálních dotazů odpoví ručně ověřenému očekávání.

**Architecture:** Jeden read-only nástroj `typescript.query@1` přijímá konkrétní dotaz a vrací malé validované JSON. Backend nejprve ověří projektovou cestu, ignore politiku a revizi workspace. TypeScript Compiler API běží mimo Electron main thread v baleném workeru; používá omezený compiler host a vrací jen vybrané údaje. Každý dotaz sestaví čerstvý projektový program, takže starý výsledek ani cache nepřežijí změnu souboru nebo `tsconfig`. Selhání workeru je omezená chyba nástroje a nezablokuje `file.read` ani `text.search`.

**Tech Stack:** TypeScript 6.0.3 Compiler API, Zod, Node worker threads, Vitest, Electron Forge/Webpack, stávající SQLite event log a tool harness.

**Spec:** `docs/superpowers/specs/2026-11-10-r4-user-driven-alpha-design.md` §2; `PRD_v1.1.md` `FR-TS-01..08`, `FR-CTX-14/15/17`, `AC-O1-13/27`; `docs/superpowers/plans/2026-11-10-r4-typescript-verification.md` pro rozpoznání projektu a balení TypeScript runtime.

## Global Constraints

- Windows 11, Node.js `24.19.0`, npm `>=11 <12`; zachovat vrstvy `shared`, `backend/core`, `backend/infrastructure`, `apps/desktop`, `tests/support` a validované IPC. Renderer nemá přímý Node ani compiler přístup.
- Použít TypeScript Compiler API, které už předchozí R4 plán zavádí pro `tsconfig`; další `ts-morph` závislost zde nevzniká. Před vlastní implementací ověřit na fixture přesnost potřebných API a zabalení workeru; neúspěch znamená revizi plánu, nikoli tiché zúžení požadavků.
- `typescript.query@1` je pouze čtecí nástroj. Vstup vždy obsahuje projektově relativní cestu; pro symbolový dotaz buď umístění `line`/`column`, nebo jméno symbolu. Výstup má nejvýše 50 položek, textové pole nejvýše 400 znaků a celé serializované JSON nejvýše 32 KiB. Nikdy nevrací AST, úplný obsah souboru ani závislostní zdrojový text.
- Worker má limit 5 s na dotaz, 5 000 projektových souborů, 64 MiB projektového zdrojového textu a 1 MiB na soubor. Překročení vrátí `limited` s důvodem. Abort a timeout ukončí worker a nesmí zanechat běžící výpočet.
- Cesta dotazu i každý projektový soubor pro index musí projít kanonickým kořenem, aktuální výchozí ochranou a `.codrynignore`. Změna pravidel se projeví před dalším dotazem. Standardní knihovny TypeScriptu jsou interní součást compileru. Deklarace `.d.ts` v `node_modules` lze číst pouze jako vysvětlenou interní výjimku pro rozlišení typů, nikdy jako indexované nebo modelu vracené soubory; explicitní `.codrynignore` a citlivá politika mají přednost a počet takto čtených deklarací se uvede v auditu. Citlivé a ignorované projektové zdroje se nečtou pro index ani nevracejí.
- Při neplatném či chybějícím `tsconfig` se vrací viditelný `fallback` nebo `unsupported` stav. Fallback smí použít omezenou syntaktickou analýzu jedné povolené cesty; nesmí předstírat spolehlivou typovou nebo mezisouborovou odpověď. Běžné `file.read` a `text.search` zůstanou dostupné.
- Před a po dotazu se porovná aktuální workspace revize/fingerprint a obsahový hash cílového souboru. Změna během dotazu vrátí `stale`, žádný výsledek se nevydá jako aktuální. V první verzi není trvalá cache; nový dotaz vždy sestaví nové podklady.
- Automatické testy používají fixture a fake model, nikoli placené API. Eval sada 20 dotazů se uloží s očekáváním před spuštěním měření; neshody se zveřejní. Dosažení 18/20 samo neprokazuje celý R4 ani použitelnost libovolného projektu.

## Review Focus

1. Dotaz na soubor ignorovaný po změně `.codrynignore`: worker nesmí vrátit dříve získaný symbol ani obsah; test v Task 3/4.
2. `tsconfig` přes `extends` nebo symlink míří mimo projekt: compiler host musí odmítnout projektový zdroj mimo kořen a označit omezení; test v Task 2.
3. Uživatel upraví soubor během dlouhého dotazu: výsledek je `stale` a nový dotaz vidí novou definici; test v Task 4.
4. Neplatný config nebo selhání workeru: strukturovaný dotaz vysvětlí fallback/chybu a následné `file.read`/`text.search` funguje; test v Task 4/5.
5. Symbol se 100 referencemi nebo dlouhou diagnostikou: prvních 50 a 32 KiB limit mají pravdivý `truncated` příznak; test v Task 2/3.

---

## File Structure

| Odpovědnost | Soubor |
| --- | --- |
| Přesný vstup/výstup nástroje | `shared/src/r4-typescript.ts`, `shared/src/index.ts` |
| Registrace read-only toolu | `backend/core/src/tools/typescript-query-tool.ts`, `backend/core/src/index.ts` |
| Bezpečný compiler host a dotazy | `backend/infrastructure/src/typescript/guarded-compiler-host.ts`, `backend/infrastructure/src/typescript/typescript-query-engine.ts` |
| Oddělené spuštění a limity | `backend/infrastructure/src/typescript/typescript-query-worker.ts`, `backend/infrastructure/src/typescript/typescript-query-client.ts` |
| Zapojení do R2/R3 a balení | `backend/infrastructure/src/create-r2-infrastructure.ts`, `backend/infrastructure/src/model/r3-runtime-factory.ts`, `apps/desktop/src/composition-root.ts`, `apps/desktop/src/main.ts`, `apps/desktop/webpack.main.config.ts`, `scripts/verify-packaged-r4-typescript.mjs` |
| Eval a důkazy | `tests/support/fixtures/r4-ts-queries/`, `docs/evals/r4-ts-queries-v1.json`, `docs/r4-acceptance.md`, `docs/architecture/r4-typescript-profile.md` |

### Task 1: Define a bounded structural tool contract

**Files:** Create `shared/src/r4-typescript.ts`, `backend/core/src/tools/typescript-query-tool.ts`; modify `shared/src/index.ts`, `backend/core/src/index.ts`; tests `shared/test/r4-typescript.test.ts`, `backend/core/test/typescript-query-tool.test.ts`.

**Interfaces:**
- Produce `typescriptQueryInputSchema`: discriminated `kind` for `definition`, `references`, `type`, `signature`, `exports`, `diagnostics`, `imports`; a relative `path`; 1-based `line`/`column` or bounded `symbol` where applicable; `maxResults` default 20, max 50.
- Produce `typescriptQueryOutputSchema`: `status: 'ok'|'limited'|'unsupported'|'stale'`, `mode: 'configured'|'fallback'`, `revision`, `targetHash`, bounded `items`, `truncated`, and safe `reason`. Items contain only path, 1-based range, symbol kind, short display/diagnostic fields and import/export relation where relevant. No AST node or source text field.
- Produce `typescriptQueryTool(handler): ToolDefinition` with `toolId:'typescript.query'`, `toolVersion:1`, `risk:'read_project'`.

- [ ] **Step 1: Write failing schema/tool tests.** Reject traversal, absolute/empty path, missing position and symbol, zero/negative coordinates, unknown kind, >50 results and >32 KiB output. Assert all seven query kinds are exposed in one descriptor and read-only risk never requests command permission.
- [ ] **Step 2: Run** `npx.cmd vitest run shared/test/r4-typescript.test.ts backend/core/test/typescript-query-tool.test.ts`; expect missing exports.
- [ ] **Step 3: Implement** schemas and tool wrapper. Reuse project path validation patterns but reject backslash aliases and NUL explicitly; validate the final serialized result size before returning it to the harness.
- [ ] **Step 4: Run** targeted tests; expect pass.
- [ ] **Step 5: Commit** contract, exports and tests as `feat(r4): define bounded TypeScript query tool`.

### Task 2: Build a guarded Compiler API engine

**Files:** Create `backend/infrastructure/src/typescript/guarded-compiler-host.ts`, `backend/infrastructure/src/typescript/typescript-query-engine.ts`; tests `backend/infrastructure/test/typescript-query-engine.test.ts`, `backend/infrastructure/test/typescript-query-security.test.ts`.

**Interfaces:**
- Consume Task 1 `TypeScriptQueryInput` and `project-check-discovery.ts` from Task 1 of the preceding verification plan.
- Produce `executeTypeScriptQuery(input: TypeScriptQueryInput, context: {root:string;policy:ContextPathPolicy;expectedRevision:number;signal:AbortSignal}): Promise<TypeScriptQueryOutput>`; the worker will call this engine.

- [ ] **Step 1: Write failing fixture tests.** Exercise declaration by position and name, references across files, function signature, inferred type, exports, diagnostics and import/export edges in TS/TSX/React/Next style files. Assert exact relative paths and 1-based ranges. Add invalid `tsconfig`, missing import, unsupported extension, nested config, ignored path and symlink/junction cases. Assert no output includes full AST or source text.
- [ ] **Step 2: Run** the two targeted Vitest files; expect missing engine failure.
- [ ] **Step 3: Implement** the bounded compiler host: canonicalize every candidate, enforce policy on project source files and config, track bytes/files, allow TypeScript standard libraries and the narrowly documented resolution-only declaration reads separately, and never return dependency contents. Parse the project config with the preceding plan's discovery service, construct a fresh `Program` and `TypeChecker`, then implement each query kind using Compiler API. The fallback is syntax-only for one allowed file and marks unavailable semantic fields.
- [ ] **Step 4: Apply** output limits while collecting results rather than after building an unbounded array; set `truncated` when the next item would exceed count or JSON byte limit. Normalize compiler errors to safe `limited`/`unsupported` reasons without logging project content.
- [ ] **Step 5: Run** targeted tests; expect pass.
- [ ] **Step 6: Commit** engine, guarded host and tests as `feat(r4): answer TypeScript structural queries`.

### Task 3: Isolate the query and prove packaging

**Files:** Create `backend/infrastructure/src/typescript/typescript-query-worker.ts`, `backend/infrastructure/src/typescript/typescript-query-client.ts`, `apps/desktop/src/smoke/run-r4-typescript-smoke.ts`, `scripts/verify-packaged-r4-typescript.mjs`; modify `apps/desktop/webpack.main.config.ts`, `apps/desktop/src/composition-root.ts`, `apps/desktop/src/main.ts`, `package.json`; tests `backend/infrastructure/test/typescript-query-client.test.ts`, `tests/packaged/r4-typescript-smoke.test.ts`.

**Interfaces:**
- Produce `TypeScriptQueryClient.query(root: string, input: TypeScriptQueryInput, expectedRevision: number, signal: AbortSignal): Promise<TypeScriptQueryOutput>` and `close(): Promise<void>`.
- Worker receives only validated query, canonical root and expected revision; its reply is parsed with `typescriptQueryOutputSchema` before the tool harness sees it. The composition root supplies the emitted worker asset path; core never imports Electron.

- [ ] **Step 1: Write failing client tests** for reply validation, 5 s timeout, abort, crash, oversized worker message and cleanup. Add a packaged smoke that queries a known symbol from the bundled fixture in the actual executable.
- [ ] **Step 2: Run** `npx.cmd vitest run backend/infrastructure/test/typescript-query-client.test.ts`; expect missing client failure.
- [ ] **Step 3: Implement** one short-lived worker per query. Export a separate Webpack main-process worker asset and inject its absolute path from `apps/desktop/src/composition-root.ts`. Add a narrow `--r4-ts-smoke` entry in `main.ts`, with an isolated profile and fixed fixture, plus `npm.cmd run test:r4-typescript-packaged` invoking the verifier script. Verify ASAR loading; if direct ASAR worker loading fails, unpack only this asset and map the worker path explicitly. On timeout/abort/crash terminate the worker, return a safe limited result and leave the desktop main process responsive.
- [ ] **Step 4: Run** the client test and build/package the desktop app; execute `tests/packaged/r4-typescript-smoke.test.ts` against that exact build. Record source/ASAR/worker identity and fix packaging before continuing.
- [ ] **Step 5: Commit** worker, packaging and tests as `feat(r4): isolate packaged TypeScript queries`.

### Task 4: Register the tool with fresh workspace and ignore policy

**Files:** Modify `backend/infrastructure/src/create-r2-infrastructure.ts`, `backend/infrastructure/src/model/r3-runtime-factory.ts`; tests `backend/infrastructure/test/r4-typescript-runtime.test.ts`, `backend/infrastructure/test/provider-context.test.ts`.

**Interfaces:** Consume Tasks 1–3 through existing `ToolRegistry`; no new renderer API. `typescript.query@1` returns `stale` if current observation differs from query start or if target hash changes.

- [ ] **Step 1: Write failing runtime tests.** A fake model discovers and invokes the tool; verify received/requested/result events and bounded tool output. Modify source, `tsconfig` and `.codrynignore` between successive calls; assert the next call sees new data or a visible deny. Change source during a held worker call; assert `stale`. Kill the worker and then call `file.read` and `text.search`; assert both remain usable.
- [ ] **Step 2: Run** the targeted tests; expect unknown tool failure.
- [ ] **Step 3: Register** the tool in the R2/R3 composition path, refresh policy before each query, observe workspace before and after, compare revision/fingerprint and target hash, and classify failure without promoting stale output to model context. Keep existing R1/R2 registry tests unchanged.
- [ ] **Step 4: Run** targeted tests plus `backend/infrastructure/test/r2-model-injection.test.ts`; expect pass.
- [ ] **Step 5: Commit** integration and tests as `feat(r4): expose fresh TypeScript queries to agent`.

### Task 5: Freeze a 20-query dataset and measure accuracy

**Files:** Create `tests/support/fixtures/r4-ts-queries/`, `docs/evals/r4-ts-queries-v1.json`, `scripts/eval-r4-typescript.mjs`, `scripts/eval-r4-typescript.test.mjs`; modify `package.json`, `docs/r4-acceptance.md`.

**Interfaces:** Dataset entries contain stable ID, query input, expected normalized output, rationale and fixture hash. Report lists observed output, match/mismatch, failure reason and exact source/build identity.

- [ ] **Step 1: Author 20 expected cases before running the evaluator:** 4 definitions, 4 references, 3 types, 2 signatures, 3 exports/imports and 4 diagnostics. Use plain TS, React/TSX and Next-style files with at least one re-export, alias, generic and intentionally invalid type. Manually inspect paths/ranges/types; commit expected values with fixture hashes before measuring.
- [ ] **Step 2: Write failing evaluator tests** that reject a changed fixture hash, missing case, duplicate ID, selected-only successes and a report that omits mismatches.
- [ ] **Step 3: Implement** `scripts/eval-r4-typescript.mjs` to run all frozen cases in order with the backend query engine and write a deterministic JSON report. Do not alter expected answers from observed output during the same run.
- [ ] **Step 4: Run** evaluator tests and the full 20-case eval; require at least 18 exact normalized matches. Record every mismatch, no cherry picking. If below threshold, fix the engine and rerun the unchanged dataset; any dataset correction gets its own documented review and commit.
- [ ] **Step 5: Commit** frozen fixture/expectations separately from the first measured report, then commit report and acceptance evidence as `test(r4): measure TypeScript structural queries`.

### Task 6: Verify regressions and hand off the structural profile

**Files:** Create `docs/architecture/r4-typescript-profile.md`; modify `docs/r4-acceptance.md`.

**Interfaces:** No new production API; consolidate evidence for `FR-TS-01..08` and `AC-O1-13` without claiming `AC-O1-14` repo-map completion.

- [ ] **Step 1: Document** compiler host boundaries, resolution-only declaration behavior, worker lifecycle, output budgets, fallback and invalidation, supported project types and measured limitations.
- [ ] **Step 2: Run** `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run check:deps`, then `npm.cmd test` sequentially after restoring lockfile dependencies. Run R2/R3 regressions and the packaged TypeScript smoke against a fresh build. Record exact output and build identity.
- [ ] **Step 3: Inspect** the final diff for content leaks, dependency-boundary violations and ignored-file reads; verify `git diff --check` and staging contains only this area before committing.
- [ ] **Step 4: Commit** architecture and acceptance updates as `docs(r4): record TypeScript profile evidence`. Push and PR only on explicit author request.

## Self-Review and Handoff

- Coverage: seven query kinds collectively cover `FR-TS-02..06`; fallback preserves `FR-TS-07`; fresh no-cache queries and before/after checks cover `FR-TS-08`. Recognition from the preceding plan covers `FR-TS-01`. The frozen 20-case report is the separate `AC-O1-13` gate.
- Type consistency: `TypeScriptQueryInput/Output` are shared schemas; core registers only a read-only tool; infrastructure owns Compiler API, filesystem and worker; the renderer sees only existing activity/projection data.
- Review focus is exercised in Tasks 2–4. The 18/20 score is conditional on actual eval output and cannot be claimed from this plan.
