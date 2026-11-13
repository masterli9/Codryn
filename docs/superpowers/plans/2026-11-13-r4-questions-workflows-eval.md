# R4 Durable Questions, Built-in Workflows and Completion Evidence Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agent umí při podstatně chybějícím rozhodnutí položit strukturovanou otázku a po jedné odpovědi pokračovat v témže běhu; aplikace nabízí dva kurátorované pracovní postupy a dokončení R4 je podloženo čerstvou důkazní maticí, včetně živého eval zvoleného modelu.

**Architecture:** Otázka je nový trvalý typ kroku agentní smyčky. Stav, payload a přijetí odpovědi se ukládají transakčně; obnovení z checkpointu pokračuje se stejným runId, historií a schvalovacím tokem. Vestavěné postupy jsou verzované deklarativní manifesty, jejich výběr jen sestaví omezené instrukce a nástroje pod stejnými oprávněními. Důkazní matice odkazuje na skutečné testy/protokoly všech R4 oblastí a u každého povinného požadavku ukazuje splněno či otevřeno.

**Tech Stack:** TypeScript, Zod, SQLite, stávající agentní smyčka a permission engine, Electron/React, Vitest, fake model a oddělený OpenAI Responses live eval.

**Spec:** `PRD_v1.1.md` `FR-CHAT-19..21`, `FR-ORCH-11`, `FR-EXT-01/02`, `FR-LLM-12`, `AC-O1-25/31`; `docs/product/ROADMAP.md` §8; `docs/superpowers/specs/2026-11-10-r4-user-driven-alpha-design.md` §4/6 a společný průchod. Ostatní R4 AC se v tomto plánu auditují, jejich implementace je v předchozích oblastních plánech.

## Global Constraints

- Otázka vzniká jen při chybějícím uživatelském rozhodnutí, které může podstatně změnit plán, rozsah či výsledek. Obsahuje stručný důvod, 2–5 vzájemně odlišitelných možností a volnou textovou odpověď. Není oprávnění k nástroji, potvrzení destruktivní akce ani formulář na heslo, token či klíč.
- Přijetí odpovědi se váže na `questionId`, `runId` a idempotency key. Právě jedna odpověď přejde do pokračování; duplicitní požadavek vrátí tentýž výsledek, odlišná druhá odpověď je odmítnuta. Odmítnutí otázky pokračuje v původním běhu se strukturovaným `declined` výsledkem bez doplněného rozhodnutí; zrušení relace je jiná operace a ukončí běh. Restart rendereru ani desktopu nesmí znovu vykonat potvrzený nástroj; nejasný stav po pádu vyžaduje `recovery_required` místo slepého opakování.
- Čekání je trvalý stav v backendu. Časovač/AbortSignal aktivního modelového streamu se při čekání ukončí, ale runId a checkpoint zůstanou. Resume nesmí znovu začít od prvního promptu; před pokračováním ověří aktuální workspace a nedůvěřuje starým souborovým výstupům. Rizikový tool call po odpovědi projde původním permission enginem. Nejasný výsledek externího modelového tahu se označí a bezpečně znovu posoudí; žádný slíbený exactly-once účinek vzdáleného API se nepředpokládá.
- Manifest každého vestavěného skillu či pluginu má jméno, verzi, popis, schopnosti a požadovaná oprávnění. Registry umí evidovat a validovat oba druhy manifestů, odmítá duplicitní ID/verzi, neznámé capability a neplatný manifest. Manifest sám nemůže rozšířit povolení ani spustit kód. Import cizího manifestu je S/O1 a není součástí plánu.
- Katalog obsahuje alespoň jeden planning/brainstorming skill a jeden verification workflow. Jsou dostupné v Git i non-Git projektu, pracují přes stávající omezené nástroje a uvádějí své použití v auditu; nespouštějí instalace závislostí ani commit bez výslovné akce.
- Live eval používá již zvolený OpenAI Responses `gpt-6-luna` podle PRD a `docs/decisions/0007-r2-provider-selection.md`. Nepředstírá head-to-head srovnání modelů. Dataset, rozpočet, verze buildu a definice úspěchu se zafixují před spuštěním. Automatické testy a CI používají fake model a nespotřebují placené API.
- Důkazní matice rozlišuje skutečně implementované R4 M/O1 požadavky, již existující R2/R3 základ s čerstvou regresí, otevřené mezery a nezařazené S/O1 položky. R3 osobní přijetí se samovolně neuzavírá.

## Review Focus

1. Pád nebo restart po uložení odpovědi, ale před dalším modelem či po něm: pokračování a každý nástroj se provede nejvýše jednou.
2. Duplicitní/konkurenční odpovědi, jiný chat nebo staré questionId nemohou změnit čekající běh.
3. Model nabídne místo otázky sběr klíče nebo pokusí se obejít povolení: backend to odmítne; rizikový nástroj stále čeká na samostatný PermissionRequest.
4. Workflow manifest nesmí zvednout tool oprávnění, poslat ignorovaný obsah ani změnit celkový kontextový limit.
5. Eval report přizná modelovou chybu, chybu harnessu, nedostupné API, neúspěch i cenu/latenci; z několika úspěšných fixture nedělá tvrzení o libovolném projektu.

---

## File Structure

| Odpovědnost | Soubor |
| --- | --- |
| Otázka a IPC kontrakt | `shared/src/r4-question.ts`, `shared/src/model-contract.ts`, `shared/src/r3-chat.ts`, `shared/src/r3-ipc.ts`, `shared/src/index.ts` |
| Trvalá otázka a checkpoint | `backend/core/src/agent/run-agent-loop.ts`, `backend/core/src/state/agent-run.ts`, `backend/core/src/desktop/question-service.ts`, `backend/infrastructure/src/model/provider-tool-names.ts`, `backend/infrastructure/src/persistence/r4-question-migration.ts`, `backend/infrastructure/src/persistence/sqlite-question-store.ts` |
| Desktop propojení | `backend/infrastructure/src/create-r3-infrastructure.ts`, `backend/infrastructure/src/persistence/sqlite-desktop-projection-store.ts`, `apps/desktop/src/ipc/r3-handler.ts`, `apps/desktop/src/renderer/components/question-card.tsx`, `apps/desktop/src/renderer/workspace.tsx` |
| Registry a katalog | `shared/src/r4-extension.ts`, `backend/core/src/extensions/extension-registry.ts`, `backend/infrastructure/src/extensions/builtin-catalog.ts`, `backend/infrastructure/src/create-r2-infrastructure.ts` |
| Eval a důkazy | `tests/support/r4-eval/`, `scripts/eval-r4-model.mjs`, `docs/r4-acceptance.md`, `docs/r4-eval-report.md`, `docs/r4-requirement-matrix.md` |
| Testy | `shared/test/r4-question.test.ts`, `shared/test/r4-extension.test.ts`, `backend/core/test/question-service.test.ts`, `backend/infrastructure/test/question-recovery.test.ts`, `backend/core/test/extension-registry.test.ts`, `apps/desktop/test/question-card.test.tsx` |

### Task 1: Definovat otázku jako trvalý krok běhu

**Interfaces:** `Question` obsahuje `id`, `runId`, `chatId`, `reason`, `prompt`, 2–5 `{id,label,description?}` možností, `status`, čas a sekvenci; `QuestionAnswer` obsahuje vybranou možnost nebo vlastní text. Model volá verzovaný `ask_user@1` se Zod validovanými argumenty; loop jej zpracuje jako trvalý přechod do čekání, nikoli jako permission grant nebo běžný shell tool.

- [ ] **Step 1: Napsat selhávající schema/loop testy** pro 1/6 možností, duplicity, prázdný důvod, přehnanou délku, tajemství, neplatný chat/run a volný text. Ověřit přechod `waiting_for_model → waiting_for_user_input` se stejným runId a nulou tool callů po přechodu.
- [ ] **Step 2: Spustit** `npx.cmd vitest run shared/test/r4-question.test.ts backend/core/test/question-service.test.ts backend/core/test/run-agent-loop.test.ts`; ověřit nová selhání.
- [ ] **Step 3: Přidat** validovaný modelový výstup pro otázku, backendovou kontrolu vhodnosti a změnu loopu. `question.created` a změnu stavu uložit atomicky před oznámením UI. Čekající běh nepovažovat za dokončený desktop job.
- [ ] **Step 4: Spustit** cílené testy; commit `feat(r4): persist structured clarification questions`.

### Task 2: Právě jedno pokračování a samostatné oprávnění

**Interfaces:** `QuestionService.answer(questionId, requestId, value)` transakčně claimne čekající otázku a vrátí `accepted/duplicate/rejected`; `decline` a `cancel` jsou oddělené. Checkpoint obsahuje modelovou historii, step count, aktuální change set, výsledek hotových tool callů a poslední přijatou odpověď; resume používá stejné runId.

- [ ] **Step 1: Napsat selhávající testy** pro dvě současné odpovědi, opakované requestId, jinou druhou odpověď, restart po claimu i po modelovém tahu, zrušení, odmítnutí a starý workspace. Testovat navazující risk tool, který zůstane v `waiting_for_approval`.
- [ ] **Step 2: Spustit** `npx.cmd vitest run backend/infrastructure/test/question-recovery.test.ts backend/core/test/question-service.test.ts`; ověřit selhání.
- [ ] **Step 3: Přidat** SQLite migraci pro otázku, odpověď a checkpoint s unikátními klíči. Obnovení rekonstruuje pouze potvrzené kroky event logu; již vykonaný tool se neopakuje. Po odpovědi znovu posoudit aktuální kontext a workspace revizi, ale nevyměnit runId ani historii zadání.
- [ ] **Step 4: Zajistit** oddělení otázky od `PermissionRequest` v `ToolExecutionHarness`; žádná odpověď nemění policy decision. Spustit recovery/permission test; commit `feat(r4): resume one agent run after one answer`.

### Task 3: Zobrazit otázku a obnovit ji po restartu

**Interfaces:** `question.answer`, `question.decline`, `question.current` jsou úzké validované IPC operace vázané na projekt/chat/run. Snapshot a aktivita ukazují otevřenou otázku, její důvod a stav; UI nabízí 2–5 voleb, vlastní text, odmítnutí a zrušení běhu.

- [ ] **Step 1: Napsat selhávající desktop testy** pro přístupnost klávesnicí, vlastní text, dvojklik, zpožděnou odpověď po přepnutí chatu, restart rendereru, odmítnutí a samostatný dialog oprávnění po pokračování.
- [ ] **Step 2: Spustit** `npx.cmd vitest run apps/desktop/test/question-card.test.tsx`; ověřit selhání.
- [ ] **Step 3: Rozšířit** projekci/IPC a UI card. Po reconnectu číst backendový stav, ne lokální draft jako autoritu. Zobrazit jasně, že odmítnutí otázky není schválení akce.
- [ ] **Step 4: Spustit** E2E `AC-O1-31` včetně restartu a permission requestu; commit `feat(r4): answer durable questions in chat`.

### Task 4: Registry a dva vestavěné pracovní postupy

**Interfaces:** `ExtensionManifest` je přísně validovaný `{id,kind,name,version,description,capabilities,requiredPermissions}`; `ExtensionRegistry.register/list/resolve` validuje skill i plugin manifest, v O1 spouští pouze kurátorované built-in položky. Katalog obsahuje plánovací nebo brainstorming **skill** a ověřovací **workflow**. `WorkflowRunner` připraví bounded instrukce a volá existující nástroje přes `ToolExecutionHarness`.

- [ ] **Step 1: Napsat selhávající testy** pro schema obou druhů manifestu (skill/plugin), duplicity, unknown capability, nepovolené oprávnění, neexistující verzi a dva požadované katalogové typy. Fake běh musí ukázat, že workflow nezíská přímé filesystem/shell API a jeho použití má auditní událost.
- [ ] **Step 2: Spustit** `npx.cmd vitest run shared/test/r4-extension.test.ts backend/core/test/extension-registry.test.ts`; ověřit selhání.
- [ ] **Step 3: Implementovat** read-only registry a lokální katalog: plánovací skill vytvoří omezený krokový návrh bez zápisu; ověřovací workflow zvolí dostupný relevantní check podle TypeScript verification plánu a zaznamená skutečný výsledek. Při chybějící závislosti nic neinstaluje bez potvrzení.
- [ ] **Step 4: Zpřístupnit** výběr workflow validovaným backendovým vstupem a stručným UI popisem oprávnění. Přidat integrační test v Git i non-Git fixture; commit `feat(r4): provide curated planning and verification workflows`.

### Task 5: Rozšířený modelový eval

**Interfaces:** Verzovaný dataset obsahuje prompt, projektový fixture, očekávaný výsledek, tool call/argument assertions, opravu po chybě a rozpočet. Report po každém pokusu eviduje model, datum, build hash, úspěšnost, validitu argumentů, dokončení změny, recovery, latenci, input/output/reasoning tokeny a odhad ceny celého úkolu; nedostupná usage metadata jsou `unknown`.

- [ ] **Step 1: Zafixovat** dataset před live během: běžný uživatelský TypeScript/React prompt mimo `sum.mjs`, navazující prompt v témže chatu, ignorovanou referenci, stale patch, otázku, Git/non-Git projekt a opravný krok po chybě. Spustit ho nejdřív s fake adapterem a ověřit metriky/report schema.
- [ ] **Step 2: Přidat** opt-in `scripts/eval-r4-model.mjs` s maximem požadavků a nákladů, explicitním zapnutím placeného API a bezpečným uložením reportu bez promptového tajemství. Převzít zvolený model a existující consent cestu.
- [ ] **Step 3: Po implementaci ostatních R4 plánů spustit** live eval za schváleného rozpočtu. V `docs/r4-eval-report.md` oddělit modelovou chybu, chybu harnessu a nedostupnost API; zveřejnit všechny pokusy i neúspěchy. Nepřepisovat historický R2 eval ani netvrdit nové porovnání providerů.
- [ ] **Step 4: Ověřit** `FR-LLM-12` a `AC-O1-25` proti skutečnému reportu/rozhodnutí; commit dataset, skript a report jako samostatný celek.

### Task 6: Dokončovací matice R4

- [ ] **Step 1: Zapsat** do `docs/r4-requirement-matrix.md` všechny M/O1 řádky R4 z aktuálního PRD a ROADMAP §8, konkrétní implementaci, test/protokol, build hash a stav `passed/open/blocked`. Projít i všechna `AC-O1-01..31`: rozlišit dřívější R2/R3 důkaz, čerstvou regresi, nový R4 důkaz a otevřenou mezeru. Zvlášť uvést volitelné S/O1 položky, které do buildu nevstoupily.
- [ ] **Step 2: Spustit** kompletní relevantní testy, typecheck, lint, `check:deps`, packaged desktop smoke a ruční průchod hlavním uživatelským tokem s reálným modelem. Regrese pokrývá R2/R3 ochrany, kontext, TS, otázky, workspace a Git. Nesplněné kontroly neznačit jako pass.
- [ ] **Step 3: Dodat** `docs/r4-acceptance.md` s přesným datem, prostředím, příkazy, výsledky, omezeními a odkazy na důkazy. R3 osobní checklist vyhodnotit samostatně s autorem, nikoli ho automaticky potvrdit.
- [ ] **Step 4: Provést** code review a kontrolu stagingu; commitnout pouze pravdivý finální report. R4 označit za dokončené až při splnění všech M/O1 bran. Push/PR jen po výslovné žádosti autora.

## Self-review

- `FR-CHAT-19..21` a `FR-ORCH-11` mají oddělený kontrakt, persistenci, obnovení a E2E důkaz; otázka nikdy neplní roli oprávnění.
- `FR-EXT-01/02` obsahují úplný manifest i dva skutečně vykonatelné built-in postupy; cizí import není potichu zařazen.
- `FR-LLM-12`/`AC-O1-25` požadují živý eval, ale jeho spuštění je až po implementaci, s explicitním rozpočtem a zveřejněnými neúspěchy.
- Dokončovací matice ověřuje soulad se schváleným PRD a neprohlašuje plány za hotový produkt.
