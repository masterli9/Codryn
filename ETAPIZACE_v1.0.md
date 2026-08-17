# Codryn – interní etapizace k PRD v1.0

| Položka | Hodnota |
| --- | --- |
| Stav | Schválená etapizace k PRD v1.0 |
| Datum | 14. srpna 2026 |
| První obhajoba | přibližně polovina ledna 2027 |
| Finální obhajoba | přibližně polovina května 2027 |

Tato etapizace není školní seznam měsíčních úkolů. Je to interní řízení rizika. Cílem je dokončovat fáze před jejich nejzazšími kontrolními body a udržovat rezervu na studium kódu, dokumentaci, opravy a opakované ověření.

## Zásady řízení rozsahu

1. Každá fáze končí fungujícím vertikálním výsledkem nebo doloženým experimentem.
2. Kritická cesta má vždy přednost před canvasem, cloudovým handoffem, finálními animacemi a marketplace rozšířeními.
3. Funkce se nepovažuje za hotovou bez testu, srozumitelného chybového stavu a aktualizovaného architektonického kontextu.
4. Codex urychluje implementaci, ale plánovací kapacita stále zahrnuje autorské studium, revizi a dokumentaci.
5. Interní cíle se průběžně posouvají dopředu; oficiální termín neslouží jako plánované datum dokončení.
6. Drobný UX detail lze doplnit během implementace, ale nová schopnost, změna bezpečnostní hranice nebo přesun etapy vyžaduje rozhodovací záznam.
7. Workspace awareness snižuje počet konfliktů, ale žádná fáze nesmí vypustit očekávaný hash/revizi při zápisu.
8. Skutečné pořadí implementačních přírůstků a jejich dokončovací brány určuje `ROADMAP.md`; tato etapizace nadále řídí rozsah, rizika a vazbu na školní milníky.

## F0 – rozhodnutí a technické základy

**Orientační okno:** srpen 2026.  
**Cíl:** odstranit rizika, která by vynutila přestavbu celého projektu.

- potvrdit repo strukturu a hranice renderer/backend/orchestrátor/harness;
- vymezit sdílené aplikační služby tak, aby je mohly používat interní headless/CLI driver, automatické testy i Electron renderer bez duplikace agentních pravidel;
- vytvořit minimální Electron spike s úzkým IPC pouze pro ověření integračních rizik, nikoli jako první produktové UI;
- ověřit SQLite balení, WAL, migraci a zálohu na Windows;
- ověřit spuštění, timeout a ukončení procesního stromu;
- definovat interní kontrakty zpráv, událostí, tool callů a adapterů;
- definovat stavové automaty AgentRun, ToolCall, PermissionRequest, ChangeSet a GitOperation a zakázané závislosti mezi komponentami;
- ověřit Git CLI, zjištění credential mechanismu a lokální bare-remote fixture bez ukládání tajemství;
- zavést rozhodovací záznamy a základ testovací infrastruktury.

**Gate:** lze spustit zabalení nebo produkčně blízký Electron spike, bezpečně uložit a obnovit testovací relaci a řízeně spustit/ukončit fixture proces; doménové a aplikační kontrakty přitom nejsou závislé na rendereru.

## F1 – první kompletní agentní průchod

**Orientační okno:** srpen až září 2026.  
**Cíl:** co nejdříve získat malý end-to-end cyklus místo izolovaných obrazovek.

- interní headless/CLI driver pro otevření fixture projektu, zadání úkolu a sledování stavu relace;
- doménové a aplikační služby sdílené s budoucím Electron rendererem;
- fake adapter a provider-neutral capability kontrakt připravený pro pozdější reálné adaptery;
- čtení, hledání, cílený patch a omezený shell/test;
- Řízený režim oprávnění a append-oriented event log;
- diff, ověřovací výsledek a návrat změny;
- první deterministický Git fixture;
- základní explicitní reference na projektový soubor v headless vstupu a audit skutečně sestaveného kontextu;
- po stabilizaci headless průchodu připojit minimální Electron pracovní plochu ke stejným aplikačním službám bez přesunu orchestrace do rendereru.

**Gate:** referenční úkol projde v headless režimu 10krát z 10 s fake adapterem, žádný neověřený stav není zobrazen jako dokončený a stejnou relaci lze pozorovat přes minimální Electron UI bez odlišné implementace agentní smyčky.

## F2 – bezpečný a obnovitelný harness

**Orientační okno:** září až říjen 2026.  
**Cíl:** z prototypu udělat spolehlivé jádro.

- Git i non-Git snapshoty a ochrana ručních změn;
- trvalé eventy v SQLite a obnova po pádu podporovaných stavů;
- normalizované chyby provideru a nástrojů;
- timeouty, zrušení, Job Object a process-tree testy;
- kontraktní testy adapterů a nástrojů;
- omezení cest, výstupů a tajemství.
- Workspace State, `workspaceRevision`, expected-hash zápisy a invalidace zastaralých ověření;
- resource-key lease a audit provenience zapisujícího aktéra bez závislosti na produktově dostupných subagentech;
- základ výchozí ochranné politiky automatického kontextu a parseru `.codrynignore`.

**Volitelný S/O1 výstup:** koordinační snapshot aktivních relací a základ přímého zápisu subagenta; offline E0 epizodické paměti nad verzovaným datasetem bez produktového UI.

**Gate:** všechny povinné O1 bezpečnostní fixture pro cestu, oprávnění, konflikt, timeout, stale zápis a invalidaci odvozeného kontextu procházejí. Volitelná koordinace ani E0 gate F2 neblokují.

## F3 – TypeScript profil, repo mapa a lednové UI

**Orientační okno:** říjen až prosinec 2026.  
**Cíl:** dokončit dvě prioritní odlišující oblasti široké alfy.

- provést provider eval počátečních kandidátů a připojit první reálný modelový adapter přes kontrakt ověřený ve F1;
- rozpoznání TypeScript/Node/React/Next.js projektu;
- definice, reference, typy, diagnostika a import/export vazby;
- progresivní repo mapa, invalidace a hlubší inicializace;
- jedna stabilní pracovní plocha se všemi kritickými stavy;
- kompaktní lokální Git workspace: stav, diff, stage/unstage souboru, historie, branch, commit a AI návrh commit message;
- jednotné použití `.codrynignore` při crawlu, hledání, TypeScript indexování, repo mapě, hlubší inicializaci a context assembly;
- finální O1 composer s klávesově ovladatelnými `@` referencemi;
- strukturované upřesňující otázky s důvodem, dvěma až pěti možnostmi, vlastní odpovědí a trvalým stavem `waiting_for_user_input` odděleným od oprávnění;
- interní registry a dva vestavěné workflows, z nichž jeden podporuje plánování nebo brainstorming a druhý ověření;
- čitelnost na projektoru a základní loading/error/empty stavy;
- malý eval strukturálních dotazů a repo mapy.

**Volitelný S/O1 výstup:** `fetch`, `pull` a `push` včetně lokálních remote testů; import cizího lokálního manifestu s bezpečným náhledem; `taskSummary`, koordinační snapshot, viditelný strom a skuteční subagenti; E0; jednoduchý canvas.

**Gate:** O1 TypeScript eval, UI checklist, lokální Git fixture, concurrency fixture bezpečnostního jádra, `.codrynignore` security suite a kritická cesta agentního cyklu splňují `PRD_v1.0.md`. Test otázky prokáže obnovu po restartu rendereru, právě jedno pokračování po odpovědi a samostatné oprávnění navazující rizikové akce. Nesplněný S/O1 výstup je zaznamenán s cílovou etapou, ale první obhajobu neblokuje.

## F4 – stabilizace O1

**Nejzazší okno:** prosinec 2026 až první část ledna 2027.  
**Cíl:** žádné nové rizikové pilíře; pouze dokončení, měření a příprava důkazů.

- release candidate a čistá instalace na cílovém Windows 11;
- živá i fake demonstrace stejné hodnoty;
- časované generální zkoušky a projektorová čitelnost;
- test report, známé limity a záložní video;
- výběr konkrétní demonstrační aplikace a malé funkce;
- technické experimenty pro model Auto režimu a Windows sandbox;
- uzavření rozhodnutí o prvním reálném adaptéru a archivace jeho aktuálních cenových/datových podkladů;
- audit všech M/O1 Git, bezpečnostního koordinačního jádra, `.codrynignore`, vestavěných workflows a context-reference kritérií;
- zveřejnění stavu každého S/O1 cíle bez jeho vydávání za povinnou součást alfy.

**Gate:** všechna M/O1 kritéria mají důkaz a hlavní scénář je opakovatelný bez ručních zásahů do vnitřního stavu.

## F5 – produktizace pro finální verzi

**Orientační okno:** leden až březen 2027.  
**Cíl:** navázat na stabilní jádro, nikoli jej přepisovat.

- druhý reálný modelový adapter;
- pravidla oprávnění a hybridní Auto režim;
- účet, autentizace a povinný cloudový rozsah;
- onboarding, tři výchozí plochy a přizpůsobení panelů;
- trvalá nastavení, klávesové zkratky a obnova podporovaných stavů;
- canvas a bezpečný ruční import rozšíření;
- vzdálené Git operace `fetch`, `pull` a `push` přes Git CLI a systémový credential helper nebo SSH;
- `taskSummary`, koordinační snapshot, vyhodnocení překryvu, viditelný strom a skuteční subagenti;
- obecné souborové a obrazové přílohy, drag-and-drop a vložení obrázku ze schránky;
- vizuální Git graf větví a merge historie;
- rozdílový snapshot při obnově starší relace a registr spolehlivě sledovaných procesů.

**Gate:** lokální jádro zůstává funkční bez cloudu a nové vrstvy neporušují O1 regresní sadu.

## F6 – finální kvalita a odlišení

**Orientační okno:** březen až duben 2027.  
**Cíl:** dokončit uživatelskou kvalitu, měření a nejvýše vybrané wow prvky.

- finální vizuální směr, světlé/tmavé schéma a accessibility pass;
- povinný Playwright screenshot a vision-check aktuální revize pro podporované vizuální úkoly, včetně opravy známého nesouladu a pravdivého stavu „vizuálně neověřeno“ při nedostupné kontrole;
- uživatelské testování a prioritizované opravy;
- repo mapa vs. baseline a Auto mode security eval;
- dokumentace instalace, BYOK, oprávnění a návratu změn;
- pouze při rezervě bezpečný handoff snapshot.

**Gate:** všechna M/ŠF mají stav a důkaz; připravená webová fixture prokáže odhalení známého vizuálního nesouladu, opravnou iteraci, vazbu screenshotu na aktuální revizi a fallback „vizuálně neověřeno“. Žádný volitelný prvek nesnižuje spolehlivost lokálního agentního cyklu.

## F7 – release freeze a obhajoba

**Nejzazší okno:** konec dubna až polovina května 2027.  
**Cíl:** stabilní obhajitelný produkt, nikoli poslední vlna funkcí.

- release freeze a pouze opravy blokujících chyb;
- čistá instalace, migrace a diagnostický export;
- nejméně tři časované generální zkoušky;
- finální traceability matice, test report a známá omezení;
- prezentace, hlavní demo, fake fallback a lokální video.

**Gate:** stejný build a stejný kontrolovaný scénář použité při generální zkoušce jsou připraveny pro obhajobu.

## Pravidla pro škrtání rozsahu

Při skluzu se omezují funkce v tomto pořadí:

1. handoff rozpracovaného zdrojového kódu;
2. nadstandardní animace a mikrointerakce;
3. online nebo rozšířený marketplace;
4. pokročilé chování repo mapy nad rámec měřitelného minima;
5. stage po huncích a pokročilé vizuální funkce Git grafu nad povinné minimum;
6. silnější Windows sandbox, pokud experiment neprokáže proveditelnost;
7. provedení volitelného E0 v rámci školního projektu;
8. produktová implementace epizodické paměti, která je v každém případě až PŠ a navíc vyžaduje úspěšný E0 i nové rozhodnutí.

Nikdy se kvůli množství funkcí neškrtá ochrana tajemství, oddělení otázky od oprávnění, audit oprávnění, diff, bezpečný návrat, deterministický fallback, povinný důkaz podporovaného vizuálního úkolu ani pravdivé označení ověřeného stavu.
