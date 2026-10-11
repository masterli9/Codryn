# R3.5 – Windows důkazy a dokončení Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doložit skutečný desktopový průchod nad R2, ochranu klíče po restartu a bezpečné ukončení procesu v zabalené Windows aplikaci.

**Architecture:** Stejné aplikační služby se ověří přes CLI a produkční preload/renderer; deterministický model připravuje rozhodnutí, skutečné SQLite/Git/soubory/procesy provádějí práci. Zabalený smoke a vizuální/autorská kontrola jsou samostatné důkazy.

**Tech Stack:** Vitest host-integration, izolované Git/non-Git fixture, Playwright Electron test driver, Forge Windows package, safeStorage/DPAPI.

**Spec:** [R3 specifikace](../specs/2026-10-11-r3-electron-workspace-design.md), §8–10; ROADMAP §7 a PRD akceptační kritéria.

## Global Constraints

Platí [R3 index](2026-10-11-r3-implementation.md). E1 začíná po D3/D4,
E2 po zelené E1. Automatika bez skutečného API klíče a síťového modelu.
Fixtures, process ID a profile cesty vlastní test; cleanup nesmí zasáhnout
projekt autora, jeho profil ani cizí proces. Autorský checklist nezaškrtává agent.

## Review Focus

CLI/UI rozdílné permission nebo dokončovací pravidlo (E1), UI ukáže hotovo
před koncem potomka (E1/E2), launcher nechtěně použije vývojový Electron
místo výsledného exe (E2), OS ochrana jen nahrazena mockem (E2), zelený
offline smoke vydáván za live modelový či autorský důkaz (E3).

## E1: Skutečný renderer, CLI shoda a problémové průchody

**Create:** tests/desktop/r3-workflow.test.ts,
tests/desktop/r3-lifecycle.test.ts,
tests/desktop/r3-secrets.test.ts,
tests/support/src/r3-desktop.ts,
scripts/verify-r3-desktop.mjs.
**Modify:** tests/support/src/index.ts, package.json, package-lock.json,
vitest.config.ts (samostatný opt-in desktop-e2e projekt),
apps/desktop/src/composition-root.ts (úzké neprodukční testové skládání).
**Test:** tři nové tests/desktop soubory a stávající CLI change-verify-return testy.

**Interfaces:** `launchR3Desktop({executable,profileRoot,projectRoot,scenario})`
je test helper v tests/support; vrátí `{app,window,close,artifacts}`.
`scenario` je pevný enum referenčního demo/deny/cancel/interrupted scénáře,
nikoli obecný execution hook z rendereru. Test runner sestaví produkční
služby s modelem na portu ModelAdapter a ovládá UI přes přístupné názvy.
`normalizeRunEvidence(result,events)` ignoruje pouze UUID/časy/temp root,
nikoli stav, tool vstup, rozhodnutí oprávnění, exit code či obsah změny.
Helper pro Git baseline zachytí `.git/index` bytes/hash, HEAD a porcelain
před během a po návratu; non-Git helper zachytí všechny výchozí soubory.

- [ ] **1. Napsat E2E testy.** Git i non-Git: nejméně dvě čtení/hledání → patch existujícího sum.mjs → viditelná žádost → allow_once → reálné node --test sum.test.mjs → verified → souhrnný diff → vrácení sady. Stejný scénář přes CLI má významově shodný audit a změnu, UI nemá vlastní pravidlo. Git fixture má navíc staged, unstaged a untracked práci uživatele; návrat ji i index zachová. Další průchody: deny nic nespustí; reload rendereru během approval zachová stejné ID a spustí jednou; přepnutí chatu neukončí běh; druhý submit ve stejném projektu busy; externí změna po ověření vede na stale a konflikt při návratu bez přepsání. Na fixture s dvěma změnami ověřit jednotlivý i úplný návrat, nepřidávat podporu nových typů patchů.
- [ ] **2. Červený hostní test.** Nejprve `npm.cmd run package`, potom `npm.cmd run test:r3-desktop` → nový launcher ověří čerstvý Forge exe/build hash a spustí `npm.cmd exec -- vitest run --project desktop-e2e tests/desktop`; potvrdit očekávané chybějící chování, ne stale bundle. Desktop-e2e je sériový opt-in projekt se stejnými hostními timeouty, z běžného npm test se vyloučí. Každý test60s, launcher subprocess nejvýše10min. Artefakty obsahují failing screenshot a bezpečný audit; žádný raw klíč ani environment dump.
- [ ] **3. Implementovat test driver a mezery v integračním toku.** Pro běžné vizuální QA používat Playwright MCP. Pro automatický start/reload/restart skutečného Electron procesu přidat přesně připnutou dev dependency playwright; jeho `_electron` API je experimentální, proto nejprve malý launch/firstWindow/close důkaz a kompatibilita s Electron43.4.0. Renderer stále sandbox/contextIsolation, CSP bypass=false; test driver nemusí být součástí balíku. Systémové folder/close dialogy lze deterministicky nahradit pouze z test driveru v mainu; skutečné OS dialogy zůstávají autorskou E3 kontrolou. Žádný produkční IPC kanál pro nastavení cest či shell. Ukončení testovacího hostitele pro crash scénář provádí vlastník jeho PID; po restartu stejný profil ukáže interrupted a staré approval není spustitelné. Přerušení streamu zachová potvrzené zprávy. Pomalá testovací command fixture vydá stdout i stderr a čeká na latch: output musí být viditelný před uvolněním latch a skončením procesu. Cancel/timeout kontroluje skutečné PID potomků a žádný pozdější marker soubor.
- [ ] **4. Zelený důkaz.** Příkaz kroku2 + `npm.cmd exec -- vitest run --project host-integration apps/cli/test/change-verify-return.test.ts`. Secrets test používá syntetický marker a skutečný protector: uložit/restart/nahradit/odstranit, input prázdný a get vrací jen metadata. Oskenovat SQLite včetně WAL, bezpečné exporty/logy i zachycené IPC odpovědi; ciphertext file nesmí obsahovat marker plaintext. V každém scénáři stav UI odpovídá uloženému backend výsledku. Sken markerů v šifrovaném souboru nenahrazuje skutečný restart decrypt.
- [ ] **5. Commit hranice.** Přesné E1 cesty; `test(r3): prove desktop workflow parity and recovery on Windows`. Produkční opravy pouze s odpovídající regresí a bez oslabení R2 pravidel.

Povinné doplnění E1/1/3/4: hlavní referenční tok opakovat 10/10 v Git
i non-Git variantě nad profilem a fixture zachovanými mezi pokusy. Návrat
provádí UI akce testu, nikoli ruční reset DB nebo pracovního stromu.
Každý pokus je samostatný sériový test s 60 s limitem a číslem v reportu;
ostatní nákladové scénáře se desetkrát neopakují. Nový běh ve stejném chatu
nesmí znemožnit otevření původního diffu/ověření a zkouška přerušeného
streamu ověří i odstranění věčného streaming stavu po restartu.

Hard-crash zkouška během procesu musí zabít jen hlavní Electron PID,
zatímco vnější pozorovatel ověří worker a potomky podle B4. Kill celého
testovacího stromu je povolen až při cleanup po změření výsledku.
Secret scan záměrně vrátí syntetický klíč v odpovědi modelu i výstupu
procesu a zkontroluje agent_run_details.result_json, ne jen novou tabulku
zpráv. Tento test nepoužije skutečný API klíč ani síťového poskytovatele.

Primární zdroj test driveru: [Playwright Electron API](https://playwright.dev/docs/api/class-electron),
ověřeno 11. října 2026: experimentální podpora, explicitní executablePath,
firstWindow a main-process náhrada systémových dialogů. Pokud launch
vyžaduje uvolnit produkční bezpečnostní fuse, nedělat to tiše: ponechat
hardening a použít podporovaný oddělený test build. Packaged OS smoke E2
a skutečný vizuální/autorský packaged průchod tím zůstávají povinné.

## E2: Zabalená aplikace, restart klíče a úplná R3 brána

**Create:** apps/desktop/src/smoke/run-r3-smoke.ts,
tests/packaged/r3-smoke.test.ts,
scripts/verify-packaged-r3.mjs,
scripts/verify-r3.mjs.
**Modify:** apps/desktop/src/main.ts, apps/desktop/forge.config.ts,
package.json, .gitignore, vitest.config.ts.
**Test:** tests/packaged/r3-smoke.test.ts; R0/R2 packaged smoke zůstávají.

**Interfaces:** `runR3Smoke({profileRoot,projectRoot,nodeExecutable,phase})`
je interní main-only vstup, podobně jako run-r2-smoke. Pevné phases
`store`, `reopen`, `remove`, `workflow`; profile a output cesty launcher
kanonizuje pod vlastním `.r3-artifacts` rootem. Smoke používá produkční
secret/provider/projection/run služby, nikoli alternativní implementaci.
Report schemaVersion1 nese build hash/runtime verze, fázi,
`secretRestartPassed`, `noPlaintextPassed`, `workflowPassed`,
`cancelTreePassed`, `passed` a bezpečné chybové kategorie; žádný secret.
Závěrečný passed vyžaduje všechny povinné fáze s exit0. Nové scripts:
`test:r3-desktop`, `test:r3-packaged`, `verify:r3`.

- [ ] **1. Napsat packaged test.** Launcher musí použít zkontrolovaný Forge exe a skutečný systémový Node z C3. Store v procesu1, reopen/use v procesu2, replace/remove a reopen v dalších: syntetický klíč se decryptuje jen uvnitř mainu, report potvrzuje shodu bez hodnoty. Workflow Git/non-Git provede skutečné soubory/Git/SQLite/test command a stream; cancellation živého potomka má treeStopped=true až po skutečné kontrole. Neexistující exe, timeout, report jiné verze, skipped OS ochrana a chybějící fáze musí skončit nonzero.
- [ ] **2. Červená brána.** `npm.cmd run package`, potom `npm.cmd run test:r3-packaged`. Test je ve zvláštním packaged režimu podle existujícího R2 patternu; běžné npm test nesmí předpokládat starý exe v out/. Každý spuštěný exe30s, test host60s; delší vícefázový test rozdělit do samostatných testů se sdíleným izolovaným profile a serializací. Neoznačit za red jen chybějící package.
- [ ] **3. Implementovat packaged launcher a verify:r3.** Forge zachová asar.unpack C#/PS worker a skutečné procesní fixture; zahrne font/licenci a renderer assets. Smoke entry je main-only explicitní CLI switch s kontrolovanou vlastní fixture/profile, ne renderer API. Gate sekvenčně provede typecheck, lint, check:deps, npm test, stávající test:r2-provider-eval a test:r2-live-report, test:r1-repeatability a test:r2-repeatability, package, test:r3-desktop, packaged R0/R2/R3. R1/R2 gate se nevolá znovu celý, tím se balení a plná suite neopakují bez důvodu. Subprocess timeout10min, cwd explicitně root repo, windowsHide, shell:false podle současného Windows npm launcher patternu, fail-fast a ukončení pouze vlastního procesního stromu. `npm.cmd test` může obsahovat backend hostní testy, ale drahé desktopové E2E se spouští jednou dedikovaným projektem/opt-in filtrem. Report gate označí live provider jako samostatný běh, nikdy jako automaticky provedený.
- [ ] **4. Zelená brána.** `npm.cmd run verify:r3`; uložit přesný commit/worktree hash, Node/Electron/Windows verze, počty testů, výstup každé fáze a R3 report do `.r3-artifacts`. `git -c safe.directory=E:/kodovani/projekty/Codryn diff --check`. Dependency kontrola stále zakazuje renderer privilegia; packaged script žádné key argv/logging. Pokud prostředí některý povinný Windows test přeskočí, report uvádí nesplněnou bránu, ne celkové passed.
- [ ] **5. Commit hranice.** Přesné E2 soubory; `test(r3): add packaged Windows acceptance gate`. Neodesílat artefakty ani branch bez zadání autora.

Povinný E2 report odliší restart ochrany klíče, hard-crash ukončení vlastního
stromu a bezpečnou obnovu SQLite. Všechny relevantní fail/skip/timeout jsou
nonzero; úspěšné zavření parent procesu samo nedává cancelTreePassed=true.
Ověřit, že distribuce obsahuje výslovně přibalený font/licenci, všechny
produkční worker soubory a žádné test-only obecné hooky. Pokud Electron
driver používá samostatný test build, report jeho hash nesmí vydávat za hash
produkčního buildu a E2/E3 musí znovu ověřit skutečný distribuční výstup.

## E3: Akceptační záznam, autorský checklist a architektura

**Create:** README.md, docs/r3-acceptance.md,
docs/r3-author-checklist.md,
docs/architecture/r3-desktop.md,
docs/evals/r3-desktop-template.json.
**Modify:** PROJECT_CONTEXT.md,
docs/superpowers/plans/2026-10-11-r3-implementation.md (stav po provedení),
docs/decisions/0008-r3-secret-storage.md (výsledky z E2).
**Test:** audit odkazů/report schématu a průchod autora skutečnou packaged aplikací.

**Interfaces:** Acceptance tabulka sloupce: požadavek, scénář, očekávání,
skutečný výsledek, odkaz na důkaz, build hash, zbývající omezení.
JSON template obsahuje pouze schéma a prázdný seznam pokusů, není
vyplněný report. Checklist rozlišuje osobní autorskou zkušenost od
automatického gate; všechny nově vytvořené položky `- [ ]`.

- [ ] **1. Připravit záznamy před tvrzením o dokončení.** Každou oblast spec §8 mapovat na konkrétní A1–E2 test/důkaz. Sepsat nezaškrtnutý autorský průchod: skutečný folder dialog; Git/non-Git změna/approval/test/diff/revert; stale/conflict; reload při approval; close se zastavením; klíč po restartu; přímá nastavení; light/dark; hlavní tok klávesnicí; čitelnost na předváděcí obrazovce. Připravit jeden souvislý demonstrační scénář a popsat, které modelové volby jsou připravené a které služby pracují skutečně.
- [ ] **2. Ověřit evidenci.** Report template bez pokusů nesmí být hodnocen jako passed; odkazy směřují na skutečné soubory/aktuální build. Upozornit na chybějící důkaz místo doplnění odhadem. Nepřenést staré počty testů/živé R2 výsledky do nové R3 evidence jako nové měření.
- [ ] **3. Dokončit dokumentaci podle skutečnosti.** Architecture popíše DB migrace10–12, zdroj run ID/request intent, projekci/kurzor, subscription lifecycle, shutdown/recovery a secret boundary. README uvede Windows/Node prerequisite, spuštění offline a live režimu, omezení reference profilu, klíčové úložiště, verify:r3 a návrat při chybě. Živý GUI smoke pouze jako explicitní oddělená zkouška nad syntetickým projektem, s timeoutem a nákladovým limitem a bez záznamu key/HTTP raw headers. Nové tvrzení o splnění AC-O1-04 desktopem vyžaduje nový protokol pěti pokusů a minimum4/5; jeden GUI smoke ani starší R2 report jej nenahrazuje. Zvolený provider se nepřehodnocuje. Nechat checklist autorovi a neprohlašovat celý O1/ŠF za dodaný.
- [ ] **4. Akceptační kontrola.** Zelené E2 + skutečný packaged vizuální průchod na D2 rozlišeních. Screenshoty obou motivů a povinných stavů ze spec, všechny kritické akce klávesnicí, žádný actual key. Akceptační dokument přesně označí automaticky doložené, autorem potvrzené a dosud neprovedené oblasti. Selhání ochrany klíče, live permission/reload, skutečného streamu, safe revert nebo potvrzeného procesu je blokátor R3 dokončení. Autorova osobní kontrola se nepovažuje za splněnou jen testem.
- [ ] **5. Commit hranice a předání.** Přesné E3 dokumenty; `docs(r3): record desktop acceptance and author handoff`. Předat stručný výsledek a skutečné limity; push/PR pouze na výslovné zadání. R4 může navázat až s pravdivě uzavřenými R3 důkazy, nevymýšlet za autora nový rozsah.

Evidence E3 musí převzít [matici PRD z preventivního auditu](2026-10-11-r3-plan-review.md),
doplnit skutečné výsledky a zachovat nesplněné R4/R5/ŠF položky. Zvlášť
uvést FR-EXT-01/02 (dva vestavěné workflows v R4), která původní souhrnná
tabulka R3 vynechávala. Připravený scénář není živé rozhodování modelu;
každý předváděný krok má offline zálohu podle AC-O1-12. Autor vysvětlí
právě jednu cestu UI → backend → permission → změna → ověření → návrat.
Čistý účet/instalační médium a dvouminutový limit AC-O1-01 jsou samostatný
R5 důkaz; samotné npm package ani spuštění z vývojářského profilu je nesplní.

## R3 Definition of Done

Všech 18 úkolů má doložený výsledek a R3 gate je zelený ve Windows.
Backendový i skutečný desktopový tok zachovává R2 ochrany, stream je
pozorován před dokončením, reload zachová čekání a úplný restart nic
nepřehrává. Protected secret restart/remove a skutečná termination jsou
prokázané v packaged buildu. Vizuální baseline a autorská kontrola mají
vlastní skutečné potvrzení; automatika je nedoplňuje za autora.
Dokumentace nadále vymezuje referenční ověření, samostatné modelové úkoly
a navazující R4/ŠF funkce. Live GUI důkaz je evidován samostatně podle
toho, jaké tvrzení skutečně podpírá.
