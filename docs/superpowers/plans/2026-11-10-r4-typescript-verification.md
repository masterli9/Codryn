# R4 TypeScript Project Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vlastní úkol v malém TypeScript/React projektu dostane rozpoznané kontroly typů a testů; stav „ověřeno“ vznikne pouze po relevantních úspěšných kontrolách nad aktuálními změnami.

**Architecture:** Backend načte omezený profil projektu a vytvoří nabídku přesných příkazů bez instalace závislostí. Nabídka je informací pro model a uživatele, nikoli oprávněním ke spuštění. Existující permission engine stále schvaluje každý příkaz. `VerifyCommand` před spuštěním znovu klasifikuje přesný příkaz a po něm kontroluje úplný nezměněný snapshot. Výsledek typu `typecheck` a `test` se eviduje samostatně; dokončení a UI vyhodnotí jejich aktuálnost a pokrytí stejnou čistou politikou.

**Tech Stack:** TypeScript 6 Compiler API pro načtení `tsconfig`, Node.js 24.19.0, Zod, SQLite, Vitest, stávající Windows process runner a Electron/React.

**Spec:** `docs/superpowers/specs/2026-11-10-r4-user-driven-alpha-design.md` §1–2; `PRD_v1.1.md` `FR-TERM-04/05/06`, `FR-TS-01` (rozpoznání), `FR-ORCH-06/07`, `AC-O1-24`. Úplné strukturální dotazy `FR-TS-02..08` a jejich eval `AC-O1-13` mají následující oblastní plán.

## Global Constraints

- Windows 11, Node.js `24.19.0`, npm `>=11 <12`. Pracovat v existujících vrstvách; renderer nedostane přímé Node ani filesystem API.
- Žádná automatická instalace balíčků, síťový požadavek nebo skryté spuštění kontroly. Přesný příkaz, pracovní adresář, důvod a dopad jdou přes existující `command.run` a samostatné oprávnění.
- Objevování čte nejvýše 64 KiB na `package.json` a 64 KiB na každý projektový `tsconfig` soubor, maximálně 8 config souborů. Cesty musí zůstat uvnitř kanonického kořene, respektovat aktuální `ContextPathPolicy` a odmítnout symlink/junction alias mimo kořen. Při nejistotě vrátit `limited`/`unsupported`, ne falešnou důvěru.
- První důvěryhodný TypeScript check je přímé `node <přibalený typescript/bin/tsc> --noEmit -p <projektový tsconfig>`. Přibalený TypeScript musí být produkční závislost v balíčku; jeho verze je uvedena v diagnostice. Pokud má projekt vlastní odlišnou verzi, UI označí omezení, ale nesmí tiše instalovat ani spustit jinou verzi. Timeout 60 s, výstup nejvýše 256 KiB.
- První důvěryhodný test je pouze přímé `node --test --test-reporter=tap` pro `package.json` script přesně `node --test`, nebo přímé `node <lokální vitest/vitest.mjs> run --reporter=json` pro script přesně `vitest run`. Jiný script může být ručně spuštěn po schválení, ale nedostane důvěryhodné pokrytí v tomto plánu. Timeout 120 s, výstup nejvýše 256 KiB. Prázdná sada testů, potvrzená TAP/JSON počtem, není úspěšný důkaz.
- Pro stav `verified` musí projít jak typecheck, tak test nad stejnou aktuální revizí/fingerprintem a všechny změněné `.ts`/`.tsx` soubory musí být v platném `tsconfig` file setu. Změny jiných typů souborů, neúplný scan, chybějící kontrola nebo změna během kontroly vedou k `unverified`, `partially_verified` či `stale` podle stávajícího významu; přesné důvody a příkazy zůstanou viditelné.
- Běžné čtení/hledání a R3 referenční profil musí fungovat stejně jako před změnou. Testy nepoužijí živé API; placený model patří až do odděleného eval průchodu.
- V pracovní kopii nyní chybí `react` a `playwright`, takže `npm.cmd run typecheck` selhávalo před touto změnou. Před implementací obnovit závislosti z lockfile a zapsat výchozí stav kontrol.

## Review Focus

1. `package.json` obsahuje `test: "echo OK"`: nabídka ho může popsat jako nepodporovaný, ale exit 0 nikdy nevytvoří trusted coverage; test v Task 1/3.
2. `tsconfig` rozšiřuje soubor mimo projekt nebo přes junction: rozpoznání nesmí uniknout z kořene; test v Task 1.
3. Model po doporučení změní `package.json` či `tsconfig`: stará nabídka příkazu nesmí projít novým preflightem; test v Task 3.
4. Typecheck i test projdou, ale mezi nimi se změní zdrojový soubor: starší record je stale a výsledek nesmí být `verified`; test v Task 4.
5. Test skončí 0 bez nalezených testů: neuznat jej jako důkaz; test v Task 3/4.

---

## File Structure

| Odpovědnost | Soubor |
| --- | --- |
| Validovaný popis podpory a nabídky | `shared/src/r4-project-checks.ts`, `shared/src/index.ts` |
| Čisté vyhodnocení aktuálních kontrol | `backend/core/src/verification/project-check-policy.ts`, `backend/core/src/index.ts` |
| Bezpečné rozpoznání projektu a kandidátů | `backend/infrastructure/src/typescript/project-check-discovery.ts` |
| Důvěryhodná klasifikace příkazu a evidence | `backend/core/src/verification/verify-command.ts`, `shared/src/r2-verification.ts`, `backend/infrastructure/src/create-r2-infrastructure.ts`, `backend/infrastructure/src/persistence/sqlite-verification-store.ts` |
| Sestavení informací pro model a UI | `backend/infrastructure/src/model/r3-runtime-factory.ts`, `shared/src/model-contract.ts`, `backend/infrastructure/src/model/openai-responses-adapter.ts`, `backend/infrastructure/src/persistence/sqlite-desktop-projection-store.ts` |
| Projektová fixture a akceptace | `tests/support/fixtures/r4-ts-project/`, `docs/r4-acceptance.md` |

### Task 1: Discover a bounded TypeScript project profile

**Files:** Create `shared/src/r4-project-checks.ts`, `backend/infrastructure/src/typescript/project-check-discovery.ts`, `backend/infrastructure/test/project-check-discovery.test.ts`; modify `shared/src/index.ts`, `backend/infrastructure/package.json`, `package-lock.json`.

**Interfaces:**
- Produce `discoverProjectChecks(root: string, nodeExecutable: string | null, signal: AbortSignal): Promise<ProjectCheckCatalog>`.
- `ProjectCheckCatalog` has `level: 'supported'|'limited'|'unsupported'`, `framework: 'node'|'react'|'next'|'unknown'`, `typescriptVersion: string`, `configPaths: readonly string[]`, `includedFiles: readonly string[]`, `checks: readonly ProjectCheckCandidate[]`, `reasons: readonly string[]`, and a digest of the config/manifest bytes. Candidate has `kind: 'typecheck'|'test'`, exact `CommandSpec`, `available: boolean`, and `reason`.

- [ ] **Step 1: Write failing tests** for a plain TS, React and Next manifest; valid and invalid `tsconfig`; nested config within the 8-file limit; ignored/symlinked/out-of-root config; oversized manifest/config; missing local Vitest; unknown test script; script `echo OK`; and no `node_modules` installation. Assert supported checks have exact commands and no discovery call spawns a process or changes the fixture.
- [ ] **Step 2: Run** `npx.cmd vitest run backend/infrastructure/test/project-check-discovery.test.ts`; expect missing module failure.
- [ ] **Step 3: Implement** `discoverProjectChecks(...)` using a bounded filesystem host for the TypeScript Compiler API config parser. Resolve every config read against the real project root and current `ContextPathPolicy`; use the packaged TypeScript CLI for typecheck. Add TypeScript as a production dependency of `@codryn/infrastructure` and verify the package includes its runtime files.
- [ ] **Step 4: Run** the targeted test; expect pass.
- [ ] **Step 5: Commit** discovery, schema, dependency change and test as `feat(r4): discover TypeScript checks`.

### Task 2: Make suggested checks visible without running them

**Files:** Modify `shared/src/model-contract.ts`, `backend/infrastructure/src/model/r3-runtime-factory.ts`, `backend/infrastructure/src/model/openai-responses-adapter.ts`, `backend/infrastructure/src/persistence/sqlite-desktop-projection-store.ts`; tests `backend/infrastructure/test/provider-contract.test.ts`, `backend/infrastructure/test/r3-projection-store.test.ts`.

**Interfaces:**
- Add `recommendedChecks` to `ModelRequest`: at most two `{kind, command, available, reason}` values validated by Zod. The field is optional for R1/R2.
- Emit one `project.checks_discovered` event after run creation with level, framework, candidate kinds/availability and bounded reasons; do not log package script bodies, config text or model secrets.

- [ ] **Step 1: Write failing tests.** Assert the fake model and OpenAI transport receive only exact backend candidates as untrusted project metadata, and the activity panel shows a clear candidate/unavailable reason. Assert no command starts merely by discovering checks, including in Demo mode.
- [ ] **Step 2: Run** the two targeted tests; expect failures.
- [ ] **Step 3: Wire** discovery into R3 runtime before the first model request. Encode recommendations as data in the provider request, with a fixed instruction that they require separate permission and are not proof of successful verification. Add the event summary/details through the existing activity projection; no new renderer filesystem access.
- [ ] **Step 4: Run** targeted tests; expect pass.
- [ ] **Step 5: Commit** contract, provider mapping, runtime wiring and tests as `feat(r4): show relevant project checks`.

### Task 3: Classify and record real checks, retaining the R3 reference profile

**Files:** Modify `shared/src/r2-verification.ts`, `backend/core/src/verification/verify-command.ts`, `backend/infrastructure/src/create-r2-infrastructure.ts`, `backend/infrastructure/src/persistence/sqlite-verification-store.ts`; tests `backend/core/test/verify-command.test.ts`, `backend/infrastructure/test/r2-model-injection.test.ts`, `backend/infrastructure/test/verification-store.test.ts`, `backend/infrastructure/test/r4-ts-verification.test.ts`.

**Interfaces:**
- Extend `VerificationRecord.kind` to `'test'|'typecheck'`.
- Add optional `classify(command: CommandSpec, before: WorkspaceSnapshot): Promise<{kind:'test'|'typecheck';profileId:'r4-ts-v1';coveredPaths:readonly string[];evidenceFormat:'node-tap'|'vitest-json'|null} | null>` to `VerifyCommandDependencies`. Existing R2 `isRelevant`/`coverageFor` remains the fallback for `r2-sum-v1`.

- [ ] **Step 1: Write failing tests.** The classifier re-discovers the catalog after the `before` snapshot, compares the exact command and config digest, requires a nonempty test set, and returns coverage only for included `.ts`/`.tsx` paths. Unknown, `echo OK`, altered script, missing binary, symlink alias and changed config all return `null`. The R3 `sum.mjs` profile still passes its original tests.
- [ ] **Step 2: Run** the four targeted tests; expect failures for absent classification/kind support.
- [ ] **Step 3: Extend** `VerifyCommand` to classify before running. For `node-tap` require `# tests N` and `# pass N` with `N > 0` and `# fail 0`; for `vitest-json` require `numTotalTests > 0`, `numPassedTests === numTotalTests` and `numFailedTests === 0`. Keep process execution and permission behavior unchanged when classification returns `null`; such a command records `incomplete` with no trusted coverage. Persist `r4-ts-v1` coverage alongside `r2-sum-v1` without weakening either profile's validation.
- [ ] **Step 4: Run** targeted tests; expect pass.
- [ ] **Step 5: Commit** classification, store and tests as `feat(r4): record trusted TypeScript checks`.

### Task 4: Aggregate typecheck and test at one current workspace state

**Files:** Create `backend/core/src/verification/project-check-policy.ts`, `backend/core/test/project-check-policy.test.ts`; modify `backend/core/src/index.ts`, `backend/core/src/verification/verification-store.ts`, `backend/infrastructure/src/persistence/sqlite-verification-store.ts`, `backend/infrastructure/src/create-r2-infrastructure.ts`, `backend/infrastructure/src/persistence/sqlite-desktop-projection-store.ts`; tests `backend/infrastructure/test/r4-ts-verification.test.ts`, `backend/infrastructure/test/r3-projection-store.test.ts`.

**Interfaces:**
- Produce `assessProjectChecks(input: {changedPaths: readonly string[]; includedFiles: readonly string[]; records: readonly {record: VerificationRecord; profileId: string|null; coveredPaths: readonly string[]}[]; snapshot: WorkspaceSnapshot}): {status:'verified'|'partially_verified'|'unverified'|'stale'; reason:string; uncoveredPaths:readonly string[]; missingChecks:readonly ('typecheck'|'test')[]}`.
- Add `VerificationStore.list(runId: string, snapshot: WorkspaceSnapshot)` returning current/stale records with their profile and covered paths; `current()` stays for R2 callers.

- [ ] **Step 1: Write failing tests.** Two passing checks over the same complete snapshot and all changed TS/TSX files in `includedFiles` yield `verified`. One check only yields `partially_verified` in the UI and `unverified` for agent completion. A non-TS change, changed config, absent test files, stale revision, incomplete watcher observation, failed check or empty changed set cannot yield `verified`. Assert exact commands remain visible in the UI.
- [ ] **Step 2: Run** the three targeted tests; expect failures.
- [ ] **Step 3: Implement** the pure policy and SQLite `list`. Use the same assessment in backend `completion()` and desktop projection. Map `partially_verified` to `unverified` in `R2RunResult`, preserving a reason listing missing checks. A passing test cannot replace a missing or stale typecheck; a later passing check of the same kind supersedes an earlier failure only after both kinds pass on the current revision.
- [ ] **Step 4: Run** targeted tests; expect pass.
- [ ] **Step 5: Commit** policy, storage, projections and tests as `feat(r4): assess current project checks`.

### Task 5: Verify a user-driven TypeScript task end to end

**Files:** Create `tests/support/fixtures/r4-ts-project/` with a small TS module, one regression test, `package.json`, `tsconfig.json`, and one React component; add `backend/infrastructure/test/r4-ts-workflow.test.ts`; modify `docs/r4-acceptance.md`; create `docs/architecture/r4-project-verification.md`.

**Interfaces:** Consume Tasks 1–4 through existing `command.run`, permission broker, change set and verification views. No new automatic shell privilege.

- [ ] **Step 1: Write a failing integration test** in Git and non-Git fixtures: fake model receives discovered commands, patches a `.ts` file, asks to run typecheck and tests, waits for each separate approval, then sees structured failure/success results. Assert `verified` only after both current checks, and assert safe revert restores the original hash. Include an external edit between checks and a test failure followed by repair and rerun of both checks, within the existing step limit.
- [ ] **Step 2: Run** `npx.cmd vitest run backend/infrastructure/test/r4-ts-workflow.test.ts`; expect failures until previous tasks are complete.
- [ ] **Step 3: Complete** any missing composition wiring and the fixture; do not add a scripted production scenario tied to its filenames. Document packaged TypeScript runtime availability and support limits in `docs/architecture/r4-project-verification.md` and evidence in `docs/r4-acceptance.md`.
- [ ] **Step 4: Run** the targeted test; expect pass. Then run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run check:deps`, `npm.cmd test` sequentially. Run the existing R2/R3 packaged smoke because this plan changes the verification contract and runtime packaging. Record build identity and real results; leave live-model success unclaimed until a separate budgeted eval.
- [ ] **Step 5: Commit** fixture, integration test, wiring and evidence as `feat(r4): verify user TypeScript tasks`.

## Self-Review and Handoff

- Coverage: this plan implements the first general project-recognition and relevant-check slice of `FR-TS-01` and `FR-TERM-04/05/06`. Full React/Next structural capability `FR-TS-02..08`, `AC-O1-13`, repo map and Git workspace remain explicit later plans.
- Interface audit: discovery returns exact `CommandSpec`; `classify` re-derives it before run; `VerificationRecord.kind` distinguishes typecheck from test; completion and UI share `assessProjectChecks`. R2 `r2-sum-v1` is an independent fallback.
- Review focus tests appear in Tasks 1, 3 and 4. No optional test or documentation step stands in for a runtime proof.
