# R4: běžný uživatelský úkol jako cesta k široké alfě

**Stav:** návrh k autorskému posouzení, nikoli schválená implementace

**Autority:** `PROJECT_CONTEXT.md`, `PRD_v1.1.md`, `REGISTR_ROZHODNUTI_v1.1.md`; pořadí a brány v `docs/product/ROADMAP.md` §8

**Výchozí stav:** R3 je sloučené do `main`. Aplikace má vlastní textové zadání, oddělený demonstrační a OpenAI režim, běh agenta, schvalování, změny, ověření a návrat. Osobní přijetí R3 a vypsané mezery jeho důkazů zůstávají otevřené podle `PROJECT_CONTEXT.md` a `docs/r3-acceptance.md`.

## Záměr

Uživatel otevře vlastní malý TypeScript/React projekt, v projektovém chatu napíše vlastní zadání a zvolí skutečný `gpt-6-luna`. Codryn vybere omezený a dohledatelný kontext, provede relevantní strukturální dotazy a bezpečný cyklus čtení, úpravy a kontroly. Uživatel vidí skutečný stav, diff, platnost ověření a může změnu vrátit. Když podstatně chybí rozhodnutí, agent položí obnovitelnou otázku a pokračuje ve stejném běhu po odpovědi. Lokální Git akce uživatel spouští vědomě nad aktuálním stavem.

Výsledek R4 není příslib, že model dokončí libovolné zadání. Podporovaný rozsah je malý lokální TypeScript/Node.js a React/Next.js projekt podle PRD. Nesplněný nebo neověřený úkol musí být takto označen.

Současné R3 přijímá další vlastní zadání v témže chatu jako nový samostatný úkol; starší zprávy zůstávají v historii, ale automatické navázání na jejich obsah je v PRD vedeno jako `FR-CHAT-06` pro ŠF. Tento návrh R4 zahrnuje opakované vlastní úkoly, zatímco plné konverzační pokračování by vyžadovalo samostatné rozhodnutí o rozsahu.

## Cíle a hranice

- Dodat všechny zbývající M/O1 funkce přiřazené R4 a ke každé automatický nebo manuální důkaz. Zachovat R2/R3 ochrany a jejich regresní testy.
- Udržet demonstrační režim jako offline zálohu; reálný režim přijímá vlastní text uživatele a není vázán na `sum.mjs` fixture. Referenční fixture zůstává test, ne produktové omezení.
- Použít backend jako zdroj pravdy. Renderer má pouze validované úzké IPC a nedostane Node, filesystem ani Git API.
- Neodeslat modelu celý repozitář nebo ignorované tajemství. U každé projektové reference musí být zřejmé, co se skutečně načetlo.
- Nepředstírat aktuální ověření po relevantní změně souboru, konfigurace nebo Gitu.
- Vzdálený Git, import cizích manifestů, produktové subagenty, E0 a canvas jsou S/O1; do R4 vstoupí jen po samostatném zařazení. Účet, cloud, druhý adapter, Auto režim a finální systém rozložení nejsou R4.

## Zvolený přístup

1. **Běžný úkol nejprve (zvoleno autorem):** průběžně rozšiřovat jeden uživatelský tok od vlastního promptu přes kontext a TypeScript až po ověření a lokální Git. Každý krok má fungovat samostatně nad existujícím R3.
2. **Oddělené technické pilíře (nezvoleno):** implementovat TypeScript, mapu, Git a otázky izolovaně a propojit je nakonec. Umožňuje samostatné testy, ale později ukáže problémy v reálném průchodu.

R4 je několik navazujících projektů. Tento dokument určuje společný uživatelský tok a hranice; detailní technické specifikace a implementační plány vzniknou po oblastech. První plán má zlepšit běžný úkol bez změny schváleného produktu; další plány na něj navážou přes malé backendové kontrakty.

## Navržené pořadí oblastí

### 1. První běžný TypeScript úkol se správným ověřením

První přírůstek musí být viditelný: uživatel zadá vlastní úpravu v malém projektu mimo referenční fixture, zvolí reálný model a uvidí relevantní kontrolu typů nebo test odvozený z projektu. Nesmí se bez potvrzení instalovat chybějící závislosti. Opakovatelný fake scénář a samostatný živý protokol doloží stejnou cestu. Základní rozpoznání TypeScript projektu a výběr kontroly zde předchází úplným strukturálním dotazům v další oblasti.

Současně sjednotit výchozí ochranu a `.codrynignore` na cestách, které tento první přírůstek používá, zejména čtení, hledání a sestavení kontextu. Ignorovaná cesta má viditelný důvod a tajemství se nesmí nenápadně odeslat. Backend sleduje aktuální obsah při zápisu a platnost ověření. Následující oblastní plány rozšíří stejnou politiku na nové indexy a mapu, zavedou jednorázové výjimky a dokončí monotónní `workspaceRevision`, provenienci a resource-key serializaci před lokálními Git operacemi. Bez těchto dokončení nelze uzavřít související M/O1 kritéria.

**První použitelný výsledek:** vlastní prompt na úpravu TypeScript projektu mimo `sum.mjs` fixture vede k čitelné změně, skutečně spuštěné relevantní kontrole a pravdivému výsledku. Důkaz: opakovatelný integrační průchod, `FR-TERM-04`, bezpečnostní regrese R2/R3 a oddělený live report. `AC-O1-23/24/27` se uzavřou až po dokončení všech dotčených cest.

### 2. TypeScript profil a relevantní kontrola

Nad rozpoznaným projektem nabídnout cílené dotazy na deklarace, reference, signatury, typy, diagnostiku a import/export vazby. Respektovat dostupný `tsconfig.json`, omezit strukturovaný výstup a při neplatném projektu výslovně označit fallback; selhání strukturální služby nesmí vypnout běžné čtení a hledání. Relevantní typecheck nebo test se odvodí bez instalace závislostí a jeho skutečný příkaz i výsledek se zapíší k běhu.

**Použitelný výsledek:** vlastní požadavek na úpravu TypeScript kódu má přesnější podklady a odpovídající ověření. Důkaz: `FR-TS-01..08`, `FR-TERM-04`, ručně ověřených 20 dotazů s nejméně 18 shodami podle `AC-O1-13`.

### 3. Progresivní repo mapa, reference a audit kontextu

Po otevření projektu vytvořit rychlý deterministický základ mapy asynchronně bez blokování hlavního UI. Pro aktuální úkol prohloubit jen relevantní části; na vyžádání spustit hlubší inicializaci. Mapa nese cestu, druh, hlavní symboly/exporty, roli a obsahovou revizi. `@` nabídka vybírá soubory a složky uvnitř projektu, reference jde odebrat a při odeslání se znovu ověří existence, revize, velikost a ignore politika. Audit rozliší uživatelský text, referenci a konkrétní načtený výřez.

**Použitelný výsledek:** uživatel může zadat „oprav tuto komponentu“ s explicitní referencí, vidí nedostupnou či změněnou referenci a model dostane jen vybraný obsah. Důkaz: `AC-O1-14/17/18` a baseline srovnání mapy na stejných fixture úlohách.

### 4. Strukturovaná otázka v původním běhu

Model může při skutečně chybějícím rozhodnutí vyvolat otázku se stručným důvodem, dvěma až pěti odlišitelnými možnostmi a vlastní textovou odpovědí. Backend trvale uloží otázku a stav `waiting_for_user_input`. Obnova rendereru zachová čekání; duplicitní odpověď vyvolá právě jedno pokračování původního běhu. Otázka nenahrazuje schválení nástroje, destruktivní akce ani žádost o tajemství.

**Použitelný výsledek:** uživatel zadá nejednoznačný úkol, rozhodne v chatu a agent pokračuje bez nového úkolu. Důkaz: `AC-O1-31` včetně restartu a následného samostatného permission requestu.

### 5. Lokální Git pracovní tok

Zobrazit aktuální branch, HEAD, upstream, stav a dostupné ahead/behind údaje, staged/unstaged soubory, diff a historii. Stage/unstage celého souboru, změna branche a commit vždy znovu ověří aktuální Git stav a riziko ztráty změn. AI návrh commit message vychází pouze ze staged diffu, je upravitelný a commit vyžaduje explicitní uživatelskou akci. Operace nad stejným worktree či referencí mají resource key, tedy úzký zámek konkrétního zdroje, a auditní událost.

**Použitelný výsledek:** po běžném úkolu může uživatel zkontrolovat a commitnout jen zvolené změny. Důkaz: `AC-O1-19/20/22` včetně externí změny indexu.

### 6. Vestavěné workflows a rozšířený modelový eval

Interní registry drží jméno, verzi, popis, schopnosti a oprávnění. Kurátorovaný katalog obsahuje nejméně jeden plánovací/brainstorming a jeden ověřovací workflow. Reálný OpenAI adapter projde rozšířenými shodnými tool-calling scénáři v Git i non-Git projektu; report odděluje modelovou chybu, chybu harnessu a nedostupnost API a uvádí úspěšnost, opravu po chybě, latenci a odhad ceny. Historické rozhodnutí o provideru a R2 eval se nepřepisují.

**Použitelný výsledek:** běžný úkol umí použít deklarovaný pracovní postup a širší sada doloží schopnosti i limity reálného modelu. Důkaz: `FR-EXT-01/02`, `FR-LLM-12` a kontraktní/eval report.

## Společný průchod a důkazy

Každá oblast má vlastní specifikaci, implementační plán, úzké testy a kontrolu na čerstvém zdroji. Průběžný integrační scénář začíná vlastním uživatelským promptem v reálném režimu, ale automatické opakovatelné testy používají fake adapter. Zvláštní živý eval má pevný rozpočet a předem zaznamenané podmínky; žádné automatické testy bez výslovného nastavení nespotřebují placené API. Po každé oblasti se ověří hranice balíčků, typy, lint, relevantní testy a regresní R2/R3 průchod. Úplná dokončovací matice odkáže každý M/O1 požadavek a povinné AC na čerstvý důkaz nebo jej otevřeně označí za nesplněný.

## Rozhodnutí ponechaná implementačnímu návrhu

- Volba mezi TypeScript Compiler API a `ts-morph` podle malé reprodukovatelné sondy přesnosti, provozní ceny a izolace chyb. PRD připouští obě cesty.
- Přesné backendové porty, SQLite migrace a IPC operace se navrhnou v oblastních specifikacích po přečtení současných kontraktů; zachovají stávající hranice vrstev.
- Výběr konkrétních 20 TypeScript dotazů, fixture projektů a živých úloh se verzovaně zaznamená před měřením, aby výsledek nevybíral jen úspěšné příklady.
- R3 osobní přijetí a důkazní mezery se řeší jako samostatný předpoklad dokončení R4, nikoli jako potichu uzavřený výsledek tohoto návrhu.

## Podklad pro autorské schválení

Autor potvrdí nebo opraví hranici prvního přírůstku, zejména zda očekává také navazování na starší zprávy v chatu už v R4. Po schválení tohoto společného návrhu vznikne první oblastní specifikace a teprve z ní podrobný implementační plán s konkrétními soubory, rozhraními, testy a commity. Schválení návrhu samo o sobě nedokládá funkčnost R4.
