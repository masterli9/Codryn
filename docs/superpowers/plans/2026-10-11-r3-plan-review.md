# R3 – preventivní kontrola implementačního plánu proti PRD v1.1

Datum: 11. října 2026. Kontrolovaný základ kódu:
`de470b6de220215b387014d1b621e8557f3ef660`, větev `feat/r3-electron-workspace`.
Předmětem je [plán R3](2026-10-11-r3-implementation.md) a jeho pět dílů,
nikoli dokončená implementace. Změny tohoto auditu jsou pouze v těchto
plánovacích dokumentech. Dřívější rozpracované změny PROJECT_CONTEXT a R3
specifikace zůstaly zachované.

## Výsledek a hranice závěru

Původní plán nebyl připravený k provedení bez úprav: u několika podstatných
požadavků obsahoval správný záměr, ale chyběl proveditelný kontrakt nebo
test, případně návrh nesouhlasil se skutečným R2 kódem. Níže uvedené mezery
jsou opravené v příslušných úkolech. Přidaná upřesnění a regresní scénáře
jsou povinnou součástí uvedených kroků, nikoli volitelnými poznámkami.

Kontrola zvyšuje připravenost plánu, neposkytuje absolutní záruku bezchybné
implementace. Předpoklady o Windows procesu, safeStorage, Electron driveru
a skutečné použitelnosti se musí potvrdit plánovanými technickými branami.
Neúspěšnou bránu nelze obejít označením požadavku za splněný. Vizuální volba
D2 a osobní potvrzení autora zůstávají budoucími rozhodnutími.

## Autority a způsob kontroly

- [PRD v1.1](../../../PRD_v1.1.md) je hlavní produktový kontrakt: kontrola
  funkčních požadavků, akceptace, dokončení úkolu, stavových automatů,
  lokální perzistence, bezpečnosti a chybového chování.
- [AGENTS](../../../AGENTS.md), [PROJECT_CONTEXT](../../../PROJECT_CONTEXT.md)
  a [registr v1.1](../../../REGISTR_ROZHODNUTI_v1.1.md) určují provozní hranice
  a současné autorské volby. Historické části kontextu nepřebíjejí PRD.
- [ROADMAP §7–8](../../product/ROADMAP.md) a
  [etapizace](../../product/ETAPIZACE_v1.0.md) určují rozdělení R3/R4/R5/ŠF.
  Jejich historická formulace výběru provideru se vykládá podle DR-27;
  neopakuje se srovnávací eval Gemini.
- [R3 specifikace](../specs/2026-10-11-r3-electron-workspace-design.md),
  architektura [R0](../../architecture/r0-boundaries.md),
  [R1](../../architecture/r1-agent-loop.md),
  [R2 lifecycle](../../architecture/r2-change-lifecycle.md),
  [projektová identita](../../architecture/r2-project-identity.md),
  [provider kontrakt](../../architecture/r2-provider-contract.md), ADR 0001,
  0003, 0005–0007 a R2 acceptance slouží jako technické návaznosti.
- Konkrétní kontrakty byly porovnány se skutečnými shared schématy,
  RunAgentLoop, harness, SQLite stores, completion, process workerem,
  Electron composition a stávajícím testovacím gate. Historický plán R2
  není náhradou aktuálního kódu.

Součástí byla samostatná kontrola bezpečnostních/datových vazeb. Poskytla
konkrétní průběžné nálezy; její závěrečný report přerušil limit. Nálezy byly
ověřeny přímo v hlavní kontrole, nejde tedy o tvrzení dokončeného druhého
review ani o automatické převzetí jeho verdiktu.

## Nálezy a opravy plánu

| ID / závažnost | Konkrétní mezera a důsledek | Oprava a povinný důkaz |
| --- | --- | --- |
| R3-01 / vysoká | A3 hledalo job jen pomocí correlationId=requestId. SqlitePermissionStore používá callId bez sessionId; mutation/verification také používají callId. Schválení či revert by se nemusely projevit v UI. | A3 dohledá run přes session/tool vazbu a request fallback před attachRun. Testy produkčních stores a samostatného revert requestu, ne pouze umělého eventu. |
| R3-02 / vysoká | B2 chránilo stream, ale RunAgentLoop ukládá finalText do agent_run_details.result_json a původní view předávalo celý R2RunResult. Klíč by mohl obejít stream redaktor do DB/UI. | B2 bezpečná hranice před každou perzistencí/odpovědí; view bez raw finalText. E1 skenuje i starou R2 detail tabulku, WAL a finální command output s úmyslným syntetickým únikem. |
| R3-03 / vysoká | RecoverR2Run obnovuje soubory a tool metadata, ne OS stromy. Job handle vlastní oddělený worker; smrt Electron hostitele sama nedokazuje jeho zavření. | B4 worker hlídá host/EOF, trvalý ownership před startem a kontrola restartu. E1/E2 hard-kill pouze hlavního hosta, vnější kontrola workeru a potomků; nejistota blokuje nový běh. |
| R3-04 / vysoká | Referenční relevance ověřovala sum fixture, nikoli všechny změněné cesty. Patch jiného souboru + zelený sum test mohl dostat verified. Částečné ověření současně nemělo producenta. | B1 backend coverage nad aktuálním diffem, A3 vazba na recordId, shared R3VerificationView. Tři scénáře: pouze známá změna = verified; známá i neznámá = partial; pouze neznámá = unverified. R2 schema se neoslabí. |
| R3-05 / střední | Job state running nerozliší model, approval, nástroj a ověřování. Chyběla stabilní metadata modelu a capability pro historický běh. | A1/B1 skutečné trvalé AgentRun fáze a metadata, C3 backend capability katalog, D3 test stavů včetně reloadu. |
| R3-06 / střední | Snapshot obsahoval jediný run a posledních 100 aktivit bez cesty k detailu starších běhů. Nový úkol mohl skrýt starý diff/ověření. | A1/A3 run.inspect + run.activity, D3/D4 výběr z historické zprávy; dvě sady v jednom chatu a stránkování 101 událostí. |
| R3-07 / vysoká | Kontrola idle a následné save/remove mohla závodit s queued startem nebo testKey v jiném projektu. Async safeStorage návrat nebyl v portu zohledněn. | C1 explicitní mapování decrypt výsledku, C2 společná provider lease a keyVersion, bariérové závodové testy i chyba file/metadata přechodu. |
| R3-08 / střední | Společná DB byla jen deklarace; současné createR2Infrastructure vždy DB otvírá a zavírá. Pád mohl ponechat streaming zprávu. | B1 injekce infrastruktury s jasným vlastníkem DB, A2 atomická jedinečnost aktivního projektu, navázání zpráv a jejich ukončení při recovery. Dva projekty nesmějí navzájem zavřít DB. |
| R3-09 / střední | Fresh načtení nedostupného rootu mohlo znemožnit i historii; close kontrola mohla minout nový submit. | C4 historie s unavailable freshness, blokace file akcí; uzavírací stav hostu odmítá nové operace před shutdown. Test chybějící složky i close/start závodu. |
| R3-10 / střední | Void output callback neurčoval, kdo čeká na DB flush a propaguje jeho chybu. Provider výjimka se v collectoru zjednoduší; dílčí usage se mohla tvářit jako úplná. | B2/B3 omezená sériová fronta, selhání zápisu zastaví běh, terminal čeká na drain; chyby zachytit před normalizací, při neznámém tahu usage=null. |
| R3-11 / střední | Node lookup nebyl výslovně chráněn proti spuštění node.exe podstrčeného projektem; reference demo mohlo předpokládat soubor i v běžné složce. | C3 vyřadí projektový/relativní PATH cíl, chybějící runtime není Electron fallback. Běžný root bez reference má čitelnou historii/read-only chat, demo vyžaduje podporovanou fixture. |
| R3-12 / střední | Souhrnné mapování nepokrývalo všechny M/O1 požadavky (zejména vestavěné workflows) a neoddělovalo dost přesně runtime důkazy od kontrol dokumentů. | Níže úplná M/O1 matice, explicitní R4/R5/ŠF návaznosti, E1 opakovatelnost 10/10, E2 přesný build, E3 pravdivý acceptance záznam. |
| R3-13 / vysoká | Revert neměl v IPC očekávanou verzi právě zobrazeného rozsahu. Nový patch mezi potvrzením a akcí mohl rozšířit návrat; nové requestId samo neřeší retry původní akce. | A1/A3 expectedSetSequence/workspaceRevision a trvalý action intent, C4 čerstvý preflight pod úzkým zámkem a test stale potvrzení/retry/crash. |

Technická kontrola safeStorage potvrdila odlišný návratový tvar async
decrypt oproti synchronnímu API. Primární podklad:
[Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage),
ověřeno při tomto auditu spolu s instalovanými typy. Test driver má
[experimentální Electron API](https://playwright.dev/docs/api/class-electron);
plán správně zachovává samostatný skutečný packaged důkaz.

## Matice všech M/O1 funkčních požadavků

„R3 nad R2“ znamená zachování existujícího pravidla, desktopové napojení a
novou regresi; není to prohlášení, že už prošla. „R4“ je výslovná návaznost
schválené roadmapy, nikoli zrušení povinnosti první obhajoby. Požadavky
se smí uzavřít až podle skutečného důkazu, ne podle této tabulky.

| Požadavky PRD v1.1 | Zařazení | Úkoly / vlastník | Konkrétní výstup a důkaz |
| --- | --- | --- | --- |
| FR-DESK-01, FR-DESK-02, FR-DESK-08 | R3 | C4, D1/D3, E1/E2 | Windows build, úzké IPC, trvalé a odlišitelné fáze běhu. |
| FR-UX-01, FR-UX-02, FR-UX-03, FR-UX-04, FR-UX-05 | R3 | D1–D4, E1/E3 | Čekání/chyba/prázdno/zrušení, důvod disabled, dopad návratu; nové UX detaily zaznamenat testem. |
| FR-PROJ-01, FR-PROJ-04, FR-PROJ-09 | R3 nad R2 | B1, C4, E1/E3 | Skutečný folder dialog, Git/non-Git a kanonický kořen; nedostupná složka nezničí historii. |
| FR-CHAT-01, FR-CHAT-02, FR-CHAT-03, FR-CHAT-04, FR-CHAT-05, FR-CHAT-11 | R3 | A1–A3, B2/B4, D1/D3, E1 | Správa chatů, stream a vazba starých běhů, potvrzený stop, draft a IME. |
| FR-CHAT-12, FR-CHAT-13, FR-CHAT-14 | R4 | Navazující context/composer plán | Finální @ reference a audit skutečně vloženého kontextu; R3 nemá falešnou nefunkční nabídku. |
| FR-CHAT-19, FR-CHAT-20, FR-CHAT-21 | R4 | Navazující otázkový workflow | Obnovitelná strukturovaná otázka oddělená od permission; není nahrazena běžnou odpovědí v R3. |
| FR-ORCH-01, FR-ORCH-03, FR-ORCH-04, FR-ORCH-05, FR-ORCH-06, FR-ORCH-07 | R3 nad R2 | B1–B4, C4, D3/D4, E1 | Jediná smyčka, limit, bezpečný chybný tool call, relevantní coverage a výslovné omezení ověření. |
| FR-ORCH-02 | R3 + dokončení R4 | B1, A3, D3; otázky R4 | R3 doloží všechny používané fáze; waiting_for_user_input vyžaduje skutečný otázkový tok R4. |
| FR-ORCH-11 | R4 | Navazující otázkový workflow | Trvalá otázka, idempotentní odpověď a jedno pokračování původního běhu. |
| FR-LLM-01, FR-LLM-02, FR-LLM-03, FR-LLM-05, FR-LLM-08, FR-LLM-11 | R3 nad R2 | B2, C3, D3/D4, E1/E3 | Demo/OpenAI volba, capability katalog, streaming a bezpečné chyby; neznámá schopnost není dostupná. |
| FR-LLM-12 | R2 evidence + R4 rozšíření | C3/E3 evidují; navazující eval R4 | DR-27 a původní měření se nepřepisují na nové. Aktuální desktop live důkaz je samostatný; žádný nevyžádaný head-to-head eval. |
| FR-LLM-13 | R3 podmíněná blokace | C3, D4, E1 | Dotčený režim vyžaduje platnou verzi potvrzení před prvním requestem; save/test klíče nestačí. |
| FR-TOOL-01, FR-TOOL-02, FR-TOOL-03, FR-TOOL-04, FR-TOOL-05, FR-TOOL-06, FR-TOOL-07, FR-TOOL-08, FR-TOOL-09, FR-TOOL-10 | R3 nad R2 | B1/B3/B4, C4, E1/E2 + R2 regrese | Validovaný registry/harness, audit, kořen, patch, přesný příkaz, output a skutečně ukončený strom. |
| FR-PERM-01, FR-PERM-02, FR-PERM-03, FR-PERM-07 | R3 nad R2 | B4, C4, D3, E1 | Řízený režim, jednorázové allow/deny, všechny decision důvody v historii; nepodporovaný web/outside-root je bezpečně odmítnut. |
| FR-CHG-01, FR-CHG-02, FR-CHG-03, FR-CHG-04, FR-CHG-05, FR-CHG-06, FR-CHG-08 | R3 nad R2 | B1, C4, D4, E1/E2 | Obnovovací bod, diff včetně starších běhů, jednotlivý/celkový návrat, konflikt a coverage/freshness. |
| FR-VCS-01, FR-VCS-02, FR-VCS-03, FR-VCS-04, FR-VCS-05, FR-VCS-06, FR-VCS-07 | R3 nad R2 | B1, C4, D4, E1 | Git baseline oddělená od práce agenta, non-Git návrat, detached/conflict/unavailable; žádný automatický branch/commit. |
| FR-VCS-09, FR-VCS-10, FR-VCS-11, FR-VCS-12, FR-VCS-13, FR-VCS-14, FR-VCS-16, FR-VCS-20, FR-VCS-21 | R4 | Navazující Git workspace plán | Stav/index/historie, stage/unstage, branch/commit, AI návrh, fresh preflight a resource-key operace. |
| FR-TERM-01, FR-TERM-05, FR-TERM-06 | R3 nad R2 | B1/B3/B4, D3/D4, E1/E2 | Živý stdout/stderr před exit, přesný příkaz/cwd/trvání a relevance vůči změně; chybná kontrola zpět modelu. |
| FR-TERM-04 | R4 | Navazující TypeScript profil | Obecné relevantní typecheck/test příkazy; sum.test.mjs v R3 není splnění tohoto požadavku. |
| FR-TS-01, FR-TS-02, FR-TS-03, FR-TS-04, FR-TS-05, FR-TS-06, FR-TS-07, FR-TS-08 | R4 | Navazující TypeScript profil | Strukturální dotazy a vlastní eval; nepovažovat obecné file.read za typovou analýzu. |
| FR-CTX-01, FR-CTX-02 | R3 základ + R4 dokončení | B1/B2/E1; kontext R4 | Zachovat omezený context/history uvnitř aktuálního běhu. Projektová pravidla/repo mapa a širší audit v R4. |
| FR-CTX-03, FR-CTX-04, FR-CTX-05, FR-CTX-06 | R4 | Navazující repo mapa | Rychlý základ, prohlubování, invalidace a explicitní init. |
| FR-CTX-12, FR-CTX-13, FR-CTX-14, FR-CTX-15, FR-CTX-16, FR-CTX-17 | R3 ochrany + R4 úplný rozsah | B1/C4/E1 + R2 security regrese; R4 index/context | R3 nesmí obejít existující ignore/secret hranice. Jednotné indexy, viditelné výjimky a úplná invalidace až R4. |
| FR-EXT-01, FR-EXT-02 | R4 | Navazující registry a workflow plán | Nejméně jeden plánovací/brainstorming a jeden ověřovací workflow. Původní tabulka R3 je nesměla nechat bez vlastníka. |
| FR-COORD-01, FR-COORD-02, FR-COORD-08, FR-COORD-09, FR-COORD-10, FR-COORD-14 | R3 ochrany + R4 úplný rozsah | B1/B4/C4/E1 + R2 regrese; R4 workspace/Git | Revize, expected-hash, provenience a pravdivá platnost. Jeden produktový běh není globální file lock ani náhrada resource lease. |

Matice obsahuje všech **108 M/O1 funkčních požadavků**, každý právě jednou.

## Akceptační kritéria O1

| Kritéria | Etapa / vlastník | Důkaz nebo hranice tvrzení |
| --- | --- | --- |
| AC-O1-01 | R5 | Čistý podporovaný účet Windows, instalace a časovaný limit 2 minut; E3 pouze připraví postup. |
| AC-O1-02, AC-O1-03 | R3 E1/E2 | Dvě čtecí/hledací akce, patch, relevantní kontrola, diff/návrat; 10/10 přes skutečný desktop pro Git i non-Git. |
| AC-O1-04 | R2 archiv + explicitní nový live důkaz | R3 se nesmí označit 4/5 podle starého R2 reportu. Nové tvrzení vyžaduje pět aktuálních pokusů; offline gate ani jeden smoke nestačí. |
| AC-O1-05, AC-O1-06, AC-O1-07, AC-O1-08, AC-O1-09, AC-O1-10, AC-O1-11 | R3 nad R2 | Audit, traversal/junction, deny bez účinku, timeout + nejvýše 2 s, hash návratu, novější editace a reload approval; B1/B4/C4/E1/E2. |
| AC-O1-12 | R3 E3 + R5 | Záložní fake scénář/záznam ke každému živému předváděnému kroku. |
| AC-O1-13, AC-O1-14 | R4 | TypeScript 18/20 a asynchronní progresivní mapa s invalidací. |
| AC-O1-15 | R3 D2/E3 + R5 generálka | Skutečné obrazovky a kritické stavy na zvoleném rozlišení; samotný mockup není projektorový důkaz. |
| AC-O1-16 | R3 B4/E1/E2 | OS kontrola podporovaných potomků po cancel/timeout/crash; žádný orphan. |
| AC-O1-17, AC-O1-18, AC-O1-19, AC-O1-20 | R4 | Reference/context audit a lokální Git workflow se samostatnými E2E. |
| AC-O1-22, AC-O1-23 | R2 regrese + R4 dokončení | Resource key concurrency a stale patch všech podporovaných aktérů; R3 nesmí ochranu oslabit. |
| AC-O1-24 | R3 B1/C4/D4/E1 | Pozorování revize a rozsahu změní UI freshness; starý úspěch zůstane pouze historií. |
| AC-O1-25 | R2 DR-27 + R4 rozšíření | Datovaný výběr a měření; žádná domnělá výhra nad Gemini. |
| AC-O1-27, AC-O1-31 | R4 | Úplná ignore security sada a otázkový workflow s jedním pokračováním a samostatným oprávněním. |

Pokryto všech **26 povinných AC-O1 kritérií**. Volitelná AC-O1-21, AC-O1-26, AC-O1-28, AC-O1-29 a AC-O1-30 zůstávají podmíněnými R4/pozdějšími cíli podle PRD; nejsou potichu vynechanými povinnými branami R3.

## Předsunutá ŠF a vědomě nezařazený rozsah

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

Zvlášť zkontrolované průřezové smlouvy: PRD §10.3 (pravdivý souhrn),
§11.4–11.6 (hranice a identity), §12.2 (migrace, atomicita, zachování
recovery), §13 (tajemství, modelový kontext, externí účinky), §14 (chyby)
a §15–16 (fixture, živé/řízené demo a autorské porozumění). Zachovávají se
v A2/A3, B1–B4, C1–C4 a E1–E3, nejsou nahrazeny pouhými renderer testy.

## Provedené ověření a zbývající brány

| Kontrola provedená při auditu | Skutečný výsledek |
| --- | --- |
| Úkoly a checkboxy | 18 úkolů A1–E3, 90 budoucích kroků; žádný označený jako provedený. |
| Pokrytí PRD | 108/108 M/O1 funkčních požadavků a 26/26 povinných AC-O1, bez duplicit; uvedená plná ID existují v PRD v1.1. |
| Odkazy a integrační cesty | 50 místních Markdown odkazů existuje; 78 explicitních Modify odkazů ukazuje na existující nebo dříve plánem vytvářený soubor. |
| Struktura a ukázky typů | Uzavřené code fences; všechny 3 TypeScript bloky bez syntaktické chyby. Toto není typová kompilace budoucích služeb. |
| Whitespace | Kontrola všech 7 dokumentů včetně untracked souborů bez diagnostik; navíc git diff --check bez chyby. |
| npm.cmd run typecheck | Exit 0 pro současné workspaces. |
| npm.cmd run lint | Exit 0, žádné ESLint warningy. |
| npm.cmd run check:deps | Exit 0; 217 modulů, 601 závislostí, žádné porušení hranic. |

Všechny výsledky výše pocházejí z tohoto auditu, nejsou převzatými počty
z dřívějšího plánování. Změny zůstávají na feature branchi bez stagingu.

R3 implementační testy, Windows probe, Electron E2E, nové živé API pokusy
ani autorský průchod při tomto auditu neproběhly: kontrolovala se jejich
budoucí zadání. Produkční kód se neměnil. Celá runtime suite R2 se kvůli
změně plánovacích dokumentů neopakovala. Zelený typecheck/lint/dependency
check potvrzuje jen současný checkout, nikoli budoucí R3 rozhraní popsaná
v Markdownu. Žádný commit, push nebo PR tento audit neprovádí.
