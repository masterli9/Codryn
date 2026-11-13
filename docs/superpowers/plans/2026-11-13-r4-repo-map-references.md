# R4 Repo Map, @ References and Context Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Po otevření projektu vznikne rychlá aktuální mapa; uživatel může v chatu vybrat soubor nebo složku přes `@` a před odesláním vidí změněnou či nedostupnou referenci. Backend pošle modelu jen omezený relevantní výřez a zapíše, odkud skutečně pocházel.

**Architecture:** Jedna backendová politika rozhoduje o každém projektovém zdroji. Asynchronní index ukládá verzované položky mapy, zatímco dotaz pro konkrétní úkol načte jen relevantní položky a případně je prohloubí. Composer drží strukturované ukazatele, backend při odeslání znovu ověří jejich identitu, obsah a pravidla. Context assembler oddělí text zadání, historii, mapu a načtené výřezy a zaznamená jejich metadata bez kopie obsahu v auditu.

**Tech Stack:** TypeScript, Zod, SQLite (`node:sqlite`), React, úzké Electron IPC, Vitest; stávající `ProjectFilesystem`, `FileWorkspaceObserver` a plánovaný TypeScript query engine.

**Spec:** `docs/superpowers/specs/2026-11-10-r4-user-driven-alpha-design.md` §3 a `docs/superpowers/specs/r4-context-security.md`; `PRD_v1.1.md` `FR-CHAT-12..14`, `FR-CTX-01..06/12..17`, `AC-O1-14/17/18/27`; plány návaznosti chatu a TypeScript strukturálního profilu.

## Global Constraints

- Task 0–1 tohoto plánu tvoří sdílený bezpečnostní základ a provedou se před TypeScript discovery/indexem i finálním sestavením kontextu chatu. Task 2–6 navazují na plán historie chatu; TypeScript query engine je volitelný zdroj pro prohloubení mapy, nikoli podmínka otevření projektu. Tyto plány jsou zatím dokumentace, ne hotové funkce.
- Backend je zdroj pravdy. Renderer dostane jen validované IPC výsledky, nikdy přímý filesystem nebo Node API. Každý požadavek ověřuje vlastnictví projektu/chatu a projektově relativní cestu včetně realpath cíle. Bezpečnostní výjimky jsou jednorázové a vázané na jeden soubor a akci.
- Rychlý základ je deterministický: cesty, typy, malá metadata projektu a hlavní symboly/exporty jen tam, kde je lze bezpečně a levně zjistit. „Role“ je krátká odvozená klasifikace (`source`, `test`, `config`, `docs`, `other`), ne domněnka modelu. Mapový záznam vždy nese hash obsahu nebo stav `unread`, verzi politiky a stav čerstvosti.
- Rychlý crawl: nejvýše 5 000 položek, 64 MiB přečtených dat, 5 s na běh a 1 MiB na soubor. Jeho neúplnost se zobrazí. Prohloubení pro úkol vybírá nejvýše 12 položek a 32 KiB výsledných metadat; ruční hlubší inicializace má samostatné rozpočty 5 000 položek, 64 MiB a 30 s a také přizná neúplnost. Žádná z těchto operací nepošle automaticky obsah souborů modelu.
- `@` ukazatel obsahuje druh (`file`/`directory`), kanonickou projektově relativní cestu a revizi z okamžiku výběru. Nejvýše osm ukazatelů v zadání. Souborový výřez má nejvýše 16 KiB UTF-8, jeden běh nejvýše 64 KiB z explicitních referencí; složka přidá jen omezený seznam položek/metadat, nikdy všechna těla souborů. Překročení je viditelné, ne tiché zkrácení bez záznamu.
- Před odesláním se kontroluje existence, druh, obsahový hash, policy revision, velikost a kanonický cíl. Změněná, přejmenovaná či smazaná reference je stav k rozhodnutí uživatele: může ji znovu vybrat nebo odebrat, původní obsah se nepoužije. Backend znovu kontroluje při sestavení kontextu, takže UI preflight není autoritou.
- Ignorovaná běžná cesta smí získat výjimku jen pro konkrétní soubor, konkrétní odeslání a explicitní volbu uživatele. Známé tajemství má oddělené varování a explicitní potvrzení pro stejný soubor/akci; žádná výjimka se nevztahuje na složku, crawl, index ani další běh. Negace v `.codrynignore` nesmí trvale zrušit ochranu známého tajemství. Neplatné `.codrynignore` ukáže řádek a důvod a zastaví nové odvozené čtení do opravy pravidla.
- Audit ukládá ID běhu, zdroj (`user_text`, `chat_history`, `project_reference`, `repo_map`, `loaded_excerpt`), cestu/ID, hash, použité bajty a rozsah řádků, stav a důvod vynechání. Neukládá druhou kopii obsahu ani tajemství. Uživatel u běhu vidí stručný přehled; úplný audit je v backendovém event logu.
- Automatické testy používají fixture a fake model. Srovnání mapy s baseline bez mapy používá předem fixovanou stejnou sadu úloh, měří tokeny/kroky/úspěch a netvrdí přínos, pokud ho data neukážou. Placený live eval je oddělený.

## Review Focus

1. Změna `.codrynignore` nebo souboru během běžícího crawlu: stará generace se nesmí zapsat jako čerstvá ani dostat do kontextu.
2. `@` složka se symlinkem/junction mimo projekt nebo do ignorované cesty: žádný obsah ani metadata zakázaného cíle neuniknou.
3. Změna souboru mezi vybráním `@`, preflightem a sestavením modelového požadavku: backend vrátí `stale`; nepoužije uložený text.
4. Jednorázová výjimka pro ignorovaný soubor: nepovolí sousední soubor, složku, index, jiné zadání ani restartovaný pokus bez nového potvrzení. Tajemství má samostatné varování.
5. Při pádu, abortu, limitu nebo neplatném pravidle zůstane chat použitelný a audit pravdivě označí, co nebylo načteno.

---

### Task 0: Ověřit kontextovou a bezpečnostní specifikaci před kódem

- [ ] **Step 1: Ověřit** existující `docs/superpowers/specs/r4-context-security.md` proti aktuálnímu kódu, PRD, roadmapě §8 a TypeScript plánům.
- [ ] **Step 2: Uzavřít** rozhraní jednotné politiky a případné technické rozpory před produkční implementací; zaznamenat přijaté rozhraní v dokumentačním commitu.

---

## File Structure

| Odpovědnost | Soubor |
| --- | --- |
| Vstupy/výstupy mapy, referencí a auditu | `shared/src/r4-context.ts`, `shared/src/r3-chat.ts`, `shared/src/r3-ipc.ts`, `shared/src/model-contract.ts`, `shared/src/index.ts` |
| Jednotná politika | `backend/infrastructure/src/filesystem/context-path-policy.ts`, `backend/infrastructure/src/filesystem/project-filesystem.ts`, `backend/infrastructure/src/filesystem/workspace-observer.ts` |
| Mapa a uložení | `backend/infrastructure/src/context/repo-map-builder.ts`, `backend/infrastructure/src/context/repo-map-store.ts`, `backend/infrastructure/src/persistence/r4-repo-map-migration.ts` |
| Výběr a reference | `backend/core/src/agent/context-assembler.ts`, `backend/core/src/agent/run-agent-loop.ts`, `backend/infrastructure/src/context/reference-resolver.ts`, `backend/infrastructure/src/model/r3-runtime-factory.ts` |
| Desktop propojení | `backend/infrastructure/src/create-r3-infrastructure.ts`, `apps/desktop/src/ipc/r3-handler.ts`, `apps/desktop/src/renderer/components/composer.tsx`, `apps/desktop/src/renderer/workspace.tsx`, `apps/desktop/src/renderer/styles.css` |
| Testy | `shared/test/r4-context.test.ts`, `backend/infrastructure/test/context-path-policy.test.ts`, `backend/infrastructure/test/repo-map.test.ts`, `backend/infrastructure/test/reference-resolver.test.ts`, `backend/core/test/context-assembler.test.ts`, `apps/desktop/test/r4-references.test.tsx`, integrační fixture pod `tests/support/` |

### Task 1: Sjednotit pravidla projektových cest

**Interfaces:** `ContextPathPolicy.decide(path, action)` vrací `allowed`, stabilní kód a bezpečný důvod; `revision` je hash výchozí politiky a platných pravidel. Rozhodnutí rozlišuje `crawl`, `search`, `typescript_index`, `map`, `deep_init`, `context` a `explicit_file`. `refresh()` mění revizi atomicky, nebo vrací chybu s řádkem.

- [ ] **Step 1: Napsat selhávající kontraktní testy** pro výchozí `.git`, `node_modules`, build/cache, `.env*`, klíče a binární/velké soubory; neplatné syntaxe s číslem řádku; negaci, která nesmí znovu povolit tajemství; adresáře, Windows case/oddělovače, symlinky a změnu politiky. Stejná fixture projde přes současný crawl/search/context a po implementaci TS engine také přes TS index a mapu.
- [ ] **Step 2: Spustit** `npx.cmd vitest run backend/infrastructure/test/context-path-policy.test.ts backend/infrastructure/test/project-filesystem.test.ts backend/infrastructure/test/workspace-observer.test.ts`; ověřit očekávané selhání nových případů.
- [ ] **Step 3: Upravit** `ContextPathPolicy` a sdílené volání ve filesystemu/observeru; při pozdější implementaci TS engine použít tutéž metodu. Politika se před každým novým čtením osvěží. Cache/index drží policy revision. Nepotlačovat chybu pravidla na obecné `invalid reference`. Dokumentovat podporovanou podmnožinu syntaxe v uživatelské dokumentaci.
- [ ] **Step 4: Spustit** cílené testy; commit `feat(r4): unify project context path policy`.

### Task 2: Vytvořit rychlý základ repo mapy

**Interfaces:** `RepoMapStore` ukládá `{projectId, path, kind, role, symbols, contentHash, policyRevision, generation, freshness}`; `RepoMapBuilder.start(projectId, root, signal)` vrací okamžitě handle se stavem a pokračuje v odděleném workeru mimo cestu otevření projektu. Čtení vrací jen položky shodné s aktuální revizí a politikou.

- [ ] **Step 1: Napsat selhávající testy** nad malým TS/React fixture: deterministické řazení, nepřítomnost ignorovaných položek, základní role/exporty, limity, neúplný stav, zavření projektu, restart, souběžná úprava souboru a změna pravidel. Ověřit, že `project.open` odpoví před dokončením uměle zpomaleného scanu.
- [ ] **Step 2: Spustit** `npx.cmd vitest run backend/infrastructure/test/repo-map.test.ts`; ověřit selhání.
- [ ] **Step 3: Přidat** SQLite migraci, builder a krátce žijící worker s abortem/timeoutem. Zabalit worker do Electron buildu a ověřit packaged smoke. Skenovat seřazené kanonické cesty, před čtením i po něm kontrolovat typ/cíl/politiku; velké binární soubory vynechat, ostatní nad limitem zpracování evidovat jen bezpečným stavem `unread`. Odvozené položky zapisovat po dávkách pod generačním číslem; starší generace nesmí přepsat novější.
- [ ] **Step 4: Propojit** start s `project.open` v `create-r3-infrastructure.ts`; do UI poslat přes úzké IPC pouze stav `indexing/ready/partial/error` a počty. Otevření a běžný chat zůstanou funkční při chybě indexu.
- [ ] **Step 5: Spustit** cílené a IPC testy; commit `feat(r4): build bounded asynchronous repo map`.

### Task 3: Cílené prohloubení a ruční hlubší inicializace

**Interfaces:** `RepoMapBuilder.deepen(projectId, task, explicitPaths, signal)` vrací nejvýše 12 aktuálních položek s důvodem výběru a stavem limitu. `init(projectId, signal)` je samostatná backendová akce vracející stav/progres; jeden projekt má nejvýše jeden aktivní init. Mapové metadata se nestávají vyšší autoritou než projektová pravidla.

- [ ] **Step 1: Napsat selhávající testy** pro výběr podle cesty, symbolu a názvu z úkolu; deterministické pořadí při shodě; žádné čtení nerelevantních souborů; TS engine dostupný/nedostupný; změnu importované závislosti, `tsconfig` a `.codrynignore`; souběh init a běžného scanu. Ruční init musí zahrnout strukturu, konfiguraci, symboly, vazby a povolené projektové instrukce, každou jako odlišný zdroj.
- [ ] **Step 2: Spustit** `npx.cmd vitest run backend/infrastructure/test/repo-map.test.ts`; ověřit selhání nových případů.
- [ ] **Step 3: Implementovat** omezené prohloubení a invalidaci závislých položek podle hashů a import/export vazeb. Ruční init čte povolené projektové instrukce podle stejné politiky a ukládá jejich vlastní hash/autoritu odděleně od odvozeného shrnutí. Před sestavením kontextu znovu ověřit čerstvost vybraných položek; neaktuální přepočítat v limitu nebo vynechat s důvodem. Připojit symboly z TypeScript engine, je-li k dispozici.
- [ ] **Step 4: Přidat** validované `context.map.status` a `context.map.init` IPC operace a viditelnou akci „Prohloubit mapu projektu“ se stavem a možností zrušení. Ověřit přístup jen k otevřenému projektu.
- [ ] **Step 5: Spustit** cílené a desktop integrační testy; commit `feat(r4): deepen and refresh repo map on demand`.

### Task 4: Vyhledat a vložit @ reference

**Interfaces:** `context.reference.search` přijímá projekt/chat, dotaz do 200 znaků a stránku do 50 výsledků; vrací povolené soubory i složky, relativní cestu, druh, revizi a případný stav/důvod. `R3SubmitInput.references` je pole nejvýše osmi strukturovaných ukazatelů. Strukturované reference se uloží s požadavkem kvůli retry a historii; identita požadavku zahrne i reference.

- [ ] **Step 1: Napsat selhávající schema/backend/UI testy**: klávesnice `@`, šipky/Enter/Escape, výběr souboru/složky, odebrání chipu, výměna chatu, retry, dlouhé cesty, duplicitní reference, absolutní/traversal cesty, ignorované a symlink cíle. Testovat zpožděnou odpověď hledání po změně chatu.
- [ ] **Step 2: Spustit** `npx.cmd vitest run shared/test/r4-context.test.ts apps/desktop/test/r4-references.test.tsx`; ověřit selhání.
- [ ] **Step 3: Rozšířit** Zod kontrakty, IPC handler, backendovou search službu a `Composer`. Výsledky filtrovat před návratem; renderer pouze zobrazuje bezpečné metadatum. Reference ukládat v konceptu po chatu a posílat se stejným requestId při retry.
- [ ] **Step 4: Upravit** persistenci `desktop_jobs.input_json` a projekci zprávy tak, aby obnovení ukázalo zvolené cesty, aniž by načítalo jejich obsah. U starších zpráv je `references=[]`.
- [ ] **Step 5: Spustit** cílené testy a desktop E2E `@` interakce; commit `feat(r4): select file and folder references in chat`.

### Task 5: Znovu ověřit reference a sestavit omezený kontext

**Interfaces:** `ReferenceResolver.resolve(input, projectRevision, signal)` vrací pro každý ukazatel `ready`, `changed`, `missing` (včetně možné přejmenované cesty), `ignored`, `sensitive`, `oversized`, `binary`, `outside_root` nebo `limited` spolu s bezpečným důvodem. UI zobrazí `missing` jako „soubor nebo složka již na této cestě není; může být přejmenována“ a nikdy referenci samo nepřesměruje. `ContextAssembler` přijímá výsledek resolveru, navazující historii a aktuální mapový výběr; výstup rozlišuje typy zdrojů a limity. Pro změněné/nedostupné explicitní reference se běh před modelem zastaví s použitelným stavem, koncept zůstane.

- [ ] **Step 1: Napsat selhávající testy** pro změnu/smazání/přejmenování, změnu po preflightu, folder s 500 položkami, 1 MiB soubor, UTF-8 hranici, ignorovaný běžný soubor, `.env` a klíč, souběžné změny politiky a symlink/junction alias. Prokázat, že modelový fake nikdy nevidí zakázaný či starý obsah.
- [ ] **Step 2: Spustit** `npx.cmd vitest run backend/infrastructure/test/reference-resolver.test.ts backend/core/test/context-assembler.test.ts`; ověřit selhání.
- [ ] **Step 3: Implementovat** resolver s dvojí kontrolou cesty/politiky/revize před a po čtení. Výřez vybírat po řádcích podle explicitního cíle a relevantních symbolů z aktuální mapy; když důvod pro užší výběr není, použít začátek souboru do 16 KiB a označit `truncated`. Folder vrátí nejvýše 100 bezpečných položek a `truncated` příznak. Neposílat raw `@` syntaxi jako pokyn k automatickému přečtení souboru.
- [ ] **Step 4: Zavést** jednorázový backendový permit pro konkrétní běžný ignorovaný soubor/akci. Samostatný tok s varováním pro známé tajemství; permit je navázaný na requestId, cestu a hash, spotřebuje se právě jednou při sestavení kontextu. Změna cesty/hash nebo retry vyžaduje novou volbu. Dodat explicitní UI stav, který neblokuje odstranění reference.
- [ ] **Step 5: Propojit** `r3-runtime-factory.ts` s reálnými referencemi z požadavku. Zachovat pořadí a rozpočet: aktuální text, omezená historie, projektová pravidla, explicitní výřezy a malý mapový výběr; při nedostatku místa vynechat mapu před explicitním souborem a vždy zaznamenat důvod. Projektová pravidla označit jako pravidla, nikoli jako modelově odvozené shrnutí.
- [ ] **Step 6: Spustit** cílené testy a end-to-end fake běh; commit `feat(r4): resolve references into bounded current context`.

### Task 6: Audit, důkazní průchod a dokončovací kontrola

**Interfaces:** `context.assembled` a projektový pohled běhu uvedou každý vybraný/odmítnutý zdroj a skutečně použité bajty/řádky/hash, bez textu souboru. UI stručně ukáže „zadání / historie / pravidla / mapa / @ výřez“ a důvod zkrácení nebo vynechání.

- [ ] **Step 1: Napsat kontraktní test auditu** odlišující text, ukazatel a výřez; ověřit, že audit ani log neobsahuje secret fixture. Testovat partial mapu, stale historii a soubor změněný těsně před odesláním.
- [ ] **Step 2: Přidat** event metadata a jejich validovanou projekci do `run.inspect`/aktivity; vložit stručný přehled do desktop běhu. `ContextSourceAudit` rozšířit o stav a důvod, modelový obsah oddělit.
- [ ] **Step 3: Spustit** suite pro `AC-O1-14/17/18/27`, regresní context/file/search/TS testy a `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run check:deps`. Přidat časovaný protokol rychlého otevření a responzivity UI, včetně dosažených limitů.
- [ ] **Step 4: Zafixovat** fixture úlohy baseline s mapou/bez mapy před měřením. Spustit fake průchod a zveřejnit tokeny, kroky a věcný výsledek každé úlohy; případný live report oddělit. Nesplněná AC označit otevřeně.
- [ ] **Step 5: Zkontrolovat** staging, diff, migraci starších chatů a čistý restart; commit `test(r4): prove context map references and audit`. Bez push/PR bez pokynu autora.

## Self-review

- Každý nový zdroj obsahu pro model prochází stejnou aktuální politikou, limity a revizní kontrolou; renderer žádný soubor nečte.
- Výchozí scan, prohloubení a ruční init jsou oddělené operace s viditelným stavem. Neúplnost není vydávána za úplnou mapu.
- `@` reference je ukazatel. Výběr, preflight i finální resolver mají samostatné testy proti změně a úniku dat.
- Tento plán nepřisuzuje již dokončenou implementaci předchozím R4 plánům ani neuzavírá R3 osobní přijetí.
