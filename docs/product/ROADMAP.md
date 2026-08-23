# Codryn – roadmap vývoje

| Položka | Hodnota |
| --- | --- |
| Stav | Schválený pracovní postup vývoje |
| Verze návaznosti | PRD v1.0 |
| Časový formát | Záměrně bez kalendářních dat |
| Závazný konec | Finální školní verze a obhajovací build |

## 1. Účel roadmapy

Tento dokument určuje pořadí, v jakém se Codryn staví a ověřuje. Každý krok musí skončit pozorovatelným výsledkem a dokončovací bránou, než se kritická cesta přesune dál. Roadmap neříká, kdy přesně má práce proběhnout, a nenahrazuje podrobný plán jednotlivé implementační oblasti.

Dokumenty mají rozdílné odpovědnosti:

- `PROJECT_CONTEXT.md` je zdroj pravdy pro současný stav a dosavadní rozhodnutí;
- `PRD_v1.0.md` určuje, co a proč má produkt umět, včetně priorit a akceptačních kritérií;
- `REGISTR_ROZHODNUTI_v1.0.md` uchovává přijatá rozhodnutí a jejich důvody;
- `ETAPIZACE_v1.0.md` řídí rozsah, rizika a vazbu na O1, ŠF a PŠ;
- `ROADMAP.md` určuje pořadí implementačních přírůstků bez datumů;
- oblastní implementační specifikace budou před zahájením příslušné oblasti určovat přesné kontrakty, soubory, migrace, knihovny a testovací kroky;
- traceability matice bude během vývoje spojovat požadavek, implementaci, test, důkaz, omezení a stav.

Při rozporu má přednost `PROJECT_CONTEXT.md`, poté aktuální PRD a registr rozhodnutí. Roadmap nesmí sama měnit produktový rozsah ani bezpečnostní hranice.

## 2. Zásady postupu

1. Každý krok končí spustitelným vertikálním výsledkem nebo reprodukovatelným experimentem.
2. Kritickou cestou zůstává `analysis → change → verification → diff/result → safe return`.
3. Přes nesplněnou bezpečnostní nebo datovou bránu se nepokračuje přidáváním dalších funkcí.
4. CLI, automatické testy a Electron renderer používají stejné doménové kontrakty a aplikační služby. Rozhraní nesmí vlastnit ani duplikovat agentní pravidla.
5. První vertikální průřez vzniká přes interní headless/CLI driver. CLI není samostatný produkt ani druhé dlouhodobě udržované UI.
6. Electron se v prvním kroku používá jako technický spike pro Windows balení, úzké IPC, SQLite a procesní runner. Produktové UI se připojí ke stabilnímu jádru.
7. Nová schopnost, změna etapy, datového modelu, externího účinku nebo bezpečnostní hranice vyžaduje kontrolu PRD a rozhodovací záznam. Drobný UX detail může zůstat v oblastním checklistu a testu.
8. Funkce je hotová až tehdy, když má implementaci, test, srozumitelný chybový stav, důkaz a vysvětlení, kterému autor rozumí.
9. Každý zápis pracuje s očekávaným hashem nebo revizí. Workspace awareness ani koordinace relací tuto kontrolu nenahrazují.
10. Reálná LLM API doplňují deterministické testy, ale nenahrazují fake adapter ani fixture.
11. Neveřejný, uniklý nebo licenčně nejasný proprietární codebase se nepoužívá jako implementační podklad. Významná inspirace z veřejného zdroje eviduje původ a licenci.
12. Pokud volitelná funkce ohrožuje dokončení kroku, odloží se podle pravidel škrtání rozsahu v etapizaci.
13. Implementační změny vznikají na krátkodobých pracovních branchích; `main` zůstává stabilní integrační linií a funkce se do ní začleňuje až po relevantním testu a kontrole dokončovací brány.
14. Před každou obhajobou se z ověřeného stavu oddělí stabilizační branch a přesný použitý commit se po generální zkoušce uzamkne anotovaným obhajovacím tagem.

### 2.1 Branche a obnovitelné obhajovací verze

- Pracovní branche používají stručný účel a vazbu na krok roadmapy, například `feat/r0-process-runner`, `fix/r2-restore-conflict` nebo `docs/r4-provider-eval`.
- `main` obsahuje pouze integrovaný stav, který prošel relevantními testy; rozpracovaná funkce se na něm nevyvíjí přímo.
- Pro stabilizaci první obhajoby vznikne `release/o1`, pro finální školní verzi `release/sf`. Po jejich založení přijímají jen opravy nutné pro příslušnou obhajobu; další vývoj může pokračovat na nových pracovních branchích nad `main`.
- Přesný commit použitý při generální zkoušce a obhajobě dostane neměnný anotovaný tag `obhajoba/o1-vN` nebo `obhajoba/sf-vN`. Tag se zpětně nepřesouvá; nová oprava vytváří další verzi tagu.
- K tagu se archivuje instalační build, checksum, test report, známá omezení, použitý fixture projekt a verze demonstračního scénáře. Obnova pro obhajobu používá checkout tagu nebo dočasnou branch vytvořenou z tagu, nikoli odhad podle aktuální větve.

## 3. Přehled kritické cesty

| Krok | Vertikální výsledek | Hlavní brána |
| --- | --- | --- |
| R0 | Ověřené technické základy a hranice | Kritické Windows integrace fungují mimo produktové UI |
| R1 | Deterministická agentní smyčka v headless režimu | Referenční úkol dokončen bez zápisu a shellu |
| R2 | Bezpečný životní cyklus změny | Celý hlavní cyklus funguje včetně návratu |
| R3 | Minimální Electron pracovní plocha | UI ovládá stejné jádro bez duplikace orchestrace |
| R4 | Schopná široká alfa | Povinný funkční rozsah O1 má testy a důkazy |
| R5 | Stabilní verze pro první obhajobu | Stejný scénář je opakovatelný živě i přes fake adapter |
| R6 | Funkčně kompletní finální školní verze | ŠF funkce neporušují regresní sadu jádra |
| R7 | Finální kvalita a release candidate | Všechna M/ŠF kritéria mají stav a důkaz |
| R8 | Zmrazený obhajovací build | Ověřený build, demo, fallback a dokumentace jsou shodné |

## 4. R0 – ověření technických základů

### Cíl

Odstranit rizika, která by později vynutila přestavbu aplikačního jádra nebo desktopové integrace.

### Pozorovatelný výsledek

Existuje minimální technický řez, který na Windows spustí Electron spike, komunikuje přes úzké validované IPC, zapíše a načte testovací relaci v SQLite a spustí fixture proces s timeoutem a zachyceným výsledkem. Doménové a aplikační kontrakty lze volat také bez rendereru.

### Zahrnutý rozsah

- hranice domény, aplikačních služeb, infrastruktury a rozhraní;
- zakázaná závislost domény a orchestrace na Electronu nebo Reactu;
- stavové automaty `AgentRun`, `ToolCall`, `PermissionRequest`, `ChangeSet` a `GitOperation` na úrovni přechodů a invariantů;
- minimální Electron shell a úzký IPC protokol;
- SQLite v režimu WAL, první migrace, integritní kontrola a záloha testovacích dat;
- child/utility process runner, stdout, stderr, exit code, timeout a řízené ukončení fixture procesu;
- základ testovací infrastruktury, logování a rozhodovacích záznamů;
- lokální Git fixture a ověření dostupnosti systémového credential mechanismu bez ukládání tajemství.

### Vědomě nezahrnutý rozsah

- produktový chat, finální layout nebo design systém;
- reálná agentní smyčka;
- cloud, účet a marketplace;
- úplná implementace všech stavů a nástrojů.

### Závislosti

- schválené hranice PRD v1.0;
- cílové prostředí Windows 11;
- rozhodnutí DR-05, DR-06, DR-10, DR-16 a DR-21.

### Oblastní specifikace před implementací

- struktura repozitáře a pravidla závislostí;
- interní event envelope a identifikátory;
- SQLite bootstrap a migrační politika;
- IPC threat model a procesní runner.

### Povinné ověření

- build a spuštění Electron spike na podporovaném Windows 11;
- kontraktní test validního a nevalidního IPC vstupu;
- migrace prázdné databáze a opětovné otevření uložené relace;
- timeout a ukončení podporovaného stromu fixture procesu;
- test, že doménové nebo aplikační moduly neimportují renderer.

### Dokončovací brána

R0 je dokončeno, když lze spustit produkčně blízký Electron spike, bezpečně uložit a načíst testovací relaci, řízeně dokončit nebo ukončit fixture proces a stejné aplikační kontrakty vyvolat z testu bez Electronu.

### Důkaz a porozumění autora

- krátký diagram hranic a směru závislostí;
- záznam výsledku Windows spike testů;
- autor vysvětlí, proč renderer není bezpečnostní hranice, proč backend vlastní SQLite a proč worker thread nenahrazuje izolovaný proces.

## 5. R1 – interní headless/CLI agentní smyčka

### Cíl

Ověřit deterministický vícekrokový agentní průchod bez závislosti na produktovém UI a bez rizika skutečných nevratných změn.

### Pozorovatelný výsledek

Interní CLI přijme cestu k fixture projektu a textové zadání. Fake adapter vyvolá předem určenou posloupnost bezpečných čtení a hledání, orchestrátor zaznamená všechny přechody a relace skončí pravdivým strukturovaným výsledkem.

### Zahrnutý rozsah

- interní headless/CLI driver jako tenká vstupní vrstva;
- `AgentRun` s limitem kroků a konečnými stavy;
- deterministický fake adapter a jednotný capability kontrakt adapterů;
- registry verzovaných nástrojů oddělený od execution harnessu;
- nástroje pro omezené čtení a hledání bez zápisu;
- validace tool callu a normalizovaný výsledek nástroje;
- základ Řízeného režimu a audit rozhodnutí, i když první fixture používá jen bezpečné automaticky povolené operace;
- append-oriented event log;
- explicitní reference na fixture soubor a audit skutečně sestaveného kontextu;
- chyby pro neznámý nástroj, neplatný vstup, překročený limit kroků a selhání fake adapteru.

### Vědomě nezahrnutý rozsah

- editace souborů, shell a návrat změn;
- produktové Electron UI;
- reálný provider jako podmínka dokončení;
- TypeScript strukturální profil a repo mapa.

### Závislosti

- dokončené R0;
- stabilní event envelope, základní stavový automat a aplikační vstupní port.

### Vazba na PRD

- `FR-ORCH-01` až `FR-ORCH-07`;
- `FR-TOOL-01` až `FR-TOOL-04`, `FR-TOOL-07` a `FR-TOOL-08`;
- `FR-PERM-01`, `FR-PERM-07`;
- `FR-CTX-01` a `FR-CTX-02`.

### Povinné ověření

- úspěšný vícekrokový fake scénář;
- odmítnutí neznámého nástroje a nevalidních argumentů bez spuštění implementace;
- řízené ukončení při překročení limitu kroků;
- opakovaný běh stejné fixture se stejnou posloupností významových eventů;
- test, že CLI pouze volá aplikační port a neobsahuje permission, tool ani orchestration pravidla.

### Dokončovací brána

R1 je dokončeno, když read-only referenční úkol projde desetkrát z deseti s fake adapterem, každé spuštění má auditovatelnou stopu a chybný tool call nikdy nespustí nástroj.

### Důkaz a porozumění autora

- uložený přehled eventů jednoho úspěšného a jednoho odmítnutého běhu;
- autor vysvětlí rozdíl mezi adapterem, orchestrátorem, registrem nástrojů a execution harnessem a projde stavový přechod jednoho tool callu.

## 6. R2 – bezpečný životní cyklus změny

### Cíl

Doplnit headless jádro o bezpečnou změnu projektu, ověření aktuální revize, pravdivý výsledek a návrat.

### Pozorovatelný výsledek

Fake scénář analyzuje fixture projekt, provede cílený patch, spustí omezený ověřovací příkaz, zobrazí diff a stav ověření a následně změnu bezpečně vrátí. Stejný princip funguje nad Git i non-Git fixture.

### Zahrnutý rozsah

- `ChangeSet`, expected-hash/revision a atomické použití cíleného patche;
- ochrana ručních změn a zastavení při stale vstupu;
- omezený shell/test přes process runner a explicitní schválení;
- přesný příkaz, pracovní adresář, odhad dopadu a audit schválení;
- Git diff a non-Git snapshot;
- `VerificationRecord` svázaný s konkrétní workspace revizí;
- invalidace zastaralého ověření po relevantní změně;
- vrácení konkrétního agentního change setu bez smazání cizí práce;
- normalizované chyby provideru a nástrojů;
- timeout, zrušení, limity cest, výstupu a redakce tajemství;
- trvalé eventy a obnova podporovaných stavů po pádu;
- základ `WorkspaceState`, monotónní `workspaceRevision` a resource-key lease;
- kontraktní sady nástrojů a adapterů.

### Vědomě nezahrnutý rozsah

- plná Git pracovní plocha a vzdálené operace;
- souběžné uživatelské relace a přímé zápisy subagentů;
- produktové UI;
- silnější Windows sandbox bez výsledku experimentu.

### Závislosti

- dokončené R1;
- schválená oblastní specifikace změn, snapshotů, oprávnění a ověření.

### Vazba na PRD

- `FR-TOOL-05`, `FR-TOOL-06`, `FR-TOOL-09` a `FR-TOOL-10`;
- `FR-PERM-02`, `FR-PERM-03` a `FR-PERM-07`;
- požadavky oblastí životního cyklu změn, Git/non-Git a ověření v PRD;
- `FR-COORD-01`, `FR-COORD-02`, `FR-COORD-08` a `FR-COORD-14`.

### Povinné ověření

- úspěšný patch nad očekávaným obsahem;
- odmítnutí stale patche bez částečného zápisu;
- zachování ruční změny uživatele při vrácení agentního change setu;
- test stejného scénáře v Git i non-Git fixture;
- úspěšné i neúspěšné ověření a následná invalidace starého výsledku;
- zamítnuté schválení, timeout a zrušení procesu;
- obnova podporované přerušené relace bez duplicitního tool callu.

### Dokončovací brána

R2 je dokončeno, když headless průchod opakovatelně naplní celý cyklus `analysis → change → verification → diff/result → safe return`, stale zápis se vždy zastaví a návrat nepoškodí změny mimo konkrétní change set.

### Důkaz a porozumění autora

- diff před návratem a čistý výsledek po návratu;
- event trace schváleného, zamítnutého a stale zápisu;
- autor vysvětlí rozdíl mezi Gitem, non-Git snapshotem, change setem, workspace revizí a expected hashem.

## 7. R3 – minimální Electron pracovní plocha

### Cíl

Zpřístupnit stabilní agentní jádro přes jednoduché desktopové rozhraní bez přesunu zdroje pravdy do rendereru.

### Pozorovatelný výsledek

Uživatel otevře fixture projekt, zadá úkol, sleduje stav a tool cally, rozhodne o oprávnění, zkontroluje diff a ověření a vrátí změnu v jedné stabilní pracovní ploše.

### Zahrnutý rozsah

- otevření lokální projektové složky;
- základ projektového chatu a composeru;
- panely nebo zobrazení Chat, Aktivita, Oprávnění, Diff a Výsledek ověření;
- stavové snapshoty a event stream z backendu;
- čekání, úspěch, prázdný výsledek, chyba, zrušení a opětovné připojení rendereru;
- jasné odlišení ověřeno, částečně ověřeno a neověřeno;
- vrácení agentní změny;
- jedna stabilní pracovní plocha čitelná na projektoru;
- základní klávesové ovládání kritické cesty.

### Vědomě nezahrnutý rozsah

- tři layouty, přesouvání panelů a finální vizuální identita;
- účet, cloud a Auto režim;
- canvas, Playwright a online marketplace;
- pokročilý Git graf.

### Závislosti

- dokončené R2;
- schválený IPC/view-model kontrakt odvozený z backendového stavu.

### Vazba na PRD

- `FR-DESK-01`, `FR-DESK-02`, `FR-DESK-08`;
- `FR-UX-01` až `FR-UX-05`;
- O1 požadavky oblastí projektů, chatů, oprávnění, změn a ověření.

### Povinné ověření

- shodný fake scénář přes CLI a Electron s významově shodnou stopou eventů;
- restart rendereru během čekání na schválení bez dvojího spuštění;
- manuální checklist všech povinných stavů obrazovky;
- klávesové dokončení hlavního toku;
- test, že renderer nemá přímý přístup k databázi, souborovému systému ani process runneru.

### Dokončovací brána

R3 je dokončeno, když Electron ovládá stejný referenční průchod jako CLI, renderer lze bezpečně odpojit a připojit a žádné agentní pravidlo nemá samostatnou UI implementaci.

### Důkaz a porozumění autora

- záznam shodného CLI a UI scénáře;
- screenshoty hlavních stavů;
- autor vysvětlí, jak backendový snapshot a eventy obnoví UI a proč React stav není stavem agentní relace.

## 8. R4 – schopná široká alfa

### Cíl

Doplnit rozlišující schopnosti a povinný funkční rozsah první obhajoby nad stabilní agentní smyčkou.

### Pozorovatelný výsledek

Codryn dokončí reálný úkol nad malým TypeScript/React projektem, použije relevantní a auditovatelný kontext, strukturální nástroje a bezpečný lokální Git tok. Když chybí rozhodnutí, položí obnovitelnou strukturovanou otázku bez obcházení oprávnění. Každý zápis a ověření respektuje aktuální workspace i při souběžné externí změně.

### Zahrnutý rozsah

- provider eval a první reálný modelový adapter;
- TypeScript profil: rozpoznání, definice, reference, typy, diagnostika a import/export vazby;
- rychlý deterministický základ repo mapy, cílené prohlubování, invalidace a hlubší inicializace;
- finální O1 `@` reference na soubory a složky a audit sestaveného kontextu;
- kompaktní lokální Git workspace: stav, staged/unstaged soubory, diff, historie, branch, commit a AI návrh commit message;
- čerstvé Git preflighty, resource-key serializace a audit stavových operací;
- Workspace State, `workspaceRevision`, expected-hash/revision ochrana všech zápisů, provenience aktéra a pravdivá invalidace verification recordu;
- `.codrynignore` a výchozí ochranná politika jednotně použitá při crawlu, hledání, TypeScript indexování, repo mapě, hlubší inicializaci a sestavování kontextu;
- strukturované otázky s důvodem, dvěma až pěti možnostmi a vlastní odpovědí, trvalý stav `waiting_for_user_input`, právě jedno pokračování původní relace a samostatné oprávnění případné rizikové akce;
- interní registry a dva vestavěné workflows: nejméně jeden planning nebo brainstorming skill a jeden ověřovací workflow.

**Volitelný cíl S/O1:** `fetch`, `pull` a `push`; bezpečný náhled ručního importu lokálního manifestu; `taskSummary`, koordinační snapshot, `WorkIntent`, stupně překryvu, viditelný strom a skuteční subagenti; offline E0 bez automatického rozšíření produktového scope; ruční obrázek a jednoduchá kreslená anotace. Nesplněná volitelná schopnost neblokuje R4 ani O1.

### Vědomě nezahrnutý rozsah

- účet a cloud;
- Auto režim s klasifikátorem;
- druhý reálný adapter;
- finální systém layoutů, design systém a úplný accessibility pass;
- produktová epizodická paměť bez kladného rozhodnutí po E0.

### Závislosti

- dokončené R3;
- samostatné oblastní specifikace pro provider adapter, TypeScript profil, kontext, lokální Git a bezpečnostní jádro workspace;
- verzované eval datasety a fixtures.

### Vazba na PRD

- `FR-TS-01` až `FR-TS-08`;
- `FR-CTX-01` až `FR-CTX-06`;
- M/O1 Git požadavky;
- `FR-CTX-12` až `FR-CTX-17`;
- M/O1 bezpečnostní jádro `FR-COORD-01`, `FR-COORD-02`, `FR-COORD-08` až `FR-COORD-10` a `FR-COORD-14`;
- `FR-CHAT-19` až `FR-CHAT-21` a `FR-ORCH-11`;
- `FR-EXT-01` a `FR-EXT-02`;
- volitelné S/O1 požadavky pouze tehdy, pokud jsou v alfu skutečně zařazeny.

### Povinné ověření

- provider eval na shodné sadě tool-calling úloh;
- nejméně malá ručně ověřená sada TypeScript strukturálních dotazů;
- repo mapa proti baseline na stejných fixture úlohách;
- lokální Git scénáře pro status, diff, stage/unstage, branch a commit včetně externě změněného indexu;
- souběžný nebo simulovaný stale patch a resource-key konflikt bez požadavku na produktově dostupný subagent;
- `.codrynignore` security suite včetně výchozí ochrany, neplatného pravidla, jednorázové souborové výjimky, tajemství a invalidace odvozených dat;
- E2E strukturované otázky včetně restartu rendereru, duplicitní odpovědi, právě jednoho pokračování a odděleného permission requestu podle `AC-O1-31`;
- kontraktní test vestavěného registry a obou povinných workflows.

Každá skutečně zařazená S/O1 schopnost dostane vlastní důkaz: remote Git fixture, importní fixture, koordinaci a subagent provenance, E0 report nebo canvas round-trip. Její absence nesmí být skryta v souhrnu O1.

### Dokončovací brána

R4 je dokončeno, když všechna M/O1 funkční kritéria zařazená do široké alfy mají implementaci, automatický nebo manuální test a dohledatelný důkaz; volitelná část nesmí snižovat spolehlivost hlavního cyklu.

### Důkaz a porozumění autora

- provider eval report, TypeScript eval, lokální Git fixture report, `.codrynignore` report a concurrency trace bezpečnostního jádra; případné S/O1 reporty jsou označeny jako volitelné;
- autor vysvětlí sestavení kontextu, invalidaci repo mapy, bezpečný Git preflight a rozdíl mezi awareness a optimistic concurrency.

## 9. R5 – stabilizace první obhajoby

### Cíl

Zmrazit přidávání rizikových pilířů a proměnit širokou alfu v opakovatelnou demonstrační verzi.

### Pozorovatelný výsledek

Stejný připravený TypeScript/React úkol lze předvést přes živý provider i deterministický fake fallback na čisté instalaci Windows 11.

### Zahrnutý rozsah

- release candidate O1 a čistá instalace;
- úplná regresní sada kritického agentního cyklu;
- hlavní živý scénář a významově stejný fake fallback;
- projektorová čitelnost a kritické loading/error/empty stavy;
- test report, známá omezení a diagnostické podklady;
- záložní lokální video;
- časované generální zkoušky;
- uzavření výběru prvního reálného adaptéru;
- traceability důkazy všech M/O1 kritérií;
- experimenty pro Auto režim a Windows sandbox bez automatického rozšíření O1.

### Vědomě nezahrnutý rozsah

- nové rizikové produktové pilíře;
- kosmetické funkce bez vazby na čitelnost nebo spolehlivost;
- změny architektury bez blokujícího důvodu.

### Závislosti

- dokončené R4;
- připravený demonstrační projekt a stabilní fixture.

### Povinné ověření

- čistá instalace a první spuštění na cílovém Windows 11;
- opakované průchody hlavního scénáře bez ručního zásahu do vnitřního stavu;
- simulace výpadku API a přechod na fake fallback;
- projektorový a časový checklist;
- kontrola, že žádný neověřený stav není prezentován jako dokončený.

### Dokončovací brána

R5 je dokončeno, když všechna M/O1 kritéria mají důkaz, hlavní scénář je opakovatelný a obhajoba nezávisí na jediné síťové službě nebo neobnovitelném lokálním stavu.

### Důkaz a porozumění autora

- instalační artefakt, test report, traceability výřez, demo scénář, fallback a video;
- autor dokáže bez nápovědy vysvětlit hlavní architekturu, bezpečnostní hranice a význam výsledků ověření.

## 10. R6 – produktizace finální školní verze

### Cíl

Rozšířit stabilní lokální jádro o povinné produktové schopnosti ŠF bez přepisu kritické cesty.

### Pozorovatelný výsledek

Nový uživatel projde onboardingem, přizpůsobí pracovní plochu, použije dva modelové adaptéry, bezpečné režimy oprávnění, multimodální vstup, účet a omezenou cloudovou synchronizaci, zatímco lokální agentní jádro zůstane funkční offline. U podporovaného vizuálního úkolu Codryn doloží výsledek screenshotem aktuální revize a vision-checkem, nebo jej pravdivě označí jako vizuálně neověřený.

### Zahrnutý rozsah

- druhý reálný adapter pro odlišný API formát a společná kontraktní sada;
- pravidla automatického schválení a zamítnutí a hybridní Auto režim;
- onboarding a tři výchozí pracovní plochy;
- přesouvání, skrývání, připínání a obnova panelů;
- trvalá nastavení, přemapovatelné klávesové zkratky a obnova podporovaných stavů;
- účet, přihlášení, odhlášení a cloudová synchronizace povolených dat;
- explicitní zákaz běžné synchronizace zdrojového kódu, snapshotů a API klíčů;
- obecné textové a obrazové přílohy, drag-and-drop a vložení obrázku ze schránky;
- multimodální canvas;
- povinný Playwright screenshot a vision-check pro podporované úkoly závislé na vykresleném UI, včetně vazby na workspace revizi, viewport a zadání, opravné smyčky a stavu „vizuálně neověřeno“ při nedostupné kontrole;
- kurátorovaný katalog, bezpečný manifest, zapnutí, vypnutí a minimální MCP životní cyklus;
- vzdálené Git operace `fetch`, `pull` a `push` přes Git CLI a systémový credential helper nebo SSH, pokud nevznikly už jako S/O1;
- `taskSummary`, koordinační snapshot, vyhodnocení překryvu, viditelný strom a skuteční subagenti, pokud nevznikli už jako S/O1;
- graf větví a historie navazující na O1 Git workspace;
- rozdílový snapshot obnovené relace a registr spolehlivě sledovaných procesů.

### Vědomě nezahrnutý rozsah

- veřejný marketplace a instalace neověřeného kódu z URL;
- běžná cloudová synchronizace zdrojového stromu;
- týmové účty a background agenti;
- další platformy a obecná podpora dalších jazyků.

### Závislosti

- dokončené R5;
- samostatné threat modely a specifikace pro Auto režim, cloud, pluginy a multimodální data;
- úspěšné technické experimenty pro podmíněné části.

### Vazba na PRD

- `FR-TERM-08` až `FR-TERM-11`;
- `US-23` a `AC-SF-22`;
- ostatní M/ŠF požadavky přidělené produktizaci podle traceability matice.

### Povinné ověření

- úplná O1 regresní sada po každé nové vrstvě;
- kontraktní sada obou adapterů;
- security eval Auto režimu včetně kritických false-negative případů;
- offline start a lokální práce bez dostupného cloudu;
- kontrola cloudového schématu a exportu proti zakázaným datům;
- obnovitelnost layoutu bez ztráty chatů nebo změn;
- izolace neplatného manifestu a pádu MCP serveru;
- bezpečné odmítnutí rizikového pull/push toku, nepodporovaného credential promptu a úniku Git tajemství;
- stale zápis subagenta, audit provenience a rodičovská kontrola výsledku;
- multimodální round-trip původního obrázku, kresby a textu;
- webová fixture podle `AC-SF-22`: známý vizuální nesoulad, strukturovaný výsledek, oprava, screenshot aktuální revize, invalidace stale screenshotu a fallback při nedostupném preview, Playwrightu nebo obrazové capability.

### Dokončovací brána

R6 je dokončeno, když povinné ŠF funkce pracují nad stejným lokálním jádrem, cloud ani plugin nesmí blokovat lokální agentní úkol, podporovaný vizuální úkol nelze označit za vizuálně ověřený bez aktuálního důkazu a O1 regresní sada zůstává zelená.

### Důkaz a porozumění autora

- kontraktní report adapterů, Auto security eval, cloud data-flow diagram, recovery test, plugin permission trace a report vizuálního ověření;
- autor vysvětlí hranici lokální/cloud, pořadí pevné politiky a klasifikátoru a izolaci externího rozšíření.

## 11. R7 – finální kvalita a release candidate

### Cíl

Dokončit uživatelskou kvalitu, měření, dokumentaci a pouze ty odlišující prvky, které nesnižují spolehlivost.

### Pozorovatelný výsledek

Release candidate je čitelný, ovladatelný, měřený a zdokumentovaný; kritické toky fungují klávesnicí a známá omezení jsou transparentní.

### Zahrnutý rozsah

- finální vizuální směr při zachování autorovy kontroly identity;
- světlé a tmavé schéma, focus, klávesová navigace a reduced motion;
- stabilizace Playwright/vision toku na známých nesouladech, stale revizích a reprezentativních šířkách viewportu;
- uživatelské testování a prioritizované opravy;
- TypeScript profil, repo mapa a Auto režim proti schváleným baseline;
- výkon, limity výstupů, retence a diagnostický export;
- instalační, uživatelská, bezpečnostní a architektonická dokumentace;
- uzavření nebo vědomé odložení otevřených rozhodnutí podle jejich pravidel;
- bezpečný handoff snapshot pouze při splnění povinných bran a dostatečné rezervě.

### Vědomě nezahrnutý rozsah

- funkce bez vazby na M/ŠF, důkaz pro hodnocení nebo prokazatelnou kvalitu;
- rozsáhlé přepisování stabilních komponent;
- experimentální wow prvek bez fallbacku.

### Závislosti

- dokončené R6;
- uzavřený funkční rozsah ŠF.

### Povinné ověření

- úplná automatická regresní sada;
- manuální accessibility a desktop quality checklist;
- uživatelské testy nad hlavním scénářem;
- instalace, migrace, recovery a diagnostický export;
- měřené eval reporty podle PRD;
- kontrola vizuálních důkazů, jejich vazby na aktuální revizi a zveřejněných omezení;
- kontrola dokumentace proti aktuálnímu buildu.

### Dokončovací brána

R7 je dokončeno, když všechna M/ŠF kritéria mají stav a důkaz, žádná otevřená volba neblokuje hlavní scénář a release candidate nemá známou chybu ohrožující data, bezpečný návrat nebo obhajobu.

### Důkaz a porozumění autora

- kompletní test report, výsledky uživatelského testování, accessibility checklist a dokumentační index;
- autor umí vysvětlit hlavní kompromisy, neúspěšné experimenty, omezení i důvody odložených funkcí.

## 12. R8 – release freeze a obhajoba

### Cíl

Zmrazit přesně určený build a připravit opakovatelnou finální obhajobu bez poslední vlny funkcí.

### Pozorovatelný výsledek

Stejný instalační build, fixture projekt a kontrolovaný scénář použité při generálních zkouškách jsou připravené pro obhajobu spolu s fallbackem a důkazy.

### Zahrnutý rozsah

- release freeze a pouze opravy blokujících chyb;
- finální instalační build a kontrolní součet;
- čistá instalace, migrace a recovery test;
- finální traceability matice, test report a známá omezení;
- hlavní scénář, fake fallback a lokální video;
- nejméně tři časované generální zkoušky;
- prezentace a technické podklady pro otázky komise;
- archivace rozhodnutí, evalů a důkazů použitých při obhajobě.

### Vědomě nezahrnutý rozsah

- nové funkce a neblokující refaktoring;
- změny vizuální identity po zmrazení;
- aktualizace závislostí bez bezpečnostního nebo blokujícího důvodu.

### Závislosti

- dokončené R7;
- vybraný release candidate a uzavřený seznam známých omezení.

### Povinné ověření

- hashově identický nebo jednoznačně verzovaný build ve všech zkouškách;
- tři úspěšné časované průchody hlavního scénáře;
- úspěšný fake fallback bez sítě;
- ověření videa, prezentace a lokálních podkladů na cílovém zařízení;
- závěrečná kontrola traceability a dokumentace.

### Dokončovací brána

R8 je dokončeno, když je obhajovací build neměnný, všechny materiály jsou dostupné offline a autor dokáže předvést i vysvětlit hlavní scénář bez zásahu do vnitřního stavu aplikace.

### Důkaz a porozumění autora

- archivovaný build, kontrolní součet, instalační postup, protokoly generálních zkoušek, prezentace, fallback a video;
- autor umí obhájit produktový cíl, architekturu, bezpečnost, testování, vlastní přínos a známá omezení.

## 13. Horizont po škole

Tato část není závazným implementačním pořadím. Nápad se přesune do aktivní roadmapy až po nové revizi rozsahu a rozhodnutí o veřejném směru produktu.

- oficiální podpora macOS a Linuxu;
- další jazykové a frameworkové capability profily;
- širší podpora lokálních modelů a model routing;
- pokročilá dlouhodobá paměť a background agenti;
- instalace skillů nebo pluginů z GitHubu či jiné URL, veřejný nebo komunitní marketplace, podpisy, aktualizace a reputace zdrojů;
- týmové účty, sdílené politiky a kolaborace;
- silnější procesní a síťový sandbox;
- bezpečný handoff rozpracované práce mezi zařízeními;
- širší benchmarky a veřejná distribuce.

## 14. Šablona oblastního implementačního kroku

Před zahájením větší oblasti vznikne krátká implementační specifikace nebo plán s těmito položkami:

1. **Cíl:** jedna ověřitelná věta popisující vytvořenou schopnost.
2. **Pozorovatelný výsledek:** co lze po dokončení spustit, vidět nebo změřit.
3. **Soubory a odpovědnosti:** přesné vytvářené a měněné soubory a jediná odpovědnost každého z nich.
4. **Rozhraní:** vstupy, výstupy, vlastníci dat, chybové výsledky a invarianta.
5. **Závislosti:** dokončené předchozí kroky, knihovny, experimenty a rozhodnutí.
6. **Vazba na PRD:** konkrétní ID požadavků a akceptačních kritérií.
7. **Vědomě nezahrnutý rozsah:** funkce, které by mohly být omylem považovány za součást kroku.
8. **Testovací cyklus:** nejprve selhávající test, minimální implementace, průchod testu a relevantní regrese.
9. **Chybové a bezpečnostní scénáře:** konkrétní odmítnutí, timeouty, stale data, recovery a redakce citlivých údajů.
10. **Dokončovací brána:** binární podmínky, jejichž nesplnění brání označení kroku jako hotového.
11. **Důkaz:** test report, event trace, screenshot, diff, eval nebo instalační artefakt.
12. **Porozumění autora:** otázky a datový tok, které musí autor umět vlastními slovy vysvětlit.
13. **Commit hranice:** malé samostatně ověřitelné změny; commit nevzniká před úspěšným testem daného přírůstku.

## 15. Pravidla údržby roadmapy

- Stav kroku může být `nezačato`, `probíhá`, `omezeně splněno`, `splněno` nebo `zamítnuto rozhodnutím`.
- Přesun schopnosti mezi R kroky, O1, ŠF a PŠ se provede současně v PRD nebo registru, etapizaci, roadmapě a traceability matici podle dopadu.
- Změna pořadí je přípustná, pokud zachová závislosti a bezpečnostní brány; důvod se zapíše do registru rozhodnutí nebo projektového kontextu.
- Krok se neoznačí jako splněný pouze podle existence kódu. Musí projít dokončovací bránou a mít aktuální důkaz.
- Po relevantní změně implementace se starý důkaz označí jako zastaralý, dokud neproběhne nové ověření.
- Roadmap se neplní mechanicky. Pokud experiment vyvrátí předpoklad, vývoj se zastaví na nejbližší bezpečné hranici, rozhodnutí se aktualizuje a teprve potom se upraví další postup.
