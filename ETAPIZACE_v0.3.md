# Codryn – interní etapizace k PRD v0.3

| Položka | Hodnota |
| --- | --- |
| Stav | Pracovní etapizace k revizi |
| Datum | 12. srpna 2026 |
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

## F0 – rozhodnutí a technické základy

**Orientační okno:** srpen 2026.  
**Cíl:** odstranit rizika, která by vynutila přestavbu celého projektu.

- potvrdit repo strukturu a hranice renderer/backend/orchestrátor/harness;
- vytvořit minimální Electron spike s úzkým IPC;
- ověřit SQLite balení, WAL, migraci a zálohu na Windows;
- ověřit spuštění, timeout a ukončení procesního stromu;
- definovat interní kontrakty zpráv, událostí, tool callů a adapterů;
- definovat stavové automaty AgentRun, ToolCall, PermissionRequest, ChangeSet a GitOperation a zakázané závislosti mezi komponentami;
- ověřit Git CLI, zjištění credential mechanismu a lokální bare-remote fixture bez ukládání tajemství;
- zavést rozhodovací záznamy a základ testovací infrastruktury.

**Gate:** lze spustit zabalení nebo produkčně blízký Electron build, bezpečně uložit a obnovit testovací relaci a řízeně spustit/ukončit fixture proces.

## F1 – první kompletní agentní průchod

**Orientační okno:** srpen až září 2026.  
**Cíl:** co nejdříve získat malý end-to-end cyklus místo izolovaných obrazovek.

- otevření projektu, projektový chat a stav relace;
- fake adapter, capability kontrakt a první reálný modelový adapter vybraný provider evalem mezi počátečními kandidáty;
- čtení, hledání, cílený patch a omezený shell/test;
- Řízený režim oprávnění a append-oriented event log;
- diff, ověřovací výsledek a návrat změny;
- první deterministický Git fixture.
- základní `@` reference na projektový soubor v composeru a audit skutečně sestaveného kontextu.

**Gate:** referenční úkol projde 10krát z 10 s fake adapterem a žádný neověřený stav není zobrazen jako dokončený.

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
- koordinační snapshot aktivních relací, resource-key lease a základ přímého zápisu subagenta;
- offline experiment E0 epizodické paměti nad verzovaným datasetem bez produktového UI.

**Gate:** všechny povinné O1 bezpečnostní fixture pro cestu, oprávnění, konflikt, timeout a stale zápis procházejí; E0 má reprodukovatelný report a explicitní rozhodnutí bez automatického rozšíření scope.

## F3 – TypeScript profil, repo mapa a lednové UI

**Orientační okno:** říjen až prosinec 2026.  
**Cíl:** dokončit dvě prioritní odlišující oblasti široké alfy.

- rozpoznání TypeScript/Node/React/Next.js projektu;
- definice, reference, typy, diagnostika a import/export vazby;
- progresivní repo mapa, invalidace a hlubší inicializace;
- jedna stabilní pracovní plocha se všemi kritickými stavy;
- kompaktní Git workspace: stav, diff, stage/unstage souboru, historie, branch, commit, fetch, pull a push;
- lokální remote testy pro ahead/behind, pull s lokálními změnami, konflikt a non-fast-forward push;
- finální O1 composer s klávesově ovladatelnými `@` referencemi;
- viditelný strom subagentů a stručná koordinace souběžných relací;
- čitelnost na projektoru a základní loading/error/empty stavy;
- malý eval strukturálních dotazů a repo mapy.

**Gate:** O1 TypeScript eval, UI checklist, Git remote fixture, concurrency fixture a kritická cesta agentního cyklu splňují `PRD_v0.3.md`.

## F4 – stabilizace O1

**Nejzazší okno:** prosinec 2026 až první část ledna 2027.  
**Cíl:** žádné nové rizikové pilíře; pouze dokončení, měření a příprava důkazů.

- release candidate a čistá instalace na cílovém Windows 11;
- živá i fake demonstrace stejné hodnoty;
- časované generální zkoušky a projektorová čitelnost;
- test report, známé limity a záložní video;
- výběr konkrétní demonstrační aplikace a malé funkce;
- technické experimenty pro model Auto režimu a Windows sandbox.
- uzavření rozhodnutí o prvním reálném adaptéru a archivace jeho aktuálních cenových/datových podkladů;
- audit všech M/O1 Git, koordinace a context-reference kritérií.

**Gate:** všechna M/O1 kritéria mají důkaz a hlavní scénář je opakovatelný bez ručních zásahů do vnitřního stavu.

## F5 – produktizace pro finální verzi

**Orientační okno:** leden až březen 2027.  
**Cíl:** navázat na stabilní jádro, nikoli jej přepisovat.

- druhý reálný modelový adapter;
- pravidla oprávnění a hybridní Auto režim;
- účet, autentizace a povinný cloudový rozsah;
- onboarding, tři výchozí plochy a přizpůsobení panelů;
- trvalá nastavení, klávesové zkratky a obnova podporovaných stavů;
- canvas a bezpečný ruční import rozšíření.
- obecné souborové a obrazové přílohy, drag-and-drop a vložení obrázku ze schránky;
- vizuální Git graf větví a merge historie;
- rozdílový snapshot při obnově starší relace a registr spolehlivě sledovaných procesů.

**Gate:** lokální jádro zůstává funkční bez cloudu a nové vrstvy neporušují O1 regresní sadu.

## F6 – finální kvalita a odlišení

**Orientační okno:** březen až duben 2027.  
**Cíl:** dokončit uživatelskou kvalitu, měření a nejvýše vybrané wow prvky.

- finální vizuální směr, světlé/tmavé schéma a accessibility pass;
- Playwright screenshot a navazující multimodální tok;
- uživatelské testování a prioritizované opravy;
- repo mapa vs. baseline a Auto mode security eval;
- dokumentace instalace, BYOK, oprávnění a návratu změn;
- pouze při rezervě bezpečný handoff snapshot.

**Gate:** všechna M/ŠF mají stav a důkaz; žádný volitelný prvek nesnižuje spolehlivost lokálního agentního cyklu.

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
4. Playwright vision-check, pokud neohrozí povinný multimodální základ;
5. pokročilé chování repo mapy nad rámec měřitelného minima;
6. stage po huncích a pokročilé vizuální funkce Git grafu nad povinné minimum;
7. silnější Windows sandbox, pokud experiment neprokáže proveditelnost;
8. produktová implementace epizodické paměti, pokud E0 jednoznačně nesplní rozhodovací gate.

Nikdy se kvůli množství funkcí neškrtá ochrana tajemství, audit oprávnění, diff, bezpečný návrat, deterministický fallback ani pravdivé označení ověřeného stavu.

