# R3 — akceptační záznam

Datum dokumentace: **1. listopadu 2026**. Produktová autorita: [PRD v1.1](../PRD_v1.1.md). Dokument popisuje existující implementaci a skutečné důkazy; **R3, celé O1 ani ŠF nejsou tímto přijaty**. Osobní zkušenost autora a aktuální live GUI protokol nejsou automatickými testy nahrazené. Autorské položky jsou v [nezaškrtnutém checklistu](r3-author-checklist.md).

## Výsledek a identita měření

[Bod 5](superpowers/plans/2026-10-31-r3-step5-packaged.md) eviduje úspěšný agregát fází po úzkých opravách. Dvě skutečné invokace `verify:r3` selhaly; jejich failed reporty zůstávají zachované. **Neexistuje zde tvrzení o jednom zeleném příkazu celé brány.**

| Doklad | Skutečný výsledek a časová hranice |
| --- | --- |
| Běžná sada po produkční opravě | 658 passed / 3 skipped; typecheck, lint a check:deps prošly, 307 modulů / 942 vazeb. Před poslední změnou pouze výplně syntetické cancellation fixture. |
| Opakovatelnost | R1 1/1 a R2 20/20 ve stejné předchozí fázi; nevydává se za nové desktop live měření. |
| Finální package | Source `82eebf763379e3d9d094e7f97359968dddc095d308f5c16e563319836238b388`; ASAR `630361f2b1bb19b6757094eb5f2dfde2a2c1b70af56700fcdf7e48c6dc445773`; EXE `6aae3c142a09d1bf0d71307aec50121d9bca412a3c717a3e5513d6b3cf4e1224`. Dále označen **B5**. |
| Finální packaged fáze B5 | Všech 8 R3 fází passed, včetně skutečného stopu stromu; packaged R0 a R2 prošly. |
| Finální skutečný desktop B5 | 30/30 v jednom příkazu, 401,71 s; zahrnuje 10 Git a 10 non-Git workflow přes UI nad zachovanými profily. Modelové odpovědi jsou syntetické. |
| Scan a obsah balíku B5 | Po ukončení procesů 53 souborů UTF-8/UTF-16LE, žádný marker, žádné vynechání; shoda všech pěti workerů se zdroji, font a licence přítomné. |
| Host / runtime | Windows 11 Home `10.0.26300`, systémový Node 24.19.0; packaged Electron 43.4.0 / embedded Node 24.18.1. |
| Nové živé GUI měření B5 | [Protokol a všechny předchozí série](evals/r3-desktop-2026-11-01.md), [finální JSON](evals/r3-desktop-2026-11-01.json): poslední série 4/5, předchozí dvě 0/5 jsou zachované. Čtvrtý návrat nebyl kvůli chybě ovladače vyžádán; není to prokázané selhání produkčního revertu. Všechny tokenové spotřeby jsou známé. Celkový odhad 0,0102730 USD a rezerva 0,203958501 USD z limitu 0,25 USD. Živý stream před koncem nebyl pozorován; osobní přijetí tím není splněné. |
| Nové dokumentační ověření | Kontrola lokálních odkazů a struktury prázdného reportu; nejde o nové spuštění běžné/desktopové brány. |
| Skutečné vizuální QA B5 | [E3 vizuální protokol](superpowers/plans/2026-11-01-r3-e3-visual.md): 67 unikátních PNG, z toho 66 maticových, tři D2 rozlišení v obou motivech. 19 klávesnicových záznamů, žádné horizontální přetečení či konzolové chyby. Připravené modelové scénáře bez API; část přechodových stavů a dodatečný command-stream pozorovatel zůstaly neověřené. Nenahrazuje osobní ani live přijetí. |

Strojové artefakty jsou lokální ignorované výstupy, ne přenosné součásti Git dokumentace: `.r3-artifacts/2026-10-31-step5-final-phases.json`, `2026-10-31-step5-inspection.json`, `2026-10-31-step5-packaged-postexit-scan.json`, `packaged-FYnII3/r3-report.json`, `git-sX8KCL/attempt-1.json` až `attempt-10.json` a `non-git-6Dbmn6/attempt-1.json` až `attempt-10.json`. Trvalý čitelný souhrn je výše odkazovaný bod 5. Před novou zkouškou porovnejte aktuální `.r3-artifacts/build.json` se skutečnými zdroji/ASAR/EXE; dokumentační úprava není nové měření. SHA-256 je kontrolní otisk obsahu, nikoli označení autorského přijetí.

## Oblasti spec §8 a konkrétní evidence A1–E2

„Automaticky“ níže znamená skutečný test; „syntetický“ označuje připravený modelový vstup bez placeného API. Backend, SQLite, filesystem, DPAPI a procesní runner ve Windows důkazech pracují skutečně. Build B5 je výše uvedená trojice hashů; předchozí bod 4/renderer QA mají vlastní časovou hranici a nepřejmenovávají se na B5.

| Požadavek / oblast | Scénář | Očekávání | Skutečný výsledek | Důkaz | Build hash | Zbývající omezení |
| --- | --- | --- | --- | --- | --- | --- |
| Sdílené jádro; B1/E1/E2 | Git i non-Git změna → test → diff → návrat | Zachovat R2 ochrany a vlastní změny | Automaticky 10+10 UI pokusů; R2 regrese 20/20 | [Desktop workflow](../tests/desktop/r3-workflow.test.ts), [bod 5](superpowers/plans/2026-10-31-r3-step5-packaged.md) | B5 UI; dřívější R2 regrese | Referenční fixture, připravené modelové volby |
| IPC; A1/C4 | Cizí sender/frame, vadný vstup a cizí ID | Bez privilegovaného účinku | Automatická validace a ownership testy | [Shared kontrakt](../shared/test/r3-contracts.test.ts), [IPC testy](../apps/desktop/test/r3-handler.test.ts), [bod 2](superpowers/plans/2026-10-29-r3-step2-hardening.md) | Bod 2 / B5 regrese | Bez tvrzení úplného security auditu |
| Chat/stream; A2/A3/B2/D3 | Historie, duplicate, přerušený stream, reload | Trvalé pořadí bez druhého účinku | Automaticky doloženo, včetně dlouhé aktivity a redakce | [Persistence](../backend/infrastructure/test/r3-chat-persistence.test.ts), [adverse](../tests/desktop/r3-adverse.test.ts), [bod 4](superpowers/plans/2026-10-31-r3-step4-verification.md) | Bod 4 / B5 desktop | Živá volání provedena, ale průběžný modelový text před koncem nebyl tímto pozorovatelem prokázán |
| Perzistence; A1–A3 | Přijetí, mismatch, migrace/reopen | Atomická zpráva/job, zachování historie | Automaticky doloženo, busy a souběžný duplicate opraveny | [Run manager](../backend/infrastructure/test/r3-run-manager.test.ts), [projekce](../backend/infrastructure/test/r3-projection-store.test.ts), [bod 5](superpowers/plans/2026-10-31-r3-step5-packaged.md) | B5 / předchozí běžná fáze | Nejde o automatický replay po restartu |
| Model/chyby; B2/C3/D4 | Režim, schopnosti, auth/rate-limit/timeout, usage | Bezpečný důvod, známá/neznámá spotřeba | Automatické kontrakty a bezpečné chyby | [Provider](../backend/infrastructure/test/r3-provider-factory.test.ts), [runtime](../backend/infrastructure/test/r3-runtime-flow.test.ts) | B5 regrese | Živý protokol 4/5 uveden výše; nepokrývá všechny chyby provideru |
| Příkaz; B3/B4 | Stdout/stderr před exit, truncation, cancel | Skutečný průběh a potvrzený stop | Automaticky v desktop/package; cancellation fixture opravena bez oslabení podmínek | [Command stream](../backend/infrastructure/test/r3-command-stream.test.ts), [adverse](../tests/desktop/r3-adverse.test.ts), [bod 5](superpowers/plans/2026-10-31-r3-step5-packaged.md) | B5 | Podporovaný strom není obecný OS sandbox |
| Oprávnění; B4/C4/D3 | Reload při čekání, allow/deny/stop/stale | Jediný účinek aktuálního schválení | Automaticky doloženo | [Lifecycle](../tests/desktop/r3-lifecycle.test.ts), [workflow](../tests/desktop/r3-workflow.test.ts) | B5 | Živé oprávnění a reload prvního pokusu doložené protokolem; osobní průchod otevřený |
| Lifecycle; B4/C4 | Busy, close, hard crash a restart | Strom zanikne, žádný model/tool replay | Automaticky doloženo; bod 4 host crash, bod 5 celý desktop | [Bod 4](superpowers/plans/2026-10-31-r3-step4-verification.md), [lifecycle](../tests/desktop/r3-lifecycle.test.ts) | Bod 4 / B5 | Skutečný close OS dialog vyžaduje autora |
| Změny/ověření; B1/D4 | Coverage, starý běh, stale, conflict, návrat | Historický úspěch se nevydává za aktuální | Automaticky doloženo pro referenční rozsah | [Workflow](../tests/desktop/r3-workflow.test.ts), [runtime](../backend/infrastructure/test/r3-runtime-flow.test.ts) | B5 | Obecný TypeScript profil R4 otevřený |
| Tajemství; C1/C2/E1/E2 | Save/restart/replace/remove, corruption/fault/race, scan | DPAPI, žádný plaintext fallback/únik | Osm packaged fází a úplný scan prošly; skutečné OS šifrování se syntetickým markerem | [Secrets test](../tests/desktop/r3-secrets.test.ts), [ADR 0008](decisions/0008-r3-secret-storage.md), [bod 5](superpowers/plans/2026-10-31-r3-step5-packaged.md) | B5 | Není to live autentizace ani cloudová security sada |
| Datové podmínky; C3/D4 | Open/save/test versus projektový request | Přenos až po aktuálním souhlasu | Backend blokaci vynucuje, automatické testy | [Infrastruktura](../backend/infrastructure/src/create-r3-infrastructure.ts), [runtime test](../backend/infrastructure/test/r3-runtime-flow.test.ts) | B5 regrese | Aktuální provider podmínky před vydáním samostatně ověřit |
| UI; D1–D4/E3 | Oba motivy, 900×640/1280×800/1440×900, klávesnice | Čitelné stavy bez overflow | Bod 3: 14 screenshotů, žádné horizontální přetečení/chyby konzole; produkční komponenty se syntetickým IPC | [Bod 3](superpowers/plans/2026-10-29-r3-step3-ui.md), [baseline](design/r3/baseline.md) | Vlastní renderer QA bodu 3 | Není packaged/live ani osobní předváděcí důkaz; aktuální E3 vizuální kontrola evidována samostatně |
| Windows distribuce; E2/E3 | Package, DPAPI, runner, skutečný folder dialog | Distribuční build funguje | Package/DPAPI/runner automaticky doložené | [Bod 5](superpowers/plans/2026-10-31-r3-step5-packaged.md), [checklist](r3-author-checklist.md) | B5 | Skutečný OS folder dialog a čistá instalace čekají na autora/R5 |

## Matice všech 108 M/O1 funkčních požadavků

Převzato ze schváleného rozdělení [preventivního auditu](superpowers/plans/2026-10-11-r3-plan-review.md), zachována všechna ID a navazující vlastníci. Stav je na úrovni skupiny: odkaz na test není tvrzení, že všechny části širokého požadavku jsou hotové. R3 části se hodnotí podle konkrétní tabulky výše; položky R4 zůstávají nesplněné. Datum posledního dokumentačního posouzení 1. 11. 2026; datum runtime důkazů určuje bod 3/4/5.

| Požadavky PRD v1.1 | Zařazení | Úkoly / vlastník | Konkrétní výstup a důkaz | Stav k 1. 11. 2026 / evidence |
| --- | --- | --- | --- | --- |
| FR-DESK-01, FR-DESK-02, FR-DESK-08 | R3 | C4, D1/D3, E1/E2 | Windows build, úzké IPC, trvalé a odlišitelné fáze běhu. | Omezeně splněno: automatická/syntetická evidence níže; osobní průchod a nepokryté živé oblasti zůstávají otevřené. |
| FR-UX-01, FR-UX-02, FR-UX-03, FR-UX-04, FR-UX-05 | R3 | D1–D4, E1/E3 | Čekání/chyba/prázdno/zrušení, důvod disabled, dopad návratu; nové UX detaily zaznamenat testem. | Omezeně splněno: automatická/syntetická evidence níže; osobní průchod a nepokryté živé oblasti zůstávají otevřené. |
| FR-PROJ-01, FR-PROJ-04, FR-PROJ-09 | R3 nad R2 | B1, C4, E1/E3 | Skutečný folder dialog, Git/non-Git a kanonický kořen; nedostupná složka nezničí historii. | Omezeně splněno: automatická/syntetická evidence níže; osobní průchod a nepokryté živé oblasti zůstávají otevřené. |
| FR-CHAT-01, FR-CHAT-02, FR-CHAT-03, FR-CHAT-04, FR-CHAT-05, FR-CHAT-11 | R3 | A1–A3, B2/B4, D1/D3, E1 | Správa chatů, stream a vazba starých běhů, potvrzený stop, draft a IME. | Omezeně splněno: automatická/syntetická evidence níže; osobní průchod a nepokryté živé oblasti zůstávají otevřené. |
| FR-CHAT-12, FR-CHAT-13, FR-CHAT-14 | R4 | Navazující context/composer plán | Finální @ reference a audit skutečně vloženého kontextu; R3 nemá falešnou nefunkční nabídku. | Nezačato v R3; ponecháno R4, bez tvrzení splnění. |
| FR-CHAT-19, FR-CHAT-20, FR-CHAT-21 | R4 | Navazující otázkový workflow | Obnovitelná strukturovaná otázka oddělená od permission; není nahrazena běžnou odpovědí v R3. | Nezačato v R3; ponecháno R4, bez tvrzení splnění. |
| FR-ORCH-01, FR-ORCH-03, FR-ORCH-04, FR-ORCH-05, FR-ORCH-06, FR-ORCH-07 | R3 nad R2 | B1–B4, C4, D3/D4, E1 | Jediná smyčka, limit, bezpečný chybný tool call, relevantní coverage a výslovné omezení ověření. | Omezeně splněno: automatická/syntetická evidence níže; osobní průchod a nepokryté živé oblasti zůstávají otevřené. |
| FR-ORCH-02 | R3 + dokončení R4 | B1, A3, D3; otázky R4 | R3 doloží všechny používané fáze; waiting_for_user_input vyžaduje skutečný otázkový tok R4. | Omezeně splněno: pouze R3 ochrany doložené níže; úplný rozsah R4 otevřený. |
| FR-ORCH-11 | R4 | Navazující otázkový workflow | Trvalá otázka, idempotentní odpověď a jedno pokračování původního běhu. | Nezačato v R3; ponecháno R4, bez tvrzení splnění. |
| FR-LLM-01, FR-LLM-02, FR-LLM-03, FR-LLM-05, FR-LLM-08, FR-LLM-11 | R3 nad R2 | B2, C3, D3/D4, E1/E3 | Demo/OpenAI volba, capability katalog, streaming a bezpečné chyby; neznámá schopnost není dostupná. | Omezeně splněno: automatická/syntetická evidence níže; osobní průchod a nepokryté živé oblasti zůstávají otevřené. |
| FR-LLM-12 | R2 evidence + R4 rozšíření | C3/E3 evidují; navazující eval R4 | DR-27 a původní měření se nepřepisují na nové. Aktuální desktop live důkaz je samostatný; žádný nevyžádaný head-to-head eval. | Historické rozhodnutí DR-27; nové desktop live neprovedeno, rozšíření R4. |
| FR-LLM-13 | R3 podmíněná blokace | C3, D4, E1 | Dotčený režim vyžaduje platnou verzi potvrzení před prvním requestem; save/test klíče nestačí. | Omezeně splněno: automatická/syntetická evidence níže; osobní průchod a nepokryté živé oblasti zůstávají otevřené. |
| FR-TOOL-01, FR-TOOL-02, FR-TOOL-03, FR-TOOL-04, FR-TOOL-05, FR-TOOL-06, FR-TOOL-07, FR-TOOL-08, FR-TOOL-09, FR-TOOL-10 | R3 nad R2 | B1/B3/B4, C4, E1/E2 + R2 regrese | Validovaný registry/harness, audit, kořen, patch, přesný příkaz, output a skutečně ukončený strom. | Omezeně splněno: automatická/syntetická evidence níže; osobní průchod a nepokryté živé oblasti zůstávají otevřené. |
| FR-PERM-01, FR-PERM-02, FR-PERM-03, FR-PERM-07 | R3 nad R2 | B4, C4, D3, E1 | Řízený režim, jednorázové allow/deny, všechny decision důvody v historii; nepodporovaný web/outside-root je bezpečně odmítnut. | Omezeně splněno: automatická/syntetická evidence níže; osobní průchod a nepokryté živé oblasti zůstávají otevřené. |
| FR-CHG-01, FR-CHG-02, FR-CHG-03, FR-CHG-04, FR-CHG-05, FR-CHG-06, FR-CHG-08 | R3 nad R2 | B1, C4, D4, E1/E2 | Obnovovací bod, diff včetně starších běhů, jednotlivý/celkový návrat, konflikt a coverage/freshness. | Omezeně splněno: automatická/syntetická evidence níže; osobní průchod a nepokryté živé oblasti zůstávají otevřené. |
| FR-VCS-01, FR-VCS-02, FR-VCS-03, FR-VCS-04, FR-VCS-05, FR-VCS-06, FR-VCS-07 | R3 nad R2 | B1, C4, D4, E1 | Git baseline oddělená od práce agenta, non-Git návrat, detached/conflict/unavailable; žádný automatický branch/commit. | Omezeně splněno: automatická/syntetická evidence níže; osobní průchod a nepokryté živé oblasti zůstávají otevřené. |
| FR-VCS-09, FR-VCS-10, FR-VCS-11, FR-VCS-12, FR-VCS-13, FR-VCS-14, FR-VCS-16, FR-VCS-20, FR-VCS-21 | R4 | Navazující Git workspace plán | Stav/index/historie, stage/unstage, branch/commit, AI návrh, fresh preflight a resource-key operace. | Nezačato v R3; ponecháno R4, bez tvrzení splnění. |
| FR-TERM-01, FR-TERM-05, FR-TERM-06 | R3 nad R2 | B1/B3/B4, D3/D4, E1/E2 | Živý stdout/stderr před exit, přesný příkaz/cwd/trvání a relevance vůči změně; chybná kontrola zpět modelu. | Omezeně splněno: automatická/syntetická evidence níže; osobní průchod a nepokryté živé oblasti zůstávají otevřené. |
| FR-TERM-04 | R4 | Navazující TypeScript profil | Obecné relevantní typecheck/test příkazy; sum.test.mjs v R3 není splnění tohoto požadavku. | Nezačato v R3; ponecháno R4, bez tvrzení splnění. |
| FR-TS-01, FR-TS-02, FR-TS-03, FR-TS-04, FR-TS-05, FR-TS-06, FR-TS-07, FR-TS-08 | R4 | Navazující TypeScript profil | Strukturální dotazy a vlastní eval; nepovažovat obecné file.read za typovou analýzu. | Nezačato v R3; ponecháno R4, bez tvrzení splnění. |
| FR-CTX-01, FR-CTX-02 | R3 základ + R4 dokončení | B1/B2/E1; kontext R4 | Zachovat omezený context/history uvnitř aktuálního běhu. Projektová pravidla/repo mapa a širší audit v R4. | Omezeně splněno: pouze R3 ochrany doložené níže; úplný rozsah R4 otevřený. |
| FR-CTX-03, FR-CTX-04, FR-CTX-05, FR-CTX-06 | R4 | Navazující repo mapa | Rychlý základ, prohlubování, invalidace a explicitní init. | Nezačato v R3; ponecháno R4, bez tvrzení splnění. |
| FR-CTX-12, FR-CTX-13, FR-CTX-14, FR-CTX-15, FR-CTX-16, FR-CTX-17 | R3 ochrany + R4 úplný rozsah | B1/C4/E1 + R2 security regrese; R4 index/context | R3 nesmí obejít existující ignore/secret hranice. Jednotné indexy, viditelné výjimky a úplná invalidace až R4. | Omezeně splněno: pouze R3 ochrany doložené níže; úplný rozsah R4 otevřený. |
| FR-EXT-01, FR-EXT-02 | R4 | Navazující registry a workflow plán | Nejméně jeden plánovací/brainstorming a jeden ověřovací workflow. Původní tabulka R3 je nesměla nechat bez vlastníka. | Nezačato v R3; ponecháno R4, bez tvrzení splnění. |
| FR-COORD-01, FR-COORD-02, FR-COORD-08, FR-COORD-09, FR-COORD-10, FR-COORD-14 | R3 ochrany + R4 úplný rozsah | B1/B4/C4/E1 + R2 regrese; R4 workspace/Git | Revize, expected-hash, provenience a pravdivá platnost. Jeden produktový běh není globální file lock ani náhrada resource lease. | Omezeně splněno: pouze R3 ochrany doložené níže; úplný rozsah R4 otevřený. |

## Povinná akceptační kritéria O1

Všech 26 povinných AC-O1 zachovává původního vlastníka. Volitelná AC-O1-21/26/28/29/30 nejsou povinným gate R3. Nový desktop live výsledek nelze převzít ze starého R2 4/5.

| Kritéria | Etapa / vlastník | Důkaz nebo hranice tvrzení | Stav k 1. 11. 2026 / evidence |
| --- | --- | --- | --- |
| AC-O1-01 | R5 | Čistý podporovaný účet Windows, instalace a časovaný limit 2 minut; E3 pouze připraví postup. | Neprovedeno; R5. |
| AC-O1-02, AC-O1-03 | R3 E1/E2 | Dvě čtecí/hledací akce, patch, relevantní kontrola, diff/návrat; 10/10 přes skutečný desktop pro Git i non-Git. | Automaticky doložený referenční rozsah v bodu 5; osobní/live přijetí tím není splněno. |
| AC-O1-04 | R2 archiv + explicitní nový live důkaz | R3 se nesmí označit 4/5 podle starého R2 reportu. Nové tvrzení vyžaduje pět aktuálních pokusů; offline gate ani jeden smoke nestačí. | Nový desktop protokol poslední série 4/5; dvě předchozí série 0/5 zůstávají uvedené. R2 archiv nebyl přenesen jako nové měření. |
| AC-O1-05, AC-O1-06, AC-O1-07, AC-O1-08, AC-O1-09, AC-O1-10, AC-O1-11 | R3 nad R2 | Audit, traversal/junction, deny bez účinku, timeout + nejvýše 2 s, hash návratu, novější editace a reload approval; B1/B4/C4/E1/E2. | Automaticky doložený referenční rozsah v bodu 5; osobní/live přijetí tím není splněno. |
| AC-O1-12 | R3 E3 + R5 | Záložní fake scénář/záznam ke každému živému předváděnému kroku. | Připraven demonstrační postup níže; autorská generálka/video dosud neprovedené. |
| AC-O1-13, AC-O1-14 | R4 | TypeScript 18/20 a asynchronní progresivní mapa s invalidací. | Neprovedeno v R3; R4. |
| AC-O1-15 | R3 D2/E3 + R5 generálka | Skutečné obrazovky a kritické stavy na zvoleném rozlišení; samotný mockup není projektorový důkaz. | Syntetické renderer QA doloženo; skutečná autorská předváděcí kontrola otevřená. |
| AC-O1-16 | R3 B4/E1/E2 | OS kontrola podporovaných potomků po cancel/timeout/crash; žádný orphan. | Automaticky doložený referenční rozsah v bodu 5; osobní/live přijetí tím není splněno. |
| AC-O1-17, AC-O1-18, AC-O1-19, AC-O1-20 | R4 | Reference/context audit a lokální Git workflow se samostatnými E2E. | Neprovedeno v R3; R4. |
| AC-O1-22, AC-O1-23 | R2 regrese + R4 dokončení | Resource key concurrency a stale patch všech podporovaných aktérů; R3 nesmí ochranu oslabit. | Omezené regresní/archivní podklady; dokončení R4 otevřené. |
| AC-O1-24 | R3 B1/C4/D4/E1 | Pozorování revize a rozsahu změní UI freshness; starý úspěch zůstane pouze historií. | Automaticky doložený referenční rozsah v bodu 5; osobní/live přijetí tím není splněno. |
| AC-O1-25 | R2 DR-27 + R4 rozšíření | Datovaný výběr a měření; žádná domnělá výhra nad Gemini. | Omezené regresní/archivní podklady; dokončení R4 otevřené. |
| AC-O1-27, AC-O1-31 | R4 | Úplná ignore security sada a otázkový workflow s jedním pokračováním a samostatným oprávněním. | Neprovedeno v R3; R4. |

## Předsunutá ŠF a nezařazený rozsah

Následující rozdělení z auditu zůstává platné; dílčí desktopová funkce neuzavírá celý řádek. FR-EXT-01/02 (dva vestavěné workflows) zůstávají výslovně R4.

| Oblast | Rozhodnutí a limit R3 |
| --- | --- |
| FR-LLM-06, FR-LLM-07; AC-SF-07 | Autorem předsunuté trvalé lokální klíče: C1–C3, D4, E1/E2. Secret scan R3 neprokazuje neexistující cloudovou vrstvu. |
| FR-DESK-03, FR-DESK-04, FR-DESK-05, FR-DESK-06; FR-UX-06 | Trvalé chaty/nastavení, dva motivy, nutné recovery a klávesnice nyní. Plné layouty, přemapování a úplná accessibility sada zůstávají ŠF. |
| FR-CHAT-10; FR-ORCH-08, FR-ORCH-09; FR-PERM-08 | Idempotence, snapshot/reconnect, metadata a bezpečné čekání již R3. Nejde o pokračování starého modelového kontextu ani produktové subagenty. |
| FR-LLM-09 a PRD §13.5 | Upozornění před live přenosem už R3; konkrétní datové podmínky musí C3 ověřit před vydáním. FR-LLM-13 není odloženo, jeho podmíněná blokace má test. |
| FR-CHAT-06 až 10, 15 až 18; FR-WORK; zbývající FR-PROJ/FR-DESK | ŠF/R6–R7: pokračování historie, přílohy, nepřiřazený chat, plné projekty/layouty. Dřívější dílčí pojistky v R3 neznamenají celkové splnění. |
| FR-TERM-02, FR-TERM-03, FR-TERM-07 až 11 | Uživatelský terminál, preview a produktový vision-check jsou ŠF. Vývojové Playwright QA rendereru není implementací těchto funkcí. |
| FR-PERM-04 až 06, 09 až 10; FR-LLM-04 | Plná pravidla, Auto režim a druhý adaptér jsou ŠF. Existující pevné deny a bezpečnostní hranice se zachovají již v R3. |
| FR-CAN; FR-EXT-03 až 11; FR-ACC; volitelné FR-COORD; FR-EXP | Canvas, cizí import/MCP, cloud, plná koordinace a E0 nejsou R3. S/O1 položky pouze po samostatném zařazení do R4, povinné ŠF nejpozději v příslušné etapě; produktová epizodická paměť až PŠ po rozhodnutí. |

## Souvislé demo a offline záloha

1. Připravte novou kopii referenční fixture a ověřte výchozí chybu součtu. Zvolte demo; otevřete ji skutečným folder dialogem a založte chat.
2. Požádejte o opravu. Připravený model zvolí hledání/čtení, patch a test; skutečný backend validuje nástroje, ukládá události a vynucuje approval.
3. Přečtěte konkrétní změnu a audit jejího oprávnění (referenční patch může být povolen pravidlem), potom povolte testovací příkaz. Ukažte skutečný výstup, ověřený referenční rozsah, diff a rozdíl oproti původním uživatelským změnám.
4. Před návratem přečtěte jeho rozsah a potvrďte jej. Ukažte původní obsah i zachovanou historii. Znovu načtěte okno: žádná akce se neopakuje.
5. Pro živou variantu použijte oddělenou syntetickou kopii, platný souhlas, explicitní budget/timeout a samostatný protokol. Offline záloha ke každému kroku je stejný demo tok; připravené volby vždy označte. Lokální video a předváděcí generálku doplní autor, zatím nejsou evidované jako hotové.

## Otevřené podmínky E3

- Čerstvý [živý protokol](evals/r3-desktop-2026-11-01.md) poslední série dosáhl 4/5, tedy početního minima AC-O1-04. Dřívější neúspěšné série jsou zachované; nelze tvrdit 5/5 ani přijetí R3. Pozorování živého streamu před koncem a všechny chybové varianty tím nejsou doložené. Prázdná [šablona](evals/r3-desktop-template.json) nadále zůstává `not_run`; nejde o výsledek.
- Skutečné systémové dialogy a osobní autorský průchod nejsou potvrzené. Všechny nově vytvořené checklist položky zůstávají prázdné.
- Aktuální [packaged vizuální kontrola](superpowers/plans/2026-11-01-r3-e3-visual.md) doložila 67 unikátních snímků a 19 klávesnicových záznamů. Její nepokryté stavy a dodatečný neúspěšný command-stream pozorovatel zůstávají otevřené; starší renderer QA tento důkaz nenahrazuje.
- R5 čistá instalace/2 minuty, R4 profil/context/Git/workflows a zbývající ŠF zůstávají otevřené. Není udělené autorské přijetí ani oprávnění push/PR.
