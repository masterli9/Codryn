# Codryn – registr produktových rozhodnutí v0.2

| Položka | Hodnota |
| --- | --- |
| Stav | Pracovní registr k PRD v0.2 |
| Datum | 11. srpna 2026 |
| Autorita | Doplňuje `PRD_v0.2.md`; při rozporu má přednost PRD |

Registr zachycuje rozhodnutí uzavřená při revizi PRD v0.1. Nejde o implementační plán ani neměnný seznam knihoven. Technické experimenty mohou změnit způsob realizace, nikoli produktový cíl bez nové revize rozhodnutí.

## DR-01: Pracovní název Codryn

**Stav:** přijato jako pracovní název.  
**Rozhodnutí:** PRD v0.2 používá název Codryn. Před veřejným vydáním proběhne hlubší kontrola ochranných známek, domén, balíčkových registrů a dalších technologických produktů.  
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

**Stav:** přijato jako závazný kandidát pro PRD v1.0.  
**Rozhodnutí:** více uživatelských relací může vědomě pracovat nad stejnou projektovou složkou bez povinného worktree. Backend rozpozná souběžnou práci a začínajícímu agentovi předá strukturovaný přehled aktivních relací, jejich úkolů, stavů, pracovních záměrů a změněných souborů. Agent vyhodnotí překryv a může pokračovat ve sdíleném workspace, upravit plán, počkat nebo navrhnout worktree. Před vytvořením worktree musí výchozí režim získat souhlas uživatele.  
**Bezpečnostní pojistka:** koordinace nenahrazuje optimistic concurrency; patch s neaktuálním očekávaným hashem se zastaví a agent musí nový obsah znovu analyzovat.  
**Subagenti:** hlavní agent může už v O1 delegovat omezené paralelní úlohy subagentům, kteří dědí stejná nebo užší oprávnění a jsou viditelní ve stromu práce. Subagenti smějí přímo zapisovat do společného workspace. Jejich zápisy používají stejnou ochranu očekávanou revizí nebo hashem, úzkou serializaci stavových operací a auditní provenienci jako zápisy samostatných relací.  
**Sdílené shrnutí úkolu:** v O1 vzniká `taskSummary` automaticky z aktuálního zadání a plánu agenta, je krátké, viditelné a upravitelné uživatelem. Později může jeho průběžnou aktualizaci zajišťovat lehký model, aniž by se ostatním relacím zpřístupnil celý chat.  
**Životní cyklus aktivity:** `recently_writing` trvá pět minut od posledního zápisu a každý nový zápis interval obnoví. Poté relace s nevrácenými změnami přejde do `idle_with_changes`; bez aktivních změn přestane být relevantní pro koordinaci.  
**Serializované operace:** úzký zámek podle konkrétního zdroje chrání stavové Git operace, instalace balíčků a změny stejného lockfilu a migrace stejné projektové databáze. Běžné editace různých souborů zůstávají paralelní. Spouštění a zastavování dev serverů se centrálně neserializuje; případná kolize portu se zpracuje jako výsledek procesu.  
**Podrobný návrh:** `NAVRH_WORKSPACE_AWARENESS_v0.1.md`.  
**Poznámka:** tvrzení o konkurenční unikátnosti vyžaduje před použitím v prezentaci samostatnou aktuální rešerši.
