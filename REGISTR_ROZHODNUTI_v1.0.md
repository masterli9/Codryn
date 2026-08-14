# Codryn – registr produktových rozhodnutí v1.0

| Položka | Hodnota |
| --- | --- |
| Stav | Schválený registr k PRD v1.0 |
| Datum | 14. srpna 2026 |
| Autorita | Doplňuje `PRD_v1.0.md`; při rozporu má přednost PRD |

Registr zachycuje rozhodnutí uzavřená do vydání PRD v1.0. Nejde o implementační plán ani neměnný seznam knihoven. Technické experimenty mohou změnit způsob realizace, nikoli produktový cíl bez nové revize rozhodnutí.

## DR-01: Pracovní název Codryn

**Stav:** přijato jako pracovní název.  
**Rozhodnutí:** PRD v1.0 používá název Codryn. Před veřejným vydáním proběhne hlubší kontrola ochranných známek, domén, balíčkových registrů a dalších technologických produktů.  
**Důvod:** název působí techničtěji a je lépe odlišitelný než Codey, ale orientační kontrola ještě není právní ani úplná.

## DR-02: Termíny a strategie předstihu

**Stav:** přijato.  
**Rozhodnutí:** O1 je plánována přibližně na polovinu ledna 2027, ŠF na polovinu května 2027. Měsíční školní úkoly jsou nejzazší kontrolní body; interní realizace má běžet s výrazným předstihem.  
**Kapacita:** přibližně 21 hodin týdně v srpnu 2026 a 10 hodin týdně během školního roku. Odhady zahrnují studium kódu, vysvětlování a dokumentaci, nikoli jen generování implementace.

## DR-03: Charakter lednové verze

**Stav:** přijato.  
**Rozhodnutí:** O1 má být použitelná široká alfa, nikoli pouze úzký prototyp ani téměř finální produkt. Vedle celého agentního cyklu prioritizuje TypeScript strukturální nástroje, progresivní repo mapu a funkčně promyšlené UI.  
**Odloženo na jaro:** účet/cloud, Auto režim, tři plně přizpůsobitelné layouty, finální vizuální identita, úplný accessibility pass a další doplňky.

## DR-04: Rozsah lednového UI

**Stav:** přijato.  
**Rozhodnutí:** O1 má jedno stabilní pracovní rozložení, jednotné komponenty, čitelný chat, aktivitu, oprávnění, diff, testovací výsledky a základní loading/error/empty stavy.  
**Mimo O1:** úplný systém přesouvání panelů, tři presety, vlastní profily layoutu, detailní animace a finální design system.

## DR-05: Electron

**Stav:** přijato jako závazný školní základ.  
**Rozhodnutí:** desktopový shell a privilegovaný backend používají Electron s React/TypeScript rendererem a úzkým IPC. Tauri již není paralelní alternativou.  
**Zbývající ověření:** bezpečné IPC, Windows balení, credential storage a procesní runner.

## DR-06: SQLite a lokální soubory

**Stav:** přijato.  
**Rozhodnutí:** hlavní lokální databází je SQLite v režimu WAL s cizími klíči, verzovanými migracemi a TypeScript validací. Backend je jediným vlastníkem obecného databázového přístupu.  
**Rozdělení dat:** relační metadata, chaty a event log jsou v SQLite; velké přílohy a snapshoty v datovém adresáři; API klíče v zabezpečeném úložišti Windows.

## DR-07: TypeScript profil pro O1

**Stav:** přijato.  
**Rozhodnutí:** lednová verze rozpozná podporovaný projekt, najde definice a reference symbolů, vrátí typy, diagnostiku a vazby importů/exportů. Model nedostává celý AST; nástroje poskytují malé strukturované výsledky.  
**Odloženo:** obecné LSP napojení, úplný call graph, složité automatické refaktoringy a další jazyky.

## DR-08: Progresivní repo mapa a hluboká inicializace

**Stav:** přijato.  
**Rozhodnutí:** při otevření projektu vznikne rychlý deterministický základ. Mapa se prohlubuje podle aktuálních úloh a po změnách cíleně invaliduje. Uživatel může explicitně spustit hlubší inicializaci podobnou `/init`.  
**Otevřený detail:** finální název příkazu a jeho přesné UI umístění.

## DR-09: Auto režim

**Stav:** architektura přijata, konkrétní model otevřen.  
**Rozhodnutí:** pevná politika nejprve vyřeší jasné `allow`, `deny` a povinné `ask`. Lehký AI klasifikátor posuzuje jen zbývající případy, vrací rozhodnutí, jistotu a důvod; při nejistotě se ptá uživatele. Kritické hranice nikdy nejsou delegovány klasifikátoru.  
**Experiment:** lokální a API kandidáti se porovnají na skutečných tool callechech nejpozději do 31. ledna 2027.

## DR-10: Procesní izolace a Windows sandbox

**Stav:** minimum přijato, silnější sandbox podmíněn experimentem.  
**Rozhodnutí pro O1:** shell běží v odděleném child/utility procesu s timeoutem, zachyceným výstupem, exit codem a řízením podporovaného stromu potomků přes Windows Job Object nebo ověřený ekvivalent. Worker thread není bezpečnostní hranice.  
**Rozhodnutí pro ŠF:** skutečné omezení souborů a sítě se stane povinným jen po úspěšném Windows experimentu; jinak se limity zdokumentují a silnější sandbox přesune do pozdějšího rozsahu.

## DR-11: Účet a cloudová synchronizace

**Stav:** přijato pro ŠF.  
**Rozhodnutí:** povinný cloudový rozsah zahrnuje účet, chaty, zprávy, nastavení a základní projektová metadata. Lokální jádro funguje bez cloudu. Zdrojový kód, snapshoty a API klíče se běžně nesynchronizují.  
**Ambiciózní rozšíření:** vědomý handoff rozpracovaných změn pouze po splnění všech povinných quality gates; jinak PŠ.

## DR-12: Soukromý vývoj a pozdější licence

**Stav:** přijato.  
**Rozhodnutí:** repozitář zůstává během školního vývoje soukromý. Konkrétní licence a případné veřejné vydání se rozhodnou před publikací, pravděpodobně po finální obhajobě.

## DR-13: Demonstrační strategie

**Stav:** přijato na úrovni strategie.  
**Rozhodnutí:** hlavní demo používá připravený malý TypeScript/React projekt a přidání deterministicky testovatelné funkce. Přesná funkce se vybírá až před obhajobou podle stabilního release candidate. Volitelný „wow“ scénář může nechat Codryn upravit vlastní aplikaci přes hot reload, ale nenahrazuje stabilní hlavní demo.

## DR-14: Porozumění autora a dokumentace

**Stav:** přijato jako zásada, proces bude navržen později.  
**Rozhodnutí:** funkce není považována za plně předanou autorovi pouze proto, že funguje. Autor musí rozumět hlavním komponentám, toku dat a důvodům architektonických rozhodnutí a musí je být schopen vysvětlit při obhajobě. Detailní režim průběžných vysvětlení a rekapitulací se stanoví před implementací.

## DR-15: Workspace Awareness a koordinace souběžných relací

**Stav:** přijato a rozděleno podle priority v PRD v1.0.  
**Povinné bezpečnostní jádro O1:** backend udržuje `workspaceRevision`; každý zápis nese očekávaný hash nebo revizi; zastaralé ověření se pravdivě invaliduje; stavové operace nad stejným resource key se serializují; audit zachová provenienci zapisujícího aktéra. Tyto pojistky platí i bez produktově dostupné koordinace a subagentů.  
**Volitelný cíl S/O1, povinný M/ŠF:** automatický krátký `taskSummary`, snapshot aktivních relací, vyhodnocení překryvu, viditelný strom práce a skuteční subagenti s přímými zápisy do sdíleného workspace. Více relací může vědomě sdílet složku bez povinného worktree; případné vytvoření worktree vyžaduje souhlas uživatele.  
**Pojistka plného toku:** awareness zůstává měkkým signálem a nikdy nenahrazuje optimistic concurrency. Subagenti dědí stejná nebo užší oprávnění a jejich zápisy používají stejné hashe/revize, resource-key serializaci a auditní provenienci. `recently_writing` trvá pět minut od posledního úspěšného zápisu; poté relace s nevrácenými změnami přechází do `idle_with_changes`.  
**Podrobný návrh:** `NAVRH_WORKSPACE_AWARENESS_v0.1.md`.  
**Poznámka:** tvrzení o konkurenční unikátnosti vyžaduje před použitím v prezentaci samostatnou aktuální rešerši.

## DR-16: Technická hloubka PRD v1.0

**Stav:** přijato.  
**Rozhodnutí:** PRD určuje stabilní odpovědnosti komponent, stavové automaty, význam interních kontraktů, bezpečnostní invarianty, chybové chování a ověřitelné výsledky. Neurčuje přesné TypeScript interface, úplné SQL migrace, názvy tříd, adresářovou strukturu ani každou knihovnu.  
**Důvod:** autor musí architekturu pochopit a obhájit, ale produktový dokument nesmí zastarat při každé rozumné implementační změně.

## DR-17: Produktový baseline a průběžné UX detaily

**Stav:** přijato.  
**Rozhodnutí:** běžné UX schopnosti se systematicky kontrolují podle oblastních toků místo spoléhání na autorovu paměť. Drobný detail lze doplnit během implementace bez nové revize PRD pouze tehdy, pokud nemění etapu, bezpečnost, data, externí účinek nebo význam akceptačního kritéria.  
**Konkrétní rozsah:** `@` reference na projektové soubory a složky jsou M/O1; obecné textové a obrazové přílohy, drag-and-drop a vložení obrázku ze schránky jsou M/ŠF.

## DR-18: Kompaktní Git workspace

**Stav:** přijato.  
**Povinné O1:** Codryn poskytne lokální stav repozitáře, staged/unstaged soubory, diff, historii commitů, stage/unstage celého souboru, vytvoření a přepnutí branche, commit a upravitelný AI návrh commit message.  
**Vzdálené operace:** `fetch`, `pull` a `push` jsou S/O1 a M/ŠF. Spouštějí se explicitně přes nainstalovaný Git CLI; autentizaci ponechají systémovému credential helperu nebo SSH. Codryn hesla, tokeny ani privátní klíče nečte a neukládá. Nepodporovaný interaktivní prompt skončí bezpečnou chybou s návodem dokončit přihlášení mimo relaci.  
**Bezpečnost:** lokální i vzdálené stavové operace používají čerstvý preflight, resource-key serializaci a audit. Pull nesmí zvolit nejasnou merge/rebase strategii a push nesmí v běžném toku automaticky použít force.  
**ŠF:** čitelný graf větví a historie; stage po huncích je podmíněný doplněk.  
**Mimo povinný rozsah:** interaktivní rebase, cherry-pick, bisect, komplexní stash management a plnohodnotný konflikt editor.

## DR-19: Výběr prvního reálného adaptéru

**Stav:** kandidáti přijati, výsledek otevřen do evalu.  
**Rozhodnutí:** dřívější pevná volba Gemini `gemini-2.5-flash` se nahrazuje provider-neutral výběrem. Prvními kandidáty jsou GPT-5.6 Luna a Gemini `gemini-2.5-flash`; porovnává se kvalita tool callů, dokončení úkolu, oprava po chybě, latence, cena celého úkolu a aktuální podmínky zpracování dat.  
**Důvod:** aktuální placená cena GPT-5.6 Luna může být nižší, ale ceník samotný neprokazuje stejnou agentní kvalitu. Free tier Gemini je použitelný pro vhodné testy, nikoli bez upozornění pro soukromý kód.

## DR-20: Epizodická paměť jako experiment E0

**Stav:** volitelný experiment S/O1 schválen, produktová funkce neschválena.  
**Rozhodnutí:** E0 může v O1 proběhnout offline nad syntetickými nebo anonymizovanými dlouhými relacemi, ale není gate první obhajoby ani ŠF. Porovná plnou historii, posuvné okno, lineární kompakci a jednoduché checkpointy se selektivním dohledáním evidence.  
**Gate:** produktová epizodická paměť může být zvažována nejdříve v PŠ a pouze po úspěšném E0, zachované nebo lepší správnosti, prokazatelné úspoře aktivního kontextu, funkční stale detekci, auditovatelném návratu ke kanonickým eventům a samostatném rozhodnutí. FTS5, automatické hranice, reranking a embeddings nejsou součástí školní verze.

## DR-21: Headless/CLI průřez před produktovým UI

**Stav:** přijato.

**Rozhodnutí:** první funkční vertikální průřez agentního jádra vznikne přes interní headless/CLI driver. Ověří cestu zadání → fake nebo reálný adapter → tool call → oprávnění → změna → ověření → diff a výsledek → bezpečný návrat, aniž by správnost této cesty závisela na React rendereru.

**Hranice:** CLI není samostatný produkt, veřejný příslib ani druhé dlouhodobě udržované uživatelské rozhraní. CLI, automatické testy a Electron renderer používají stejné aplikační služby, doménové kontrakty a eventy; agentní pravidla se nesmí duplikovat do jednotlivých rozhraní.

**Paralelní ověření:** v F0 současně vznikne minimální Electron spike pouze pro včasné ověření Windows balení, úzkého IPC, SQLite a procesního runneru. Minimální produktové UI se připojí po stabilizaci headless vertikálního průřezu.

**Důvod:** oddělení agentního jádra od prezentační vrstvy zrychlí deterministické testování, zpřesní hranice komponent a zabrání tomu, aby chyby UI zakrývaly chyby orchestrace nebo harnessu.

## DR-22: Pravidla zdrojů konkurenční inspirace

**Stav:** přijato.

**Rozhodnutí:** Codryn nebude při návrhu ani implementaci používat neveřejný, uniklý nebo jinak licenčně nejasný proprietární codebase. Inspirace může vycházet z veřejného chování produktu, oficiální dokumentace a veřejných repozitářů s ověřenou licencí.

**Provenience:** pokud konkrétní veřejný zdroj ovlivní významné technické rozhodnutí nebo implementaci, příslušná oblastní specifikace či rozhodovací záznam uvede zdroj, licenci, převzatý princip a vlastní odůvodnění řešení Codrynu.

**Důvod:** pravidlo omezuje právní a bezpečnostní riziko, brání neúmyslnému přenosu proprietárního kódu a zachovává obhajitelnost samostatné maturitní práce.

## DR-23: Rozsah rozšíření v O1, ŠF a PŠ

**Stav:** přijato.

**Rozhodnutí:** O1 povinně obsahuje interní registry a dva vestavěné pracovní postupy: nejméně jeden planning nebo brainstorming skill a jeden ověřovací workflow. Import cizího lokálního manifestu s normalizovaným náhledem a bez automatického spuštění či instalace je S/O1 a M/ŠF. Minimální MCP klient a správa zapnutí, vypnutí a odebrání rozšíření jsou M/ŠF. Instalace z GitHubu nebo jiné URL je S/PŠ a vyžaduje samostatný bezpečnostní a provenienční návrh.

**Důvod:** vestavěné workflow ověří architekturu rozšíření bez toho, aby první obhajoba závisela na bezpečném spouštění cizího kódu nebo návrhu distribučního marketplace.

## DR-24: `.codrynignore` jako hranice automatického kontextu

**Stav:** přijato jako M/O1.

**Rozhodnutí:** kořenový `.codrynignore` používá zdokumentovanou podmnožinu `.gitignore`-like syntaxe a spolu s ochrannými výchozími pravidly jednotně omezuje crawl, hledání, TypeScript index, repo mapu, hlubší inicializaci a sestavování modelového kontextu. `.gitignore` je pouze doplňkový signál. Ignorované cesty zůstávají viditelné s důvodem; běžný soubor lze explicitně použít jednorázově, tajemství pouze po zvláštním varování a nikdy jako trvalou či adresářovou výjimku. Změna pravidel invaliduje dotčená odvozená data.

**Důvod:** jediná konzistentní hranice snižuje riziko, že jiná automatická cesta obejde ochranu kontextu nebo tajemství.

## DR-25: Význam a změnový režim PRD v1.0

**Stav:** přijato.

**Rozhodnutí:** v1.0 znamená schválený implementačně připravený produktový kontrakt, nikoli hotovou implementaci. Soubor je po vydání neměnný snapshot. Změna produktového rozsahu, priority etapy, bezpečnostní či datové hranice nebo významu akceptačního kritéria vyžaduje v1.1 nebo vyšší; oprava překlepu či nutná redakce se eviduje samostatně. Implementační rozhraní, migrace, knihovny a drobné UX detaily zůstávají v navazujících specifikacích, checklistech a testech, pokud nemění produktový kontrakt.

## DR-26: Strukturované otázky a povinné vizuální ověření

**Stav:** přijato.

**Rozhodnutí o otázkách:** strukturované upřesňující otázky jsou M/O1. Agent je používá tehdy, když chybějící rozhodnutí uživatele může podstatně změnit plán, rozsah nebo výsledek. Otázka obsahuje stručný důvod, dvě až pět odlišitelných možností a vlastní textovou odpověď. Je trvale navázána na původní běh ve stavu `waiting_for_user_input`; odpověď, odmítnutí nebo zrušení se zpracují idempotentně a běh lze obnovit právě jednou.

**Bezpečnostní hranice:** `UserQuestion` je významově i stavově oddělena od `PermissionRequest`. Odpověď sama nepovoluje nástroj ani nerozšiřuje oprávnění, otázka nesmí vyžadovat heslo, API klíč nebo jiné tajemství a každá následná riziková akce znovu prochází permission enginem.

**Rozhodnutí o vizuálním ověření:** Playwright screenshot a vision-check jsou M/ŠF pro podporované úkoly, jejichž akceptace závisí na vzhledu nebo rozložení vykresleného UI. Stav „vizuálně ověřeno“ vyžaduje screenshot aktuální relevantní workspace revize, dohledatelný uživatelský záměr, viewport, výsledek a známá omezení. Nesoulad se vrací do opravné smyčky; nedostupný preview, Playwright nebo obrazová capability vede pouze ke stavu „vizuálně neověřeno“ s důvodem. Kontrola není povinná pro změny, jejichž správnost na vykresleném UI nezávisí.

**Důvod:** původní motivací produktu je odstranit situaci, kdy coding agent předloží neověřený výsledek, který neodpovídá zadání, jako hotový. Playwright sám negarantuje správný design, ale poskytuje aktuální vykreslený důkaz a spolu s vision-checkem, deterministickými kontrolami a opravnou smyčkou brání nepodloženému tvrzení o vizuálním dokončení.
