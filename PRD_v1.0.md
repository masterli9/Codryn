# Codryn – Product Requirements Document

| Položka | Hodnota |
| --- | --- |
| Dokument | Product Requirements Document |
| Verze | 1.0 |
| Stav | Schválený implementačně připravený produktový kontrakt |
| Datum | 14. srpna 2026 |
| Produkt | Codryn (pracovní název) |
| Cílová platforma školní verze | Windows 11 |
| Primární jazyk dokumentu | Čeština |

## 0. Účel, autorita a způsob čtení dokumentu

Tento dokument definuje produktové požadavky na Codryn, desktopový AI coding agent pro práci nad lokálními softwarovými projekty. PRD v1.0 je schválený implementačně připravený produktový kontrakt: určuje, co musí produkt dělat a jaké hranice nesmí implementace porušit, ale netvrdí, že je produkt již implementovaný. Slouží jako společný podklad pro návrh architektury, etapizaci vývoje, měsíční konzultace, testování, školní dokumentaci a obě obhajoby. Nejde o implementační plán ani o závazný návrh vizuální identity.

### 0.1 Hierarchie zdrojů

Při vzniku PRD byly použity následující podklady v tomto pořadí autority:

1. `PROJECT_CONTEXT.md` – zdroj pravdy pro dosavadní rozhodnutí;
2. aktuální zadání autora projektu, včetně rozhodnutí přijatých při finální revizi v1.0;
3. `REGISTR_ROZHODNUTI_v1.0.md` a `ETAPIZACE_v1.0.md` jako doprovodné dokumenty;
4. `ROADMAP.md` jako schválené pořadí implementačních přírůstků bez kalendářních dat;
5. `NAVRH_WORKSPACE_AWARENESS_v0.1.md` pouze jako podrobný podklad v rozsahu výslovně přijatém v tomto PRD;
6. `NAVRH_EPIZODICKE_PAMETI_KONTEXTU_v0.1.md` pouze jako podklad volitelného experimentu E0, nikoli jako schválená produktová funkce;
7. starší idea a analytické dokumenty.

Starší podklady jsou inspirací. Jejich tvrzení o cenách, modelech, schopnostech konkurence, uniklých implementacích nebo budoucích standardech nejsou bez dalšího ověření považována za fakta ani závazné požadavky. Při konsolidaci historického rozporu platilo aktuální rozhodnutí autora zachycené v `PROJECT_CONTEXT.md`; po vydání je produktovým kontraktem tento PRD a jeho význam lze změnit pouze novou verzí podle 0.2.2.

### 0.2 Rozsah rozhodnutí v PRD

PRD závazně popisuje požadované chování produktu, stabilní technické hranice a etapizaci. Určuje odpovědnosti komponent, stavové přechody, bezpečnostní invarianty a význam interních kontraktů, ale neurčuje přesné TypeScript interface, úplné SQL schéma, adresářovou strukturu ani volbu každé knihovny. Tyto implementační detaily patří do navazujících oblastních specifikací a plánů. Detailní vizuální identita, barvy, typografie, ikonografický styl a finální vzhled komponent nejsou tímto dokumentem určeny. Autor si v těchto oblastech ponechává rozhodující roli. Funkční rozložení pracovní plochy, dostupné panely a pravidla jejich přizpůsobení jsou naopak součástí požadavků.

### 0.2.1 Změny proti v0.3

PRD v1.0 konsoliduje technicky podrobnou v0.3 do stabilního produktového kontraktu. Zachovává strukturu a ID požadavků všude, kde se jejich význam nemění. Nově zejména:

- definuje v1.0 jako implementačně připravený, ale dosud neimplementovaný produktový kontrakt a stanovuje pravidla jeho verzování;
- potvrzuje interní headless/CLI průřez před produktovým UI a společné aplikační jádro pro CLI, testy a Electron renderer;
- zavádí strukturované upřesňující otázky jako M/O1 stav agentní relace oddělený od bezpečnostního schválení;
- odděluje povinnou ochranu každého zápisu od škrtatelné koordinace více relací a subagentů v O1;
- ponechává v O1 povinné vestavěné skilly, ale přesouvá import cizího lokálního manifestu do S/O1 a instalaci z GitHubu nebo URL do S/PŠ;
- zachovává povinnou lokální Git práci v O1 a přesouvá `fetch`, `pull` a `push` do S/O1 s povinným dodáním nejpozději v ŠF;
- mění E0 na volitelný experiment S/O1 a podmiňuje jakoukoli produktovou epizodickou paměť samostatným rozhodnutím v PŠ;
- zavádí `.codrynignore` jako explicitní M/O1 hranici automatického crawlování, hledání, indexování, repo mapy a sestavování kontextu;
- povyšuje Playwright screenshot a vision-check na M/ŠF důkaz pro podporované úkoly, jejichž správnost závisí na vykresleném UI;
- sjednocuje souhrny etap, scénáře, akceptační kritéria, rizika, rozhodnutí a roadmapu s těmito prioritami.

### 0.2.2 Řízení změn po vydání v1.0

`PRD_v1.0.md` je po schválení neměnný historický snapshot. Běžné implementační detaily, volba knihovny nebo drobný UX detail dokument nemění, pokud se nezmění schopnost, etapa, data, bezpečnostní hranice, externí účinek ani význam akceptačního kritéria. Takový detail se zachytí v oblastní specifikaci, checklistu a testu.

Uzavření předem evidovaného otevřeného rozhodnutí se zaznamená do registru rozhodnutí a `PROJECT_CONTEXT.md`. Oprava překlepu nebo jednoznačné redakční chyby může být evidována bez nové produktové verze. Změna povinného rozsahu, etapy, datové nebo bezpečnostní hranice, externího účinku či významu akceptačního kritéria vytváří novou verzi PRD, například v1.1; v1.0 se zpětně nepřepisuje.

### 0.3 Označení etap

| Zkratka | Etapa | Význam |
| --- | --- | --- |
| O1 | První obhajoba | Stabilní, projektorem předveditelný vertikální průřez produktem |
| ŠF | Finální školní verze | Rozsah určený pro závěrečnou obhajobu a hodnocení |
| PŠ | Pokračování po škole | Smysluplná produktová rozšíření mimo závazný školní rozsah |

### 0.4 Pracovní předpoklady

Následující předpoklady umožňují specifikaci konkretizovat, aniž by nahrazovaly chybějící rozhodnutí:

- **P-01:** Codryn je pracovní název pro PRD v1.0; před veřejným vydáním proběhne samostatná kontrola názvu a licence.
- **P-02:** Vývoj a oficiální testování školní verze probíhá na Windows 11.
- **P-03:** Primární testovací projekty jsou TypeScript/Node.js a React/Next.js; základní souborové nástroje mohou pracovat s libovolnou lokální složkou.
- **P-04:** Školní demonstrace používá předem připravený malý projekt s deterministickými testy a bez skutečných tajemství.
- **P-05:** Cloud nesmí být podmínkou spuštění lokálního agentního jádra.
- **P-06:** Zřízení placené služby, cloudové infrastruktury nebo účtu u externího poskytovatele vyžaduje samostatný souhlas autora.
- **P-07:** Procenta rozsahu u obhajoby se posuzují podle dokončeného pracovního cyklu, ne podle počtu obrazovek nebo komponent.
- **P-08:** První obhajoba proběhne přibližně v polovině ledna 2027 a finální obhajoba přibližně v polovině května 2027.
- **P-09:** Autor začíná v srpnu 2026 s plánovací kapacitou přibližně 21 hodin týdně; během školního roku plánuje přibližně 10 hodin týdně.
- **P-10:** Měsíční školní úkoly jsou nejzazší kontrolní body, nikoli cílová data dokončení. Projekt se vědomě realizuje s předstihem a rezervou na porozumění kódu, dokumentaci a technické experimenty.
- **P-11:** Běžné UX detaily se mohou zpřesňovat během implementace, pokud nemění bezpečnostní hranici, etapu ani rozsah schopnosti; takové doplnění se zaznamená v oblastním checklistu a testu.
- **P-12:** Workspace Intelligence poskytuje ověřitelná fakta a doporučení, ale optimistic concurrency s očekávaným hashem nebo revizí zůstává závaznou hranicí každého zápisu.
- **P-13:** Epizodická paměť není ve v1.0 schválenou školní produktovou funkcí. E0 je volitelný offline experiment S/O1 a případná produktová implementace vyžaduje samostatné rozhodnutí pro PŠ.
- **P-14:** První funkční vertikální průřez agentního jádra vzniká přes interní headless/CLI driver. CLI není samostatný produkt; CLI, automatické testy a Electron renderer používají stejné doménové kontrakty a aplikační služby.
- **P-15:** `.codrynignore` je samostatná hranice automatického získávání kontextu. `.gitignore` může poskytnout doplňkový signál, ale není bezpečnostní náhradou `.codrynignore`.

## 1. Shrnutí produktu

Codryn je desktopový AI coding agent pro zkušenější vývojáře, který pracuje nad jejich lokálními projekty. Uživatel zadává úkol v chatu, agent si cíleně získává kontext, volá bezpečně zpřístupněné nástroje, upravuje kód, spouští relevantní kontroly a dokládá výsledek pomocí událostí, diffu a testovacích výstupů. Uživatel může práci sledovat, řídit oprávnění, změny vracet a zvolit si poskytovatele i model pomocí vlastního API klíče.

Codryn není pouze chatové rozhraní nad LLM API. Hlavní produktovou hodnotou je vlastní agentní infrastruktura: orchestrátor, modelové adaptéry, nástroje, bezpečný execution harness, pravidla oprávnění, event log, správa kontextu a ověřovací smyčka. Kvalita výsledku nemá stát jen na slibu modelu, že je úkol hotový, ale na pozorovatelném pracovním procesu a konkrétním důkazu.

### 1.1 Pracovní elevator pitch

> Codryn je transparentní desktopový AI coding agent, který nad lokálním projektem nejen navrhuje změny, ale bezpečně je provede, ověří a ukáže důkazy, takže vývojář získá vysokou míru automatizace bez ztráty kontroly.

### 1.2 Co Codryn je

- samostatná desktopová aplikace pro Windows 11;
- chat-first pracovní prostředí nad lokálními projekty;
- agentní orchestrátor s jednotnou vrstvou pro různé LLM poskytovatele;
- bezpečný a auditovatelný prostředník mezi modelem, soubory a procesy;
- rozšiřitelná platforma pro vestavěné nástroje, skilly a MCP servery;
- školní projekt, jehož přínos lze demonstrovat a měřit.

### 1.3 Co Codryn není

- plnohodnotná náhrada IDE;
- automatický generátor kompletních aplikací pro netechnické uživatele;
- vlastní jazykový model;
- systém slibující bezchybnou nebo zcela bezobslužnou autonomii;
- cloudové vývojové prostředí, do kterého se automaticky nahrává celý repozitář;
- univerzální převodník skic do pixelově přesného hotového UI.

## 2. Produktová vize a principy

### 2.1 Vize

Codryn má ukázat, že užitečnost coding agenta neurčuje pouze kvalita použitého modelu. Stejně důležité je prostředí, které modelu poskytne správný kontext, účelné nástroje, bezpečnostní hranice, možnost iterovat podle chyb a povinnost doložit výsledek. Dlouhodobě má být možné připojit různé modely, pracovní postupy a externí nástroje bez přestavby jádra aplikace.

### 2.2 Produktové principy

1. **Důkaz před prohlášením.** Agent nesmí označit relevantní změnu za ověřenou, pokud nemá zaznamenaný výsledek odpovídající kontroly. Když kontrolu nelze spustit, musí to výslovně přiznat.
2. **Autonomie s dohledem.** Rutinní práce uvnitř otevřeného projektu může být automatická, ale rizikové akce podléhají pravidlům a schválení.
3. **Backend je zdroj pravdy.** UI pouze zobrazuje a ovládá stav relace; ztráta rendereru nesmí vytvořit neviditelné čekání ani ztrátu auditní historie.
4. **Reverzibilita.** Každá změna provedená agentem musí být dohledatelná a vratná bez poškození dřívější ruční práce uživatele.
5. **Git je výhoda, ne podmínka.** Plnohodnotná základní práce musí být dostupná i nad složkou bez repozitáře.
6. **Přenositelnost modelové vrstvy.** Orchestrátor nesmí předpokládat jediný API formát nebo jediného poskytovatele.
7. **Nejmenší potřebný kontext.** Model má dostávat relevantní soubory, výsledky dotazů a shrnutí, ne bezmyšlenkovitě celý repozitář.
8. **Rozšiřitelnost s důvěrou.** Skill, plugin nebo MCP server smí získat pouze popsané a schválené schopnosti.
9. **Technické detaily nejsou skrývány.** Zkušený uživatel vidí příkazy, výsledky, diffy, důvody oprávnění a stav ověření.
10. **Spolehlivá ukázka má přednost před počtem funkcí.** Každá školní etapa musí mít kontrolovaný a opakovatelný demonstrační tok.

## 3. Problém a příležitost

### 3.1 Problém uživatele

Současný coding agent může vytvořit užitečný patch, ale uživatel často neví, zda:

- si model přečetl správné soubory a projektová pravidla;
- použil dostupné nástroje, nebo výsledek pouze odhadl;
- provedl relevantní typovou kontrolu či testy;
- nerozbil související část projektu;
- čeká na skryté schválení nebo se relace zastavila;
- změnil jen zamýšlené soubory;
- lze jeho zásah bezpečně vrátit;
- externí plugin nebo příkaz nepřekročil hranici projektu.

Pouhé přidání dalších nástrojů do promptu tento problém neřeší. Model se může rozhodnout nástroj nepoužít, použít jej ve špatném pořadí nebo chybně interpretovat výstup. Chybí provozní infrastruktura, která vytvoří jasný životní cyklus úkolu a vynutí minimální podmínky dokončení.

### 3.2 Produktová příležitost

Codryn může propojit několik známých mechanismů do jednoho srozumitelného pracovního prostředí:

- chat a historii konkrétního úkolu;
- cílené čtení a strukturální porozumění TypeScriptu;
- bezpečné lokální nástroje;
- viditelné rozhodování o oprávnění;
- průběžnou historii změn a návrat;
- automatizovanou ověřovací smyčku;
- modelově nezávislé adaptéry;
- multimodální komunikaci záměru pomocí obrázku a kresby.

Originalita nespočívá v tvrzení, že žádný dílčí mechanismus jinde neexistuje. Spočívá ve vlastním návrhu harnessu, integraci uvedených prvků, měřitelném ověření jejich přínosu a ve způsobu, jakým Codryn dává uživateli vysokou autonomii i kontrolu současně.

### 3.3 Proč je problém vhodný pro maturitní projekt

Projekt kombinuje desktopový vývoj, asynchronní komunikaci, práci s procesy a souborovým systémem, bezpečnost, perzistenci, cloudovou autentizaci, API integrace, návrh uživatelského rozhraní a automatizované testování. Současně poskytuje viditelný demonstrační scénář a dostatek vlastních technických rozhodnutí, která lze obhájit před komisí.

## 4. Cíloví uživatelé

### 4.1 Primární persona: zkušený samostatný vývojář

Primárním uživatelem je vývojář, který pracuje nad vlastním lokálním projektem, rozumí zdrojovému kódu, Gitu, terminálu a významu testů. Chce delegovat rutinní nebo dobře vymezené úkoly agentovi, ale potřebuje vědět, co agent provedl, proč to provedl a jak výsledek ověřil.

**Cíle uživatele:**

- zadat změnu přirozeným jazykem bez ručního psaní rutinního kódu;
- sledovat průběh bez čtení nepřehledného interního logu;
- rychle zkontrolovat diff a výsledek testů;
- omezit rizikové příkazy a přístup mimo projekt;
- vrátit chybnou změnu;
- zvolit model podle ceny, schopností nebo ochrany dat.

**Očekávané znalosti:**

- orientace ve struktuře projektu;
- základní práce s terminálem;
- pochopení diffu a testovacího výsledku;
- vědomí, že AI může chybovat.

### 4.2 Sekundární persona: student nebo juniorní vývojář

Uživatel ovládá základy programování a chce se od agenta učit, nikoli pouze přebírat hotový výstup. Pro něj jsou důležité čitelné kroky, vysvětlení chyb, viditelný výsledek nástroje a bezpečnější výchozí řízený režim.

### 4.3 Sekundární persona: experimentující power user

Uživatel zkouší různé poskytovatele, lokální modely, skilly a MCP servery. Očekává přenositelné konfigurace, detailní přehled schopností a možnost upravit pravidla oprávnění. Školní verze tuto personu obslouží pouze částečně; online marketplace a širší import patří do pokračování po škole.

### 4.4 Explicitně necíloví uživatelé

- člověk bez základní znalosti programování, který očekává vytvoření a provoz produktu jediným promptem;
- organizace požadující certifikované enterprise zabezpečení nebo správu celého týmu;
- vývojář vyžadující plnohodnotné IDE funkce pro všechny jazyky;
- uživatel očekávající garantovaný správný výsledek bez vlastní kontroly.

## 5. Odlišení a hodnota produktu

| Oblast | Běžné riziko | Zamýšlené odlišení Codryn |
| --- | --- | --- |
| Dokončení úkolu | Model pouze oznámí, že je hotovo | Stav dokončení je spojen s dohledatelnou kontrolou nebo explicitním stavem „neověřeno“ |
| Tool calling | Nástroje existují, ale jejich použití je nahodilé | Orchestrátor řídí životní cyklus, minimální kroky a vracení chyb do další iterace |
| Transparentnost | Uživatel vidí hlavně chatový text | Události, příkazy, oprávnění, diff a ověření tvoří jednu historii úkolu |
| Kontext | Příliš mnoho surového kódu nebo ztráta souvislostí | Cílené nástroje, TypeScript dotazy a postupně budovaná repo mapa |
| Bezpečnost | Shell nebo plugin získá široký přístup | Harness validuje vstupy, pracovní adresář, oprávnění, timeouty a výstupy |
| Reverzibilita | Bez Gitu je návrat obtížný | Git workflow nebo vlastní snapshoty podle typu projektu |
| Model | Produkt je svázaný s jedním providerem | Jednotné rozhraní adapterů a BYOK |
| Komunikace UI záměru | Text je pro prostorové změny nepřesný | Obrázek a kreslená anotace se předávají jako jeden multimodální požadavek |

## 6. Cíle, metriky a non-goals

### 6.1 Produktové cíle školní verze

- Dodat fungující Windows desktopovou aplikaci, nikoli webový prototyp bez přístupu k lokálnímu projektu.
- Prokázat celý agentní cyklus analýza → změna → ověření → prezentace výsledku → bezpečný návrat.
- Udržet uživatele informovaného o každém nástroji a každém rozhodnutí o oprávnění.
- Oddělit UI, orchestrátor, nástroje a execution harness jasnými rozhraními.
- Ověřit modelovou přenositelnost alespoň dvěma adaptéry do finální školní verze.
- Poskytnout funkční práci v Git i non-Git projektu.
- Doložit technickou kvalitu automatizovanými testy a opakovatelnými demonstracemi.
- Udržet architekturu a dokumentaci v podobě, kterou autor projektu dokáže samostatně vysvětlit a obhájit; rychlost AI-asistovaného vývoje nesmí nahradit porozumění systému.
- Vytvořit základ pro skills, MCP a pluginy bez bezpečnostně neřízené instalace cizího kódu.
- Dodat účet jako součást školní verze, aniž by cloud ohrozil lokální použitelnost.

### 6.2 Hlavní měřitelné výsledky

| Metrika | O1 | ŠF |
| --- | ---: | ---: |
| Úspěšné deterministické end-to-end průchody referenčním úkolem | 10 z 10 | 20 z 20 napříč alespoň 4 scénáři |
| Úspěšné živé průchody s testovacím API při dostupné službě | nejméně 4 z 5 | nejméně 9 z 10 na sadě malých úkolů |
| Tool cally zapsané v event logu | 100 % | 100 % |
| Rozhodnutí o oprávnění s výsledkem a důvodem | 100 % | 100 % |
| Agentní změny vratné na původní obsah referenčního projektu | 100 % testovaných změn | 100 % testovaných změn v Git i non-Git sadě |
| Povinné bezpečnostní testy překročení kořene projektu | všechny blokovány | všechny blokovány |
| Kontraktní sada modelového adapteru | 1 reálný + fake adapter | 2 reálné + fake adapter |
| Obnova rozpracované relace po restartu rendereru | bez ztráty potvrzené události | bez ztráty potvrzené události i po restartu aplikace v podporovaných stavech |
| Kritické demonstrační scénáře se záložním důkazem | 100 % | 100 % |

Čísla úspěšnosti živého LLM nejsou tvrzením o obecné kvalitě modelu. Měří pouze opakovatelnost konkrétních, předem definovaných školních scénářů v kontrolovaném projektu.

### 6.3 Non-goals školní verze

- vývoj nebo trénování vlastního foundation modelu;
- podpora macOS a Linuxu jako akceptační podmínka;
- úplná náhrada VS Code nebo jiného IDE;
- prvotřídní strukturální podpora všech jazyků a frameworků;
- současná týmová editace projektu;
- autonomní publikování změn do produkce;
- automatické slučování konfliktů bez kontroly uživatele;
- garantovaná formální správnost vygenerovaného kódu;
- povinné TDD pro každý typ úkolu bez ohledu na projekt a zadání;
- Docker jako povinná závislost první obhajoby;
- automatická instalace z libovolné GitHub URL;
- veřejný online marketplace s hodnocením a aktualizacemi;
- tichá synchronizace zdrojových souborů mezi zařízeními;
- cloudové ukládání API klíčů jako výchozí chování;
- pixelově přesný převod skici do hotového rozhraní;
- závazná barevná paleta, typografie nebo finální vizuální identita v tomto PRD.

## 7. Rozsah podle etap

### 7.1 První obhajoba (O1)

První obhajoba musí ukázat stabilní a projektorem dobře čitelnou širokou alfu. Cílem je dokončit celé použitelné agentní jádro, přibližně alespoň 65 % plánované funkčnosti harnessu a naprostou většinu tool callů potřebných pro základní reálný úkol. Lednový rozsah záměrně upřednostňuje technickou hloubku TypeScript profilu a srozumitelnost hlavní pracovní plochy před účtem, cloudem a finálním systémem přizpůsobení UI.

**Závazné jádro O1:**

- spustitelná desktopová aplikace pro Windows 11;
- otevření existující lokální složky jako projektu;
- projektový chat a viditelný stav relace;
- fake LLM pro testy a jeden první reálný adapter vybraný z kandidátů GPT-5.6 Luna a Gemini `gemini-2.5-flash` podle provider evalu kvality, tool callů, ceny a dostupnosti;
- nástroje pro bezpečné čtení, hledání, cílenou změnu souboru a spuštění omezeného příkazu či testu;
- orchestrace alespoň jednoho vícekrokového tool-calling cyklu;
- event log zobrazující volání nástrojů, oprávnění a výsledek;
- řízený režim s explicitním schválením shell příkazu a přístupu mimo běžnou bezpečnou hranici;
- diff změn a souhrn ověření;
- návrat agentní změny;
- detekce Git/non-Git a odpovídající bezpečný mechanismus obnovy;
- oddělené child procesy pro shellové příkazy, timeout, zachycení stdout/stderr/exit code a řízené ukončení podporovaného procesního stromu;
- TypeScript profil schopný rozpoznat projekt, najít definici a reference symbolu, vrátit typy, diagnostiku a vazby importů/exportů;
- progresivní repo mapa s rychlým základem, cíleným prohlubováním a ručně spuštěnou hlubší inicializací projektu;
- jedno stabilní pracovní rozložení s jednotnými komponentami, čitelným chatem, aktivitou, oprávněními, diffem, výsledky testů a základními loading/error/empty stavy;
- chat composer s víceřádkovým vstupem a `@` referencemi na soubory a složky otevřeného projektu;
- strukturovaná upřesňující otázka agenta s důvodem, volbami, vlastní odpovědí a bezpečným pokračováním stejné relace;
- kompaktní lokální Git workspace se stavem repozitáře, staged/unstaged soubory, diffem, historií commitů, branchemi a vytvořením commitu;
- povinná ochrana každého zápisu očekávaným hashem nebo revizí, monotónní `workspaceRevision`, invalidace zastaralého ověření a serializace konfliktních stavových operací;
- `.codrynignore` pro bezpečné automatické crawlování, hledání, TypeScript indexování, repo mapu a sestavování kontextu;
- dva vestavěné pracovní postupy v interním registru: nejméně jeden planning nebo brainstorming skill a jeden ověřovací workflow;
- předem připravená živá a záložní demonstrace stejné hodnoty.

**Důležitý, ale škrtatelný rozsah S/O1:** `fetch`, `pull` a `push`; import a bezpečný náhled cizího lokálního manifestu; automatický `taskSummary`, koordinační snapshot a vyhodnocování překryvu relací; viditelný strom a skutečné paralelní řízení subagentů; offline experiment E0; ruční nahrání obrázku a jednoduchá kreslená anotace. Nesplněný prvek S/O1 neblokuje první obhajobu. Vzdálené Git operace, lokální import manifestu a plná koordinace relací se stávají povinnými nejpozději v ŠF; E0 ani canvas v rozsahu S/O1 nejsou podmínkou dokončení O1.

**Může být z O1 přesunuto bez porušení hlavního cíle:** plná autentizace, cloudová synchronizace, druhý reálný modelový adapter, vizuální graf větví, Playwright vision-check, Auto režim s klasifikátorem, online marketplace, tři výchozí pracovní plochy, přesouvání panelů, finální vizuální identita a kompletní accessibility pass. Z O1 nelze přesunout bezpečnostní kontrolu lokálních Git operací, expected-hash/revision ochranu zápisů ani pravdivou invalidaci zastaralého ověření.

### 7.2 Finální školní verze (ŠF)

Finální školní verze rozšiřuje funkční jádro a současně zvyšuje kvalitu desktopového produktu.

**Závazný rozsah ŠF:**

- instalovatelný a stabilní Windows 11 desktopový produkt;
- onboarding a tři rozhodnuté výchozí pracovní plochy;
- přesouvatelné, skrývatelné a obnovitelné panely;
- domovská obrazovka, projekty, projektové chaty a nepřiřazené chaty;
- lokální perzistence, obnova podporovaných stavů po pádu a trvalá nastavení;
- přemapovatelné klávesové zkratky, světlé/tmavé schéma, klávesová navigace, viditelný focus a reduced motion;
- dva reálné modelové adaptéry pro odlišné API formáty; konkrétní modely se volí podle aktuálního provider evalu a případná náhrada musí splnit stejný účel ověření přenositelnosti;
- řízený režim a bezpečně vymezený Auto režim;
- pravidla automatického schválení a zamítnutí příkazů;
- Git i non-Git životní cyklus změn;
- explicitní vzdálené Git operace `fetch`, `pull` a `push` prostřednictvím nainstalovaného Git CLI a systémového credential helperu nebo SSH mechanismu;
- graf větví a historie commitů navazující na kompaktní Git workspace z O1;
- TypeScript capability profil se strukturálními dotazy;
- měřitelný prototyp repo mapy/LLM Wiki;
- účet, přihlášení a odhlášení;
- cloudová synchronizace chatů, zpráv, uživatelských nastavení a základních projektových metadat; zdrojový kód, snapshoty a API klíče zůstávají mimo běžnou synchronizaci;
- multimodální canvas s obrázkem, kresbou a navazujícím textem;
- Playwright screenshot a vision-check aktuální revize jako povinná ověřovací schopnost pro podporované úkoly, jejichž akceptace závisí na vzhledu nebo rozložení UI;
- kurátorovaný katalog, ruční import manifestu, zapnutí/vypnutí a zobrazení oprávnění skillu/pluginu;
- koordinace souběžných relací, automatický upravitelný `taskSummary` a viditelný strom subagentů se stejnou ochranou zápisů jako hlavní relace;
- dokončená testovací, uživatelská a prezentační dokumentace.

### 7.3 Pokračování po škole (PŠ)

- oficiální podpora macOS a Linuxu;
- širší podpora lokálních modelů a runtime detekce jejich schopností;
- model routing podle ceny, latence nebo typu úkolu;
- další jazykové a frameworkové capability profily;
- izolace vybraných procesů v Dockeru nebo jiném sandboxu;
- veřejný či komunitní marketplace;
- instalace z GitHub/URL jako důležité rozšíření S/PŠ, včetně aktualizací, ověření původu, podpisů a reputace zdrojů;
- importéry konfigurací z Codexu, Claude Code, Antigravity a dalších nástrojů;
- dokončení nebo rozšíření handoff snapshotu rozpracovaného stromu mezi zařízeními, pokud nebyl bezpečně dodán jako C/ŠF;
- týmové účty, sdílené politiky a kolaborace;
- plánované asynchronní úlohy, pokročilá paměť a background agenti;
- rozsáhlejší benchmarky nad více reálnými repozitáři.

## 8. Funkční požadavky

Priorita **M** znamená nutnost pro danou etapu, **S** důležitý doplněk dodaný při zvládnutém riziku a **C** volitelné rozšíření. Etapa určuje nejpozdější plánované dodání. Zápis `S / O1; M / ŠF` znamená, že funkce je cílem první obhajoby, ale její nesplnění O1 neblokuje; povinná je nejpozději pro finální školní verzi.

### 8.1 Desktopový základ

| ID | Priorita / etapa | Požadavek |
| --- | --- | --- |
| FR-DESK-01 | M / O1 | Codryn musí být spustitelná desktopová aplikace na podporované instalaci Windows 11. |
| FR-DESK-02 | M / O1 | Privilegované operace se soubory, procesy a tajemstvími musí probíhat mimo React renderer přes úzké validované rozhraní. |
| FR-DESK-03 | M / ŠF | Nastavení, projekty, chaty a rozložení panelů musí přežít běžný restart aplikace. |
| FR-DESK-04 | M / ŠF | Aplikace musí obnovit poslední konzistentní stav podporované agentní relace po pádu nebo restartu a zřetelně označit přerušenou operaci. |
| FR-DESK-05 | M / ŠF | Uživatel musí mít světlé a tmavé barevné schéma, přičemž konkrétní paleta není součástí PRD. |
| FR-DESK-06 | M / ŠF | Kritické ovládací prvky musí být dosažitelné klávesnicí, mít viditelný focus a respektovat omezení animací operačního systému. |
| FR-DESK-07 | M / ŠF | Klávesové zkratky musí být zobrazitelné a přemapovatelné; konflikt dvou zkratek musí být před uložením oznámen. |
| FR-DESK-08 | M / O1 | Chybové a stavové hlášky musí rozlišit alespoň čekání na model, čekání na uživatele, běh nástroje, ověřování, přerušení a selhání. |
| FR-DESK-09 | S / ŠF | Aplikace má poskytovat diagnostický export bez API klíčů, hesel a neupraveného obsahu citlivých souborů. |

### 8.2 Onboarding a pracovní plocha

| ID | Priorita / etapa | Požadavek |
| --- | --- | --- |
| FR-WORK-01 | M / ŠF | Při prvním spuštění musí onboarding provést uživatele základním nastavením, volbou poskytovatele nebo odložením této volby a výběrem výchozí pracovní plochy. |
| FR-WORK-02 | M / ŠF | Uživatel musí zvolit Stavitel (B), Přizpůsobitelný základ (C) nebo Prázdné plátno. |
| FR-WORK-03 | M / ŠF | Panely Chat, Soubory, Aktivita agenta, Diff, Git, Terminál, Náhled a Canvas musí jít přesouvat, skrývat a připínat podle podporovaných pravidel layoutu. |
| FR-WORK-04 | M / ŠF | Prázdné plátno musí zachovat globální horní lištu s výběrem projektu, přidáním panelu a obnovením rozložení. |
| FR-WORK-05 | M / ŠF | Výchozí rozložení musí jít obnovit jednou potvrzenou akcí; obnovení nesmí smazat chaty, změny ani projektová metadata. |
| FR-WORK-06 | S / ŠF | Uživatel může uložit, pojmenovat a znovu aktivovat vlastní profil rozložení. |
| FR-WORK-07 | M / ŠF | Návrat na domov, výběr projektu a obnova výchozího rozložení musí zůstat dosažitelné v každém uživatelském layoutu. |

### 8.2.1 Produktový baseline

| ID | Priorita / etapa | Požadavek |
| --- | --- | --- |
| FR-UX-01 | M / O1 | Každá hlavní asynchronní akce musí mít rozeznatelný stav čekání, úspěchu, prázdného výsledku, chyby a zrušení; UI nesmí po selhání zůstat bez vysvětlení v nekonečném loadingu. |
| FR-UX-02 | M / O1 | Akce, kterou nelze provést, musí být zakázána nebo po pokusu vysvětlit konkrétní podmínku; tiché ignorování vstupu není přijatelné. |
| FR-UX-03 | M / O1 | Dlouhou operaci, jejíž bezpečné zrušení backend podporuje, musí uživatel zastavit z místa, kde vidí její průběh. |
| FR-UX-04 | M / O1 | Destruktivní nebo vzdáleně stavová akce musí před potvrzením ukázat cíl a předpokládaný dopad, pokud jej nelze bezpečně vrátit. |
| FR-UX-05 | M / O1 | Nový drobný UX detail objevený při implementaci lze doplnit bez nové revize PRD pouze tehdy, pokud nemění etapu, bezpečnost, data, externí účinek ani význam akceptačního kritéria; musí být zachycen v oblastním checklistu nebo testu. |
| FR-UX-06 | M / ŠF | Kritické toky musí být ovladatelné klávesnicí a běžné nabídky musí podporovat předvídatelné zavření klávesou Escape a potvrzení klávesou Enter, pokud to není v konfliktu s editací textu. |

### 8.3 Projekty a domovská obrazovka

| ID | Priorita / etapa | Požadavek |
| --- | --- | --- |
| FR-PROJ-01 | M / O1 | Uživatel musí otevřít existující lokální složku jako projekt prostřednictvím systémového dialogu. |
| FR-PROJ-02 | M / ŠF | Uživatel může vytvořit záznam nového projektu a zvolit jeho prázdnou nebo existující lokální složku; Codryn nemusí scaffoldovat aplikační framework. |
| FR-PROJ-03 | M / ŠF | Projekt má vlastní zobrazované jméno, ikonu, barvu a uživatelské označení uložené mimo cizí zdrojový repozitář. |
| FR-PROJ-04 | M / O1 | Codryn musí určit, zda otevřená složka obsahuje Git repozitář, a zobrazit aktivní režim práce. |
| FR-PROJ-05 | M / ŠF | Domovská obrazovka musí zobrazit projektové dlaždice a vstup pro nepřiřazený chat. |
| FR-PROJ-06 | M / ŠF | Po odeslání nepřiřazené zprávy se domovská plocha přepne do soustředěné konverzace bez automatického přístupu k lokálním souborům. |
| FR-PROJ-07 | M / ŠF | Nedostupná nebo přesunutá projektová složka musí být označena; uživatel může cestu znovu přiřadit bez ztráty chatů a metadat. |
| FR-PROJ-08 | S / ŠF | Codryn má rozpoznat TypeScript/Node.js, React a Next.js profil podle konfiguračních souborů a závislostí, aniž by je měnil. |
| FR-PROJ-09 | M / O1 | Všechny relativní cesty požadované agentem musí být před provedením normalizovány a ověřeny vůči povolenému kořeni projektu. |

### 8.4 Chaty a zprávy

| ID | Priorita / etapa | Požadavek |
| --- | --- | --- |
| FR-CHAT-01 | M / O1 | Každý projekt musí obsahovat seznam samostatných chatů, přičemž chat reprezentuje jeden uživatelský úkol nebo související pracovní tok. |
| FR-CHAT-02 | M / O1 | Uživatel může vytvořit, otevřít, přejmenovat a archivovat chat bez smazání projektu. |
| FR-CHAT-03 | M / O1 | Odpověď modelu musí být průběžně zobrazována, pokud adapter streaming podporuje; jinak musí UI zobrazit stav čekání. |
| FR-CHAT-04 | M / O1 | Zpráva musí být časově a identifikátorem svázaná s událostmi, tool cally, změnami a výsledky ověření, které vyvolala. |
| FR-CHAT-05 | M / O1 | Uživatel musí moci běžící relaci zastavit; UI musí odlišit požadavek na zastavení od potvrzeného ukončení procesu. |
| FR-CHAT-06 | M / ŠF | Uživatel může pokračovat v dřívějším chatu a Codryn musí sestavit kontext podle pravidel, ne automaticky odeslat celou historii a repozitář. |
| FR-CHAT-07 | M / ŠF | Chat podporuje textové a obrazové přílohy s náhledem, typem, velikostí a možností odebrání před odesláním. |
| FR-CHAT-08 | M / ŠF | Nepřiřazený chat nesmí číst ani měnit lokální soubory; webové vyhledávání může použít pouze po splnění pravidel oprávnění. |
| FR-CHAT-09 | S / ŠF | Uživatel může exportovat jeden chat do přenositelného čitelného formátu včetně přehledu tool callů, nikoli včetně tajemství. |
| FR-CHAT-10 | M / ŠF | Chybné odeslání, rate limit nebo přerušený stream nesmí vytvořit duplicitní uživatelskou zprávu při bezpečném opakování. |
| FR-CHAT-11 | M / O1 | Composer musí podporovat víceřádkový text, zachovat rozepsaný obsah při běžném přepnutí panelu a zabránit nechtěnému odeslání během IME kompozice. |
| FR-CHAT-12 | M / O1 | Znak `@` musí otevřít vyhledávání souborů a složek uvnitř otevřeného projektu s ovládáním klávesnicí a možností referenci před odesláním odebrat. |
| FR-CHAT-13 | M / O1 | `@` reference musí uchovávat stabilní projektovou cestu a při sestavení kontextu ověřit aktuální existenci a revizi; přejmenovaná, smazaná nebo ignorovaná cesta musí mít viditelný stav. |
| FR-CHAT-14 | M / O1 | `@` reference je explicitní kontextový ukazatel, nikoli příkaz poslat celý obsah modelu; Context Manager musí podle typu, velikosti, oprávnění a `.codrynignore` určit bezpečný výřez a zaznamenat, co skutečně použil. |
| FR-CHAT-15 | M / ŠF | Uživatel musí přidat podporovanou přílohu výběrem souboru, přetažením do composeru nebo vložením obrázku ze schránky. |
| FR-CHAT-16 | M / ŠF | Příloha musí před odesláním zobrazit název, typ, velikost, náhled pokud je bezpečně podporován, stav validace a možnost odebrání. |
| FR-CHAT-17 | M / ŠF | Projektová reference a nahraná příloha musí být v UI i datovém modelu odlišitelné; příloha může existovat mimo projekt, reference nikoli. |
| FR-CHAT-18 | M / ŠF | Při modelu bez potřebné modality musí Codryn odeslání zastavit nebo nabídnout explicitně popsanou transformaci či textovou alternativu; nesmí tvrdit, že model přílohu viděl. |
| FR-CHAT-19 | M / O1 | Agent musí umět položit strukturovanou upřesňující otázku, pokud chybějící uživatelské rozhodnutí může podstatně změnit plán, rozsah nebo výsledek; otázka musí obsahovat stručný důvod, dvě až pět vzájemně odlišitelných možností a možnost vlastní textové odpovědi. |
| FR-CHAT-20 | M / O1 | Nezodpovězená otázka musí být viditelná v chatu i aktivitě a uživatel ji může zodpovědět, odmítnout nebo zrušit relaci; odpověď je trvale svázána s konkrétní otázkou a obnoví stejný běh právě jednou. |
| FR-CHAT-21 | M / O1 | Strukturovaná otázka nesmí nahrazovat PermissionRequest, potvrzení destruktivní akce ani sběr hesla, API klíče či jiného tajemství; operace vyžadující oprávnění musí po odpovědi stále projít permission enginem. |

### 8.5 Orchestrátor a agentní smyčka

| ID | Priorita / etapa | Požadavek |
| --- | --- | --- |
| FR-ORCH-01 | M / O1 | Orchestrátor je jediným zdrojem pravdy pro stav agentní relace a při každém přechodu vytváří trvalou událost. |
| FR-ORCH-02 | M / O1 | Stavový model musí nejméně rozlišit `idle`, `preparing_context`, `waiting_for_model`, `waiting_for_user_input`, `waiting_for_approval`, `executing_tool`, `verifying`, `completed`, `cancelled` a `failed`. |
| FR-ORCH-03 | M / O1 | Orchestrátor musí zpracovat opakovanou smyčku modelová odpověď → validace tool callu → oprávnění → spuštění → strukturovaný výsledek → pokračování modelu. |
| FR-ORCH-04 | M / O1 | Relace musí mít konfigurovatelný limit kroků a musí skončit řízeným stavem, ne nekonečnou smyčkou. |
| FR-ORCH-05 | M / O1 | Neznámý nástroj, neplatné argumenty nebo nepodporovaný typ odpovědi modelu musí být zaznamenány a bezpečně vráceny jako chyba bez spuštění kódu. |
| FR-ORCH-06 | M / O1 | Orchestrátor nesmí označit úkol jako ověřený bez úspěšné události odpovídající kontroly provedené nad aktuální revizí změn. |
| FR-ORCH-07 | M / O1 | Když kontrolu nelze provést, konečný stav musí obsahovat důvod a viditelné označení „neověřeno“ nebo „částečně ověřeno“. |
| FR-ORCH-08 | M / ŠF | Po opětovném připojení rendereru musí orchestrátor poskytnout snapshot stavu a chybějící události bez vytvoření druhé relace. |
| FR-ORCH-09 | M / ŠF | Každý běh musí evidovat použitý adapter, model, čas, počet kroků a dostupné údaje o tokenové spotřebě bez ukládání API klíče. |
| FR-ORCH-10 | S / ŠF | Uživatel může pro relaci nastavit maximální počet kroků a volitelný měkký rozpočtový limit, pokud adapter poskytuje potřebná data. |
| FR-ORCH-11 | M / O1 | Přechod do `waiting_for_user_input`, vznik otázky i přijetí odpovědi musí být trvalé a idempotentní; restart rendereru nesmí otázku ztratit, automaticky zodpovědět ani způsobit dvojí pokračování relace. |

### 8.6 Modelová vrstva

| ID | Priorita / etapa | Požadavek |
| --- | --- | --- |
| FR-LLM-01 | M / O1 | Modelová vrstva musí definovat jednotné interní rozhraní pro zprávy, streaming, tool cally, multimodální vstup, chyby a usage metadata. |
| FR-LLM-02 | M / O1 | Fake adapter musí deterministicky vracet předem připravené zprávy a tool cally bez síťového přístupu. |
| FR-LLM-03 | M / O1 | První reálný adapter musí podporovat autentizaci vlastním klíčem, textový chat, streaming a function calling v rozsahu potřebném pro demonstrační tok. Výběr mezi kandidáty GPT-5.6 Luna a Gemini `gemini-2.5-flash` provede provider eval, nikoli trvale zapsaný předpoklad o ceně. |
| FR-LLM-04 | M / ŠF | Druhý adapter pro odlišný API formát nebo srovnatelný OpenAI-kompatibilní model musí projít stejnou kontraktní sadou základních tool callů. |
| FR-LLM-05 | M / O1 | Uživatel musí zvolit provider a model; UI musí zobrazit, pokud zvolený model nepodporuje potřebnou schopnost. |
| FR-LLM-06 | M / ŠF | API klíč musí být uložen v bezpečném lokálním úložišti operačního systému nebo vyžádán pro relaci; nesmí být uložen v běžné databázi, event logu ani cloudu. |
| FR-LLM-07 | M / ŠF | Uživatel musí klíč otestovat, nahradit a odstranit bez zobrazení celé uložené hodnoty. |
| FR-LLM-08 | M / O1 | Adapter musí normalizovat alespoň autentizační chybu, rate limit, timeout, přerušený stream, neplatný tool call a chybu poskytovatele. |
| FR-LLM-09 | M / ŠF | Nastavení musí srozumitelně upozornit, že zásady zpracování kódu se liší podle poskytovatele a tarifu, zejména u bezplatných režimů. |
| FR-LLM-10 | C / PŠ | Lokální model může být připojen adaptérem, pokud deklaruje potřebné schopnosti a endpoint. |
| FR-LLM-11 | M / O1 | Adapter musí před voláním deklarovat capability profil nejméně pro streaming, tool calling, structured outputs, obrazový vstup, usage metadata, kontextový limit a podporovaný způsob kompakce; neznámá schopnost se nesmí považovat za dostupnou. |
| FR-LLM-12 | M / O1 | Provider eval musí na stejné fixture měřit úspěšnost tool callů, platnost strukturovaných argumentů, dokončení změny, schopnost opravy po chybě, latenci a odhadovanou cenu celého úkolu včetně reasoning nebo thinking tokenů. |
| FR-LLM-13 | M / O1 | Nastavení bezplatného režimu, u něhož poskytovatel deklaruje možné využití obsahu ke zlepšování produktů, musí před prvním odesláním projektového obsahu zobrazit jasné upozornění a vyžádat vědomé potvrzení. |

### 8.7 Registry nástrojů a execution harness

| ID | Priorita / etapa | Požadavek |
| --- | --- | --- |
| FR-TOOL-01 | M / O1 | Každý nástroj musí mít stabilní identifikátor, verzi, popis, vstupní schéma, výstupní schéma, deklaraci rizika a konkrétní implementaci. |
| FR-TOOL-02 | M / O1 | Registry nástrojů musí být logicky oddělený od harnessu, který validuje, autorizuje a spouští implementaci. |
| FR-TOOL-03 | M / O1 | Vstup tool callu musí být validován před rozhodnutím o spuštění; neplatný vstup se nesmí automaticky opravovat způsobem měnícím význam. |
| FR-TOOL-04 | M / O1 | Harness musí pro každé volání zaznamenat čas zahájení a ukončení, výsledek oprávnění, status, zkrácený bezpečný výstup a případnou chybu. |
| FR-TOOL-05 | M / O1 | Příkaz musí běžet v odděleném child procesu, v explicitně určeném pracovním adresáři, s timeoutem a zachyceným stdout, stderr a exit code. |
| FR-TOOL-06 | M / O1 | Uživatel musí vidět přesný příkaz a pracovní adresář před ručním schválením. |
| FR-TOOL-07 | M / O1 | Nástroj pro čtení souboru musí odmítnout cestu mimo povolený kořen a respektovat limit velikosti výstupu. |
| FR-TOOL-08 | M / O1 | Nástroj pro hledání musí podporovat omezení cesty, počtu výsledků a velikosti jednotlivého výsledku. |
| FR-TOOL-09 | M / O1 | Nástroj pro editaci musí používat cílenou změnu nebo patch s kontrolou očekávaného původního obsahu; při nesouladu nesmí soubor slepě přepsat. |
| FR-TOOL-10 | M / O1 | Běžící proces musí jít zrušit a po timeoutu musí Codryn pomocí Windows Job Objectu nebo ověřeného ekvivalentu ukončit podporovaný strom potomků nebo zřetelně hlásit proces, který ukončit nedokázal. |
| FR-TOOL-11 | M / ŠF | Velký výstup nástroje musí být bezpečně zkrácen pro model, zatímco uživatel může otevřít lokální diagnostický detail v rámci retenčních pravidel. |
| FR-TOOL-12 | M / ŠF | Schéma a výsledek lokálního nástroje musí používat stejný normalizovaný formát jako nástroj připojený přes MCP, i když lokální nástroje nejsou samostatné MCP servery. |
| FR-TOOL-13 | S / ŠF | Silnější Windows execution sandbox pro shell musí být zařazen pouze tehdy, pokud technický experiment prokáže spolehlivé omezení souborů a sítě bez rozbití běžných Node.js/TypeScript nástrojů; jinak musí být limit transparentně zdokumentován. |

### 8.8 Oprávnění a míra autonomie

| ID | Priorita / etapa | Požadavek |
| --- | --- | --- |
| FR-PERM-01 | M / O1 | Výchozím režimem nového uživatele musí být Řízený režim. |
| FR-PERM-02 | M / O1 | Řízený režim musí vyžádat souhlas alespoň pro shell příkaz, webové vyhledávání a požadavek na práci mimo kořen otevřeného projektu. |
| FR-PERM-03 | M / O1 | Požadavek na schválení musí zobrazit nástroj, vstup, pracovní adresář, důvod, odhadovaný dopad a nabízet jednorázové povolení nebo zamítnutí. |
| FR-PERM-04 | M / ŠF | Uživatel může definovat pravidla automatického schválení a automatického zamítnutí příkazů s omezením podle prefixu a projektu. |
| FR-PERM-05 | M / ŠF | Auto režim musí každou akci, kterou jednoznačně nevyřeší pevná politika, předat lehkému vyměnitelnému AI klasifikátoru; při nejistotě musí přejít k uživatelskému schválení. |
| FR-PERM-06 | M / ŠF | Pevná pravidla zamítnutí, zákaz přístupu k tajemstvím a bezpečnostní hranice musí mít přednost před klasifikátorem i instrukcí modelu. |
| FR-PERM-07 | M / O1 | Každé ruční i automatické rozhodnutí musí být v historii s výsledkem, zdrojem pravidla a srozumitelným důvodem. |
| FR-PERM-08 | M / ŠF | Čekající schválení musí přežít restart rendereru; po restartu nesmí být akce automaticky schválena ani spuštěna podruhé. |
| FR-PERM-09 | M / ŠF | Uživatel musí mít možnost pro projekt dočasně přepnout režim a jasně vidět, který režim je aktivní. |
| FR-PERM-10 | M / ŠF | Změna pravidla oprávnění se uplatní nejpozději před dalším tool callem a musí být auditovatelná. |

### 8.9 Životní cyklus změn, diff a návrat

| ID | Priorita / etapa | Požadavek |
| --- | --- | --- |
| FR-CHG-01 | M / O1 | Před první agentní změnou musí Codryn vytvořit obnovovací bod pro dotčený obsah nebo ověřit použitelný Git základ. |
| FR-CHG-02 | M / O1 | Zápisy uvnitř povoleného projektu nemusí vyžadovat potvrzení každého souboru, pokud odpovídají aktivnímu režimu oprávnění. |
| FR-CHG-03 | M / O1 | Každá úspěšná změna musí vytvořit záznam s chatem, tool callem, cestou, časem a odkazem na obnovovací data. |
| FR-CHG-04 | M / O1 | Uživatel musí během relace otevřít aktuální diff a po dokončení dostat souhrnný diff všech změn agenta. |
| FR-CHG-05 | M / O1 | Uživatel musí vrátit jednotlivou agentní změnu nebo všechny agentní změny relace, pokud tím nejsou přepsány novější ruční změny. |
| FR-CHG-06 | M / O1 | Při změně souboru od vytvoření obnovovacího bodu musí Codryn detekovat konflikt a vyžádat řešení místo slepého přepsání. |
| FR-CHG-07 | M / ŠF | Konečný souhrn musí rozlišit změněné, vytvořené, smazané a konfliktní soubory. |
| FR-CHG-08 | M / O1 | Výsledek ověření musí být svázán s otiskem nebo revizí testovaného pracovního stavu, aby pozdější změna nezůstala chybně označena jako ověřená. |
| FR-CHG-09 | S / ŠF | Uživatel může přijmout výsledek relace jako zkontrolovaný stav; tato akce sama o sobě nemusí vytvářet Git commit. |

### 8.10 Git a non-Git režim

| ID | Priorita / etapa | Požadavek |
| --- | --- | --- |
| FR-VCS-01 | M / O1 | Při otevření projektu musí Codryn detekovat, zda je kořen uvnitř Git worktree, a uložit výsledek k relaci. |
| FR-VCS-02 | M / O1 | V Git režimu musí Codryn před prací zachytit výchozí commit, branch a stav pracovního stromu. |
| FR-VCS-03 | M / O1 | Existující necommitnuté změny uživatele musí být od agentních změn v UI rozlišitelné a nesmí být automaticky odstraněny. |
| FR-VCS-04 | M / O1 | V non-Git režimu musí Codryn vytvořit vlastní obsahový snapshot dotčených souborů a umožnit obnovu. |
| FR-VCS-05 | M / O1 | Základní schopnost číst, měnit, ověřit a vrátit změnu musí fungovat v obou režimech. |
| FR-VCS-06 | M / O1 | Operace vytvoření branche nebo commitu musí být explicitní uživatelská akce nebo samostatně povolený nástroj; nejsou automatickou podmínkou dokončení chatu. |
| FR-VCS-07 | M / O1 | Při detached HEAD, konfliktu nebo nedostupném Git programu musí aplikace přejít na bezpečně omezené chování a vysvětlit dopad. |
| FR-VCS-08 | C / ŠF | Handoff snapshot může při dostatečné rezervě spojit identitu chatu, remote, výchozí commit, testovací stav a uživatelem zkontrolovaný patch bez ignorovaných tajemství; jinak přechází do PŠ. |
| FR-VCS-09 | M / O1 | Git panel musí zobrazit aktuální branch, upstream, HEAD, stav pracovního stromu a počty commitů ahead/behind, pokud je lze určit bez změny repozitáře. |
| FR-VCS-10 | M / O1 | Git panel musí rozlišit nové, změněné, smazané, přejmenované, konfliktní, staged a unstaged soubory a umožnit otevřít jejich diff. |
| FR-VCS-11 | M / O1 | Uživatel musí stage nebo unstage celý soubor; před operací musí backend znovu načíst Git stav a odmítnout akci založenou na neaktuálním snapshotu. |
| FR-VCS-12 | M / O1 | Historie musí zobrazit nejméně hash, zprávu, autora, čas, rodiče a reference posledních commitů a umožnit otevřít detail změněných souborů. |
| FR-VCS-13 | M / O1 | Commit musí vzniknout pouze po explicitní akci uživatele nad právě zobrazeným staged obsahem; prázdný commit není součástí běžného toku. |
| FR-VCS-14 | M / O1 | AI návrh commit message musí vycházet pouze ze staged diffu a dostupných projektových konvencí, být označen jako návrh a zůstat před commitem upravitelný. |
| FR-VCS-15 | S / O1; M / ŠF | Uživatel musí explicitně spustit `fetch`, `pull` nebo `push`; UI musí před spuštěním zobrazit remote, branch a známý ahead/behind stav. |
| FR-VCS-16 | M / O1 | Před přepnutím branche nebo jinou lokální operací měnící worktree musí Codryn znovu zkontrolovat necommitnuté a aktivní agentní změny a při riziku ztráty nebo konfliktu operaci zastavit s vysvětlením. Stejný preflight platí pro `pull`, jakmile je vzdálený tok dostupný. |
| FR-VCS-17 | S / O1; M / ŠF | Pull nesmí automaticky zvolit neznámou merge/rebase strategii; použije jednoznačně zjištěnou projektovou či Git konfiguraci, nebo si vyžádá uživatelskou volbu. |
| FR-VCS-18 | S / O1; M / ŠF | Push musí bezpečně odmítnout non-fast-forward stav a běžný tok nesmí nabízet automatický force push. |
| FR-VCS-19 | S / O1; M / ŠF | Vzdálené Git operace musí běžet přes nainstalovaný Git CLI a ponechat autentizaci nakonfigurovanému systémovému credential helperu nebo SSH mechanismu. Codryn nesmí vyžadovat, číst ani ukládat heslo, token či privátní klíč do databáze, event logu nebo modelového kontextu; nepodporovaný interaktivní prompt skončí bezpečnou autentizační chybou s návodem dokončit přihlášení mimo agentní relaci. |
| FR-VCS-20 | M / O1 | Stavové Git operace nad stejným worktree nebo sdílenou referencí musí být serializovány podle konkrétního zdroje a zapsány do auditního event logu. |
| FR-VCS-21 | M / O1 | Po externí změně Gitu musí panel stav znovu načíst; starý snapshot se nesmí použít jako důkaz pro zápis nebo vzdálenou operaci. |
| FR-VCS-22 | M / ŠF | Historie musí nabídnout čitelný graf lokálních a známých remote větví, merge commitů a HEAD bez příslibu plné náhrady specializovaného Git klienta. |
| FR-VCS-23 | S / ŠF | Stage po huncích může být dodán pouze po stabilizaci stage/unstage celých souborů a nesmí porušit ochranu externích změn indexu. |

### 8.11 Terminál, náhled a ověřovací smyčka

| ID | Priorita / etapa | Požadavek |
| --- | --- | --- |
| FR-TERM-01 | M / O1 | Codryn musí zobrazit příkaz spuštěný agentem, jeho pracovní adresář, průběžný výstup, exit code a délku běhu. |
| FR-TERM-02 | M / ŠF | Integrovaný terminál musí umožnit uživatelskou relaci oddělenou od jednotlivých agentních tool callů, aby se jejich výstupy a oprávnění nemísily. |
| FR-TERM-03 | M / ŠF | Uživatel může pro projekt definovat pojmenovaný příkaz rychlého spuštění a před prvním použitím vidí jeho přesné znění. |
| FR-TERM-04 | M / O1 | Pro rozpoznaný TypeScript projekt musí Codryn nabídnout nebo odvodit relevantní kontrolu typů a testovací příkaz, ale nesmí bez potvrzení instalovat chybějící závislosti. |
| FR-TERM-05 | M / O1 | Neúspěšná kontrola se musí vrátit orchestrátoru jako strukturovaný výsledek a může vyvolat další opravnou iteraci v mezích limitu kroků. |
| FR-TERM-06 | M / O1 | Úspěšný exit code nesmí být jediným důkazem kvality, pokud příkaz nebyl relevantní k provedené změně; konečný souhrn musí uvést přesně spuštěné kontroly. |
| FR-TERM-07 | M / ŠF | Panel Náhled musí zobrazit uživatelem spuštěnou podporovanou webovou aplikaci nebo srozumitelnou instrukci, proč náhled není dostupný. |
| FR-TERM-08 | M / ŠF | Codryn musí pomocí Playwrightu otevřít nakonfigurovanou lokální URL, pořídit screenshot a připojit metadata viewportu, času, zdrojové relace a aktuální workspace revize. |
| FR-TERM-09 | M / ŠF | U podporovaného úkolu, jehož akceptace závisí na vzhledu nebo rozložení vykresleného UI, musí dokončovací politika spustit Playwright vision-check podle explicitního pracovního postupu; kontrola se nespouští automaticky po každé změně nesouvisející s vizuálním výsledkem. |
| FR-TERM-10 | M / ŠF | Stav „vizuálně ověřeno“ smí vzniknout pouze z vision-checku nad screenshotem aktuální relevantní revize a musí evidovat porovnávaný uživatelský záměr, viewport, výsledek a známá omezení; starší screenshot se po relevantní změně označí jako stale. |
| FR-TERM-11 | M / ŠF | Zjištěný vizuální nesoulad se musí vrátit orchestrátoru jako strukturovaný výsledek a může vyvolat opravnou iteraci v mezích limitu kroků. Pokud preview, Playwright nebo obrazová capability nejsou dostupné, výsledek musí být viditelně označen „vizuálně neověřeno“ a nesmí být vydáván za úspěšně vizuálně zkontrolovaný. |

### 8.12 TypeScript capability profil

| ID | Priorita / etapa | Požadavek |
| --- | --- | --- |
| FR-TS-01 | M / O1 | Profil musí rozpoznat TypeScript/Node.js a podporovaný React/Next.js projekt, načíst jeho relevantní konfiguraci a označit úroveň podpory. |
| FR-TS-02 | M / O1 | TypeScript profil musí najít deklaraci symbolu podle názvu a umístění a vrátit cestu, rozsah a stručný druh symbolu. |
| FR-TS-03 | M / O1 | Profil musí umět vrátit exporty souboru, signaturu funkce nebo metody a nalezené reference v omezeném strukturovaném JSON výstupu. |
| FR-TS-04 | M / O1 | Strukturální dotaz musí respektovat `tsconfig.json`, pokud je dostupný, a jasně označit fallback při neúplném nebo neplatném projektu. |
| FR-TS-05 | M / O1 | Profil musí umět vrátit základní typovou informaci, diagnostiku a vazby importů/exportů potřebné pro cílený dotaz. |
| FR-TS-06 | M / O1 | Model nesmí dostat celý serializovaný AST; nástroj vrací pouze data potřebná pro konkrétní dotaz s limitem výsledků. |
| FR-TS-07 | M / O1 | Při selhání `ts-morph` nebo Compiler API musí zůstat dostupné běžné čtení a textové hledání. |
| FR-TS-08 | M / O1 | Výsledky strukturálních dotazů musí být invalidovány po změně relevantních souborů nebo konfigurace projektu. |
| FR-TS-09 | M / ŠF | Přínos strukturálního nástroje musí být změřen na sadě nejméně 20 dotazů proti ručně ověřenému očekávání. |
| FR-TS-10 | C / PŠ | LSP nebo TypeScript language server může doplnit Compiler API, pokud prokáže přesnější reference či typy bez nepřijatelné provozní složitosti. |

### 8.13 LLM Wiki, repo mapa a správa kontextu

| ID | Priorita / etapa | Požadavek |
| --- | --- | --- |
| FR-CTX-01 | M / O1 | Orchestrátor musí sestavit kontext z uživatelské zprávy, relevantní historie, pravidel projektu a explicitně získaných výsledků nástrojů. |
| FR-CTX-02 | M / O1 | Do modelu se nesmí automaticky posílat celý repozitář bez velikostního limitu a vysvětlitelného důvodu. |
| FR-CTX-03 | M / O1 | Po otevření projektu musí Codryn vytvořit rychlý deterministický základ repo mapy a následně progresivně prohlubovat pouze části relevantní pro aktuální úkol. |
| FR-CTX-04 | M / O1 | Repo mapa musí uchovávat nejméně cestu, druh souboru, hlavní exporty nebo symboly, stručnou roli a vazbu na aktuální obsahovou revizi. |
| FR-CTX-05 | M / O1 | Změna souboru musí označit jeho odvozené shrnutí a závislé části mapy jako zastaralé nejpozději před dalším sestavením kontextu. |
| FR-CTX-06 | M / O1 | Uživatel musí mít příkaz nebo rovnocennou akci podobnou `/init`, která na vyžádání provede hlubší inicializaci struktury, konfigurace, symbolů, vazeb a projektových instrukcí. |
| FR-CTX-07 | M / ŠF | Uživatel musí vidět alespoň stručný přehled, jaké zdroje kontextu byly pro požadavek vybrány. |
| FR-CTX-08 | M / ŠF | Projektová pravidla s vyšší autoritou musí být oddělena od modelově generovaných shrnutí, aby shrnutí nemohlo pravidla přepsat. |
| FR-CTX-09 | M / ŠF | Prototyp LLM Wiki musí být porovnán s baseline bez wiki na stejné sadě úloh podle tokenů, počtu kroků a věcné úspěšnosti. |
| FR-CTX-10 | S / ŠF | Staré části konverzace mohou být zkomprimovány do pracovní paměti, ale původní lokální historie musí zůstat dohledatelná pro uživatele. |
| FR-CTX-11 | C / PŠ | Provider-native context caching může být využito adaptérem, nesmí však být podmínkou správného chování orchestrace. |
| FR-CTX-12 | M / O1 | Kořenový `.codrynignore` musí používat zdokumentovanou podmnožinu `.gitignore`-like syntaxe a Codryn musí hlásit neplatné pravidlo s řádkem a důvodem místo tichého odlišného výkladu. |
| FR-CTX-13 | M / O1 | I bez `.codrynignore` musí výchozí politika vyloučit z automatického crawlování a kontextu nejméně `.git`, `node_modules`, běžné build/cache výstupy, velké binární soubory, `.env` varianty a známé credential nebo privátní klíče. |
| FR-CTX-14 | M / O1 | Sloučená výchozí politika a `.codrynignore` musí jednotně platit pro automatický crawl, textové hledání, TypeScript indexování, repo mapu, hlubší inicializaci a sestavování modelového kontextu; `.gitignore` je pouze doplňkový signál, ne bezpečnostní náhrada. |
| FR-CTX-15 | M / O1 | Ignorovaná cesta musí mít viditelný důvod a její obsah se nesmí bez vysvětlení načíst, indexovat ani poslat modelu. |
| FR-CTX-16 | M / O1 | U běžné ignorované cesty může uživatel povolit konkrétní soubor pro konkrétní akci. Známé tajemství vyžaduje zvláštní upozornění a výjimka se nesmí změnit v trvalé automatické povolení ani se rozšířit na celou složku. |
| FR-CTX-17 | M / O1 | Změna `.codrynignore` nebo výchozí ochranné politiky musí před dalším použitím invalidovat dotčený index, repo mapu a odvozený kontext. |

### 8.14 Multimodální canvas

| ID | Priorita / etapa | Požadavek |
| --- | --- | --- |
| FR-CAN-01 | S / O1 | Uživatel může ručně nahrát podporovaný rastrový obrázek a otevřít jej na jednoduchém plátně. |
| FR-CAN-02 | S / O1 | Uživatel může nad obrázkem kreslit volnou čáru, vymazat poslední tah a před odesláním anotaci vyčistit. |
| FR-CAN-03 | S / O1 | Text, původní obrázek a kreslená anotace musí být odeslány jako jeden logicky svázaný požadavek adapteru, který multimodalitu podporuje. |
| FR-CAN-04 | M / ŠF | Canvas musí podporovat kreslení nad uživatelským obrázkem i nad obrázkem vloženým do chatu agentem. |
| FR-CAN-05 | M / ŠF | Datový záznam musí zachovat identitu původního obrázku, samostatnou vrstvu anotace, výsledný náhled a navazující text. |
| FR-CAN-06 | M / ŠF | Pokud zvolený model nepodporuje obrazový vstup, Codryn musí odeslání zastavit nebo nabídnout jasně označenou textovou alternativu; nesmí předstírat, že model obrázek viděl. |
| FR-CAN-07 | M / ŠF | Uživatel může před odesláním skrýt či odebrat původní obrázek i anotaci a vidí, co bude poskytovateli odesláno. |
| FR-CAN-08 | M / ŠF | Canvas nesmí komunikovat příslib pixelově přesného sketch-to-code; jeho účelem je upřesnění rozložení, umístění nebo zamýšlené úpravy. |
| FR-CAN-09 | S / ŠF | Screenshot vytvořený Playwrightem lze otevřít na canvasu, anotovat a poslat v navazujícím požadavku. |
| FR-CAN-10 | M / ŠF | Limity typu a velikosti obrázku musí být ověřeny před uložením a odesláním; nepodporovaný soubor musí být odmítnut s konkrétním důvodem. |

### 8.15 Skills, MCP a pluginy

Pro Codryn platí následující pracovní terminologie:

- **Nástroj** je atomická schopnost s definovaným vstupem, výstupem a implementací.
- **Harness** je prostředí, které nástroj validuje, autorizuje, spouští a sleduje.
- **Skill** je popsaný pracovní postup nebo sada instrukcí, která může využívat nástroje.
- **MCP server** je externí poskytovatel nástrojů nebo dalších schopností přes standard MCP.
- **Plugin** je instalovatelný balíček s manifestem, který může sdružovat skilly, konfiguraci nebo napojení nástrojů.

| ID | Priorita / etapa | Požadavek |
| --- | --- | --- |
| FR-EXT-01 | M / O1 | Codryn musí mít registry vestavěných skillů a pluginových manifestů se jménem, verzí, popisem, schopnostmi a požadovanými oprávněními. |
| FR-EXT-02 | M / O1 | Lokální kurátorovaný katalog musí obsahovat alespoň jeden plánovací nebo brainstorming skill a jeden ověřovací workflow. |
| FR-EXT-03 | S / O1; M / ŠF | Uživatel může vybrat lokální soubor nebo složku s podporovaným manifestem a před aktivací vidí normalizovaný náhled jeho obsahu. |
| FR-EXT-04 | S / O1; M / ŠF | Import nesmí automaticky spustit příkaz, instalovat závislost ani aktivovat síťový endpoint. |
| FR-EXT-05 | M / ŠF | Uživatel může rozšíření zapnout, vypnout a odstranit z konfigurace bez smazání cizího zdrojového repozitáře. |
| FR-EXT-06 | M / ŠF | MCP klient musí podporovat zvolený minimální transport a životní cyklus spojení, načíst schémata nástrojů a převést jejich výsledky do interního formátu. |
| FR-EXT-07 | M / ŠF | Před prvním připojením MCP serveru musí Codryn zobrazit příkaz nebo URL, proměnné bez hodnot tajemství a požadované schopnosti. |
| FR-EXT-08 | M / ŠF | Nástroj z MCP musí projít stejným rozhodováním o oprávnění a auditním logem jako vestavěný nástroj, pokud jeho deklarovaná operace zasahuje chráněný zdroj. |
| FR-EXT-09 | M / ŠF | Neplatný manifest, kolize identifikátoru, nekompatibilní verze a pád MCP serveru musí být izolovány a srozumitelně oznámeny. |
| FR-EXT-10 | S / ŠF | Importér MCP konfigurace může načíst podporovaný lokální formát, ale před uložením musí ukázat normalizovanou konfiguraci a vyžádat potvrzení. |
| FR-EXT-11 | S / PŠ | Instalace z GitHubu nebo URL je důležité rozšíření po škole a před spuštěním cizího kódu vyžaduje ověření původu, zobrazení oprávnění a bezpečný aktualizační model. Hodnocení a veřejné publikování zůstávají součástí případného marketplace. |

### 8.16 Účet, cloud a synchronizace

| ID | Priorita / etapa | Požadavek |
| --- | --- | --- |
| FR-ACC-01 | M / ŠF | Uživatel musí mít možnost vytvořit účet nebo se přihlásit podporovanou metodou a následně se bezpečně odhlásit; odmítnutí účtu nesmí zablokovat lokální agentní jádro. |
| FR-ACC-02 | M / ŠF | Supabase je pracovní směr pro autentizaci a relační cloudová data; jeho použití podléhá technickému ověření v Electronu a samostatnému souhlasu s provisionováním. |
| FR-ACC-03 | M / ŠF | Lokální projekt, lokální chat a fake adapter musí zůstat použitelné při nedostupném cloudu; aplikace může účet vyžadovat pro synchronizační funkce, ne pro lokální agentní jádro. |
| FR-ACC-04 | M / ŠF | Uživatelská relace musí být obnovena bezpečným tokenovým mechanismem a odhlášení musí zneplatnit lokální přístup k cloudovým datům. |
| FR-ACC-05 | M / ŠF | Cloudová synchronizace musí zahrnout chaty, zprávy, uživatelská nastavení a základní projektová metadata, nikoli obsah lokálních zdrojových souborů, snapshoty nebo tajemství. |
| FR-ACC-06 | M / ŠF | API klíče poskytovatelů modelů se nesmí synchronizovat do cloudové historie ani ukládat v běžné cloudové tabulce. |
| FR-ACC-07 | M / ŠF | Projektová cloudová metadata nesmí předpokládat, že stejná lokální absolutní cesta existuje na druhém zařízení. |
| FR-ACC-08 | M / ŠF | Synchronizace musí zobrazit alespoň stavy lokální, čeká na odeslání, synchronizováno, offline a konflikt. |
| FR-ACC-09 | M / ŠF | Konflikt podporované entity se nesmí tichým last-write-wins chováním ztratit; musí být deterministicky sloučen nebo předložen uživateli podle typu dat. |
| FR-ACC-10 | M / ŠF | Uživatel musí požádat o export nebo smazání podporovaných cloudových dat a vidět dopad na lokální kopii. |
| FR-ACC-11 | C / ŠF | Pokud po splnění všech povinných quality gates zbude čas, handoff zdrojových změn může být samostatná vědomá akce s diffem, kontrolou klonu, vyloučením ignorovaných/citlivých souborů a bezpečným řešením konfliktu; jinak přechází do PŠ. |

### 8.17 Workspace Intelligence, koordinace a subagenti

Workspace Intelligence je podpůrná vrstva orchestrátoru a harnessu. Udržuje ověřitelný živý stav projektu, deklarované pracovní záměry a malou context projection. Neřídí autonomně celý projekt, nenahrazuje permission engine a nikdy nenahrazuje kontrolu očekávaného hashe nebo revize při zápisu.

| ID | Priorita / etapa | Požadavek |
| --- | --- | --- |
| FR-COORD-01 | M / O1 | Backend musí pro otevřený workspace udržovat monotónní `workspaceRevision`, čas pozorování, Git identitu a zdroj relevantní změny; globální revize nenahrazuje hash konkrétního souboru. |
| FR-COORD-02 | M / O1 | `workspaceRevision` se musí zvýšit při úspěšném zápisu, rozpoznané ruční změně, změně Git HEAD nebo branche a dokončení serializované stavové operace; pouhá chatová zpráva bez dopadu na projekt ji nezvyšuje. |
| FR-COORD-03 | S / O1; M / ŠF | Aktivní relace musí publikovat strukturovaný `WorkIntent` s režimem, krátkým `taskSummary`, očekávanými oblastmi a známými sdílenými zdroji; jde o měkkou deklaraci, nikoli zámek. |
| FR-COORD-04 | S / O1; M / ŠF | `taskSummary` musí vznikat automaticky z aktuálního zadání a plánu, mít nejvýše jednu až dvě věty a být uživatelem viditelné, upravitelné nebo vypnutelné bez sdílení celého chatu. |
| FR-COORD-05 | S / O1; M / ŠF | Relace je pro koordinaci aktivní nejméně ve stavech běhu, čekání na schválení, zápisu, `recently_writing` a `idle_with_changes`; `recently_writing` trvá pět minut od posledního úspěšného zápisu. |
| FR-COORD-06 | S / O1; M / ŠF | Nový nebo pokračující agent musí před plánem dostat malý snapshot relevantních relací se stavem, task summary, očekávanými a změněnými oblastmi a branch/worktree metadaty, nikdy jejich plný chat. |
| FR-COORD-07 | S / O1; M / ŠF | Koordinační politika musí rozlišit nízký, možný a vysoký překryv a dovolit agentovi pokračovat, změnit plán, počkat nebo navrhnout worktree; vytvoření worktree vyžaduje souhlas uživatele. |
| FR-COORD-08 | M / O1 | Každý patch musí nést očekávaný hash nebo revizi podkladu; při neshodě se zápis zastaví, vznikne auditní událost a agent musí nový obsah znovu analyzovat. |
| FR-COORD-09 | M / O1 | Stavové Git operace nad stejným worktree nebo referencí, změny stejného lockfilu/balíčkovací operace a migrace stejné projektové databáze musí používat úzký zámek podle resource key. |
| FR-COORD-10 | M / O1 | Běžné editace různých souborů a spouštění dev serverů se centrálně neserializují; kolize portu je procesní výsledek, nikoli důvod k automatickému zastavení cizího procesu. |
| FR-COORD-11 | S / O1; M / ŠF | Rodičovský agent musí vytvořit subagenta pro omezený úkol, zobrazit jej ve stromu práce a předat mu stejná nebo užší oprávnění. |
| FR-COORD-12 | S / O1; M / ŠF | Subagent smí přímo zapisovat do společného workspace, ale každý jeho zápis podléhá stejnému očekávanému hashi/revizi, auditní provenienci a resource-key serializaci jako zápis hlavní relace. |
| FR-COORD-13 | S / O1; M / ŠF | Provenience subagenta musí obsahovat jeho ID, ID rodičovské relace, tool call a change set; rodič odpovídá za kontrolu a začlenění výsledku. |
| FR-COORD-14 | M / O1 | Verification record musí obsahovat druh kontroly, příkaz nebo nástroj, rozsah, výsledek, čas, zdrojovou relaci a workspace revizi; po relevantní změně se nesmí zobrazovat jako aktuálně platný bez nového posouzení. |
| FR-COORD-15 | M / ŠF | Codryn má evidovat procesy, které sám spustil a spolehlivě sleduje, včetně vlastníka, pracovního adresáře, bezpečně redigovaného příkazu, handle/PID, známého portu a způsobu ukončení. |
| FR-COORD-16 | M / ŠF | Obnovená relace musí dostat rozdílový snapshot mezi poslední známou a aktuální revizí včetně relevantně změněných souborů, Git HEAD a zastaralých ověření. |

### 8.18 Experiment epizodické paměti E0

Experiment ověřuje hypotézu, že dlouhé relace lze rozdělit do auditovatelných pracovních epizod a do aktivního kontextu načítat pouze relevantní výřezy. Výsledkem E0 je report a rozhodnutí; nevzniká tím automaticky povinná produktová funkce.

| ID | Priorita / etapa | Požadavek |
| --- | --- | --- |
| FR-EXP-01 | S / O1 | Pokud se E0 provede, musí použít anonymizované nebo syntetické dlouhé coding relace s ručně označenými relevantními návraty, hranicemi a kanonickou evidencí. |
| FR-EXP-02 | S / O1 | Experiment musí na stejných otázkách porovnat nejméně plnou historii, posuvné okno, lineární kompakci a jednoduché strukturované checkpointy se selektivním dohledáním evidence. |
| FR-EXP-03 | S / O1 | E0 musí měřit správnost odpovědi, retrieval recall/precision, snížení aktivních tokenů, režii latence, detekci zastaralého stavu, kvalitu hranic a možnost opravy chybného checkpointu z originálních událostí. |
| FR-EXP-04 | S / O1 | Paměťová evidence se musí v experimentu považovat za nedůvěryhodná a historická data; tvrzení o aktuálním souboru, Git stavu, schématu nebo testu se ověřuje proti současnému zdroji. |
| FR-EXP-05 | S / O1 | Experimentální report musí uvést i neúspěšné případy, použitý dataset, tokenové počítání, model, konfiguraci a reprodukovatelný postup bez marketingového výběru výsledků. |
| FR-EXP-06 | S / O1 | Přechod k jakékoli produktové variantě vyžaduje, aby checkpointy zachovaly nebo zlepšily správnost, prokazatelně snížily aktivní kontext, zachytily připravené stale reference a zůstaly auditovatelné; jinak se návrh odloží nebo zamítne. |
| FR-EXP-07 | C / PŠ | Produktová epizodická paměť, SQLite FTS5, automatické hranice, modelový reranking nebo embeddings lze zařadit pouze samostatným rozhodnutím po úspěšném E0; nejsou implicitní součástí v1.0 ani školní verze. |

## 9. Uživatelské scénáře

### US-01: První spuštění a základní nastavení

**Aktér:** nový uživatel.  
**Předpoklady:** čistá instalace Windows 11.  
**Hlavní tok:** Uživatel spustí Codryn, projde krátkým vysvětlením lokálního přístupu a BYOK, zvolí Řízený režim a pracovní plochu Stavitel, provider může nastavit nebo krok odložit. Codryn uloží volbu a otevře domovskou obrazovku.  
**Alternativy:** Neplatný API klíč se neuloží jako ověřený. Přeskočení provideru ponechá dostupné lokální UI a fake/demo režim.  
**Výsledek:** při dalším spuštění se onboarding neopakuje, dokud jej uživatel sám neresetuje.

### US-02: Oprava malé chyby v Git projektu

**Aktér:** primární vývojář.  
**Předpoklady:** lokální TypeScript projekt s testem a dostupný první reálný adapter vybraný provider evalem.  
**Hlavní tok:** Uživatel otevře projekt a nový chat, zadá konkrétní chybu. Agent načte relevantní soubory, vyhledá symbol, připraví cílenou změnu, spustí test, při chybě iteruje a zobrazí souhrn. Uživatel otevře diff a výsledek přijme.  
**Alternativy:** Příkaz testu vyžaduje schválení; uživatel jej může zamítnout. Rate limit ukončí běh jako obnovitelnou chybu, ne jako úspěch.  
**Výsledek:** změna je v pracovním stromu, původní uživatelské změny zůstaly zachované a chat obsahuje důkaz ověření.

### US-03: Stejný úkol bez Gitu

**Aktér:** vývojář s obyčejnou složkou.  
**Předpoklady:** projekt není Git worktree.  
**Hlavní tok:** Codryn označí non-Git režim, před editací vytvoří vlastní snapshot, provede a ověří změnu a zobrazí vlastní diff. Uživatel vyvolá návrat celé relace.  
**Výsledek:** obsah testovaných souborů odpovídá výchozímu snapshotu a historie uvádí úspěšnou obnovu.

### US-04: Rizikový příkaz v Řízeném režimu

**Aktér:** vývojář.  
**Předpoklady:** agent požádá o shell příkaz.  
**Hlavní tok:** Codryn zobrazí přesný příkaz, pracovní adresář a důvod. Uživatel jej zamítne. Harness příkaz nespustí, zaznamená zamítnutí a model dostane strukturovanou informaci, aby hledal bezpečnou alternativu.  
**Výsledek:** audit obsahuje rozhodnutí i důvod a na disku nevznikne efekt zamítnutého příkazu.

### US-05: Obnova čekajícího schválení

**Aktér:** vývojář.  
**Předpoklady:** relace čeká na povolení příkazu.  
**Hlavní tok:** Renderer se zavře nebo obnoví. Po opětovném připojení načte stav z orchestrátoru a zobrazí stejný čekající požadavek.  
**Výsledek:** příkaz nebyl spuštěn, nebyl zdvojen a uživatel může stále rozhodnout.

### US-06: Ochrana ruční změny uživatele

**Aktér:** vývojář.  
**Předpoklady:** po agentní změně uživatel ručně upraví stejný soubor.  
**Hlavní tok:** Uživatel požádá o vrácení agentního patchu. Codryn zjistí nesoulad s očekávanou revizí, návrat neprovede automaticky a zobrazí konflikt.  
**Výsledek:** ruční úprava není přepsána a uživatel dostane dostatek informací pro vědomé řešení.

### US-07: Strukturální TypeScript dotaz

**Aktér:** agent v projektovém chatu.  
**Předpoklady:** platný TypeScript projekt.  
**Hlavní tok:** Agent zavolá nástroj pro reference symbolu. Backend přes TypeScript profil vrátí omezený seznam cest, rozsahů a druhů referencí. Agent cíleně načte pouze potřebné okolí.  
**Výsledek:** model neobdržel celý AST ani celý repozitář a výsledek odpovídá ručně ověřené struktuře fixture.

### US-08: Kreslená anotace screenshotu

**Aktér:** vývojář upravující UI.  
**Priorita:** základ S/O1; úplný tok M/ŠF.  
**Předpoklady:** chat obsahuje screenshot nebo uživatel obrázek nahraje.  
**Hlavní tok:** Uživatel otevře obrázek na canvasu, zakroužkuje prvek a textem popíše změnu. Codryn zobrazí náhled payloadu a předá původní obrázek, anotaci a text multimodálnímu adapteru.  
**Výsledek:** odpověď a následné nástroje jsou připojeny ke stejnému požadavku; historie zachovává vztah mezi třemi částmi zadání.

### US-09: Ruční import pluginového manifestu

**Aktér:** power user.  
**Priorita:** S/O1; M/ŠF.  
**Předpoklady:** lokální složka s podporovaným manifestem.  
**Hlavní tok:** Uživatel vybere složku. Codryn manifest pouze načte a zobrazí název, verzi, příkazy, endpointy a oprávnění. Uživatel import zruší nebo potvrdí registraci.  
**Výsledek:** před potvrzením nebyl spuštěn žádný cizí příkaz ani instalace.

### US-10: Nepřiřazený chat

**Aktér:** uživatel na domovské obrazovce.  
**Předpoklady:** není otevřen projekt.  
**Hlavní tok:** Uživatel odešle obecnou otázku. Dlaždice se skryjí a otevře se soustředěný chat. Agent může odpovědět z modelu; pokud žádá web, proběhne oprávnění. Lokální file tooly nejsou nabídnuté nebo jsou odmítnuté.  
**Výsledek:** žádný lokální soubor nebyl čten ani změněn.

### US-11: Přihlášení a synchronizace historie

**Aktér:** přihlášený uživatel na druhém zařízení.  
**Předpoklady:** synchronizace je součástí dosaženého rozsahu ŠF a cloud je dostupný.  
**Hlavní tok:** Uživatel se přihlásí, Codryn načte podporované chaty, nastavení a projektová metadata. Lokální cesta projektu není automaticky považována za platnou; uživatel může projekt znovu přiřadit.  
**Výsledek:** historie je čitelná, API klíč ani zdrojový kód se z cloudu neobjeví.

### US-12: Výpadek API během demonstrace

**Aktér:** prezentující autor.  
**Předpoklady:** live provider je nedostupný.  
**Hlavní tok:** Codryn zobrazí přesnou kategorii chyby a zachová rozpracovaný stav. Autor přepne na předem připravený deterministický scénář se stejnými obrazovkami, tool cally, diffem a testem.  
**Výsledek:** hodnota vlastní implementace je prokazatelná i bez síťové služby a záloha není vydávána za živou odpověď modelu.

### US-13: Explicitní `@` reference na projektový soubor

**Aktér:** vývojář v projektovém chatu.  
**Předpoklady:** otevřený projekt obsahuje podporovaný soubor.  
**Hlavní tok:** Uživatel napíše `@`, vyhledá soubor klávesnicí a vloží referenci do zprávy. Context Manager ověří cestu a revizi, načte pouze relevantní obsah a v aktivitě ukáže použitý zdroj.  
**Alternativy:** Ignorovaný, smazaný, binární nebo nadlimitní soubor je označen a není bez vysvětlení vložen celý.  
**Výsledek:** historie rozlišuje text zprávy, referenci a skutečně použitý výřez kontextu.

### US-14: Commit s AI návrhem zprávy

**Aktér:** vývojář po kontrole změn.  
**Předpoklady:** Git projekt obsahuje staged změny.  
**Hlavní tok:** Uživatel otevře Git panel, zkontroluje staged diff a požádá o návrh commit message. Model dostane pouze staged změny a dostupné konvence. Uživatel návrh upraví a explicitně vytvoří commit.  
**Výsledek:** commit obsahuje přesně zobrazený staged stav a audit odlišuje vygenerování návrhu od samotného commitu.

### US-15: Pull s lokálními změnami

**Aktér:** vývojář.  
**Priorita:** S/O1; M/ŠF.  
**Předpoklady:** branch má upstream a pracovní strom obsahuje lokální nebo agentní změny.  
**Hlavní tok:** Uživatel zvolí Pull. Codryn znovu načte stav a místo automatického zásahu upozorní na možné přepsání nebo konflikt. Operaci nespustí, dokud uživatel změny vědomě nevyřeší.  
**Výsledek:** žádná lokální změna není tiše ztracena a event log obsahuje odmítnutou nebo později provedenou operaci.

### US-16: Odmítnutý non-fast-forward push

**Aktér:** vývojář.  
**Priorita:** S/O1; M/ŠF.  
**Předpoklady:** vzdálená branch obsahuje neintegrované commity.  
**Hlavní tok:** Push skončí normalizovanou non-fast-forward chybou. Codryn aktualizuje ahead/behind stav, nevykoná force push a nabídne bezpečné vysvětlení dalšího kroku.  
**Výsledek:** vzdálená historie nebyla přepsána.

### US-17: Dvě souběžné relace nad jedním worktree

**Aktér:** dvě uživatelské relace.  
**Priorita:** S/O1; M/ŠF pro uživatelskou koordinaci, M/O1 pro odmítnutí stale zápisu.  
**Předpoklady:** obě pracují nad stejným projektem.  
**Hlavní tok:** Nová relace dostane stručný koordinační snapshot, zjistí možný překryv a upraví plán. Při pozdější změně stejného souboru její patch narazí na neaktuální hash a zastaví se před zápisem.  
**Výsledek:** cizí změna není přepsána a agent musí pracovat s aktuálním obsahem.

### US-18: Subagent s konfliktním patchem

**Aktér:** rodičovský agent a jeho subagent.  
**Priorita:** S/O1; M/ŠF.  
**Předpoklady:** subagent připravuje omezenou změnu, jejíž podklad mezitím změnila jiná relace.  
**Hlavní tok:** Subagentův zápis je odmítnut kontrolou očekávané revize. Rodič vidí konflikt, provenienci a stav podúkolu a rozhodne o nové analýze nebo zastavení.  
**Výsledek:** přímý zápis subagenta nepřepsal novější obsah.

### US-19: Zastaralý výsledek ověření

**Aktér:** vývojář pokračující po passing testu.  
**Předpoklady:** po testu se změnil relevantní zdrojový soubor nebo konfigurace.  
**Hlavní tok:** Workspace revision se zvýší a verification record se označí jako zastaralý. Konečný panel již passing test neprezentuje jako důkaz aktuálního stavu bez nového posouzení.  
**Výsledek:** uživatel rozliší historicky úspěšnou kontrolu od aktuálně platného ověření.

### US-20: Offline experiment epizodické paměti

**Aktér:** autor projektu při technickém experimentu.  
**Priorita:** S/O1; experiment není podmínkou O1 ani ŠF.  
**Předpoklady:** existuje anotovaná sada dlouhých syntetických nebo anonymizovaných relací.  
**Hlavní tok:** Stejné návratové otázky se vyhodnotí nad plnou historií, posuvným oknem, kompakcí a checkpointy. Report porovná správnost, tokeny, latenci, stale detekci a selhání.  
**Výsledek:** vznikne reprodukovatelné rozhodnutí pokračovat k jednoduchým checkpointům, experiment upravit, nebo produktovou implementaci odložit.

### US-21: Ignorovaná nebo citlivá cesta v kontextu

**Aktér:** vývojář v projektovém chatu.  
**Předpoklady:** projekt obsahuje `.codrynignore`, běžný ignorovaný soubor a testovací soubor rozpoznaný jako tajemství.  
**Hlavní tok:** Automatický crawl, hledání, TypeScript index a repo mapa obě cesty vynechají a context audit uvede důvod. Uživatel explicitně vybere běžný ignorovaný soubor a jednorázově jej povolí pro konkrétní požadavek. Při pokusu o známé tajemství Codryn zobrazí zvláštní varování a bez vědomého jednorázového rozhodnutí obsah nenačte.  
**Alternativy:** Neplatné pravidlo `.codrynignore` je oznámeno s řádkem a důvodem. Změna pravidel zneplatní dotčená odvozená data před dalším použitím.  
**Výsledek:** automatický kontext neobsahuje ignorovaná nebo citlivá data a případná výjimka je úzká, viditelná a auditovatelná.

### US-22: Agent potřebuje rozhodnutí uživatele

**Aktér:** vývojář v běžící agentní relaci.  
**Priorita:** M/O1.  
**Předpoklady:** zadání připouští více významově odlišných řešení a volbu nelze bezpečně odvodit z projektu.  
**Hlavní tok:** Agent uvede stručný důvod otázky, nabídne dvě až pět možností a vlastní textovou odpověď. Relace přejde do `waiting_for_user_input`. Uživatel odpoví a orchestrátor naváže na stejný běh právě jednou.  
**Alternativy:** Uživatel otázku odmítne nebo relaci zruší. Pokud požadovaná akce vyžaduje oprávnění, následuje samostatný PermissionRequest. Pokus vyžádat tajemství je zablokován a vysvětlen.  
**Výsledek:** agent neuhádl produktové rozhodnutí, odpověď je auditovatelná a bezpečnostní schválení nebylo obcházeno.

### US-23: Vizuální oprava ověřená proti zadání

**Aktér:** vývojář zadávající změnu podporovaného webového UI.  
**Priorita:** M/ŠF.  
**Předpoklady:** projekt má nakonfigurovaný spustitelný preview tok, dostupný Playwright a obrazově schopný adapter.  
**Hlavní tok:** Agent upraví UI, spustí relevantní ne-vizuální kontroly, otevře aktuální lokální URL přes Playwright, pořídí screenshot stanoveného viewportu a vision-check porovná vykreslený výsledek se záměrem uživatele. Nalezený nesoulad se vrátí do opravné smyčky.  
**Alternativy:** Preview, Playwright nebo obrazová capability selže; úkol může skončit pouze s viditelným stavem „vizuálně neověřeno“ a konkrétním důvodem.  
**Výsledek:** vizuální tvrzení je podloženo aktuálním screenshotem a záznamem kontroly, nikoli pouze passing TypeScriptem nebo tvrzením modelu.

## 10. Měřitelná akceptační kritéria

### 10.1 Povinná kritéria první obhajoby

| ID | Kritérium | Způsob důkazu |
| --- | --- | --- |
| AC-O1-01 | Na čistém podporovaném testovacím účtu Windows 11 lze Codryn spustit a otevřít referenční projekt nejvýše do 2 minut od zahájení demonstrace. | Časovaný záznam z generální zkoušky |
| AC-O1-02 | Deterministický agentní scénář provede nejméně dvě čtecí/hledací volání, jednu cílenou změnu a jednu relevantní kontrolu a skončí souhrnným diffem. | E2E test a event log |
| AC-O1-03 | Stejný deterministický scénář uspěje 10krát z 10 bez ruční úpravy stavu mezi běhy. | Automatizovaný report |
| AC-O1-04 | Live scénář se zvoleným prvním reálným adaptérem uspěje nejméně 4krát z 5 při dostupném API; neúspěch se nesmí chybně zobrazit jako ověřené dokončení. | Protokol pěti zkoušek |
| AC-O1-05 | Každý tool call v testovací relaci má událost požadavku, oprávnění, zahájení a výsledku nebo explicitního odmítnutí. | Automatická kontrola event logu |
| AC-O1-06 | Pokus o `..` traversal, absolutní cestu mimo projekt a cestu přes testovací symlink/junction je ve všech bezpečnostních fixture zablokován. | Bezpečnostní test suite |
| AC-O1-07 | Zamítnutý shell příkaz nevytvoří zamýšlený testovací soubor ani proces a rozhodnutí je viditelné v historii. | Integrační test |
| AC-O1-08 | Příkaz překračující timeout je označen jako timeout a ukončení nastane nejpozději 2 sekundy po nastaveném limitu na testovacím stroji. | Integrační test procesu |
| AC-O1-09 | Vrácení agentní změny obnoví shodný hash původního obsahu v Git i non-Git fixture. | Automatický test hashů |
| AC-O1-10 | Ruční změna provedená po agentním patchi vyvolá konflikt a není automaticky přepsána. | Integrační test konfliktu |
| AC-O1-11 | Obnova rendereru ve stavu čekání na oprávnění neprovede ani nezdvojí tool call. | E2E test restartu rendereru |
| AC-O1-12 | Pro každý živý demonstrační krok existuje záložní záznam nebo fake scénář, který dokládá stejnou vlastní funkci. | Checklist demonstrace |
| AC-O1-13 | TypeScript profil na referenčním projektu správně najde vybrané definice, reference, typy a import/export vazby v nejméně 18 z 20 ručně ověřených dotazů. | O1 eval report |
| AC-O1-14 | Progresivní repo mapa vytvoří rychlý základ asynchronně, uživatel během indexace může ovládat hlavní UI, hlubší inicializace je spustitelná samostatnou akcí a změna souboru zneplatní dotčená odvozená data. | Integrační test a časovaný protokol |
| AC-O1-15 | Hlavní pracovní plocha zobrazuje chat, aktivitu, oprávnění, diff a ověřovací výsledek čitelně při rozlišení použitém na projektoru; kritický tok neobsahuje neřešený prázdný ani chybový stav. | UI checklist generální zkoušky |
| AC-O1-16 | Timeout shellového příkazu ukončí ve fixture nejen hlavní proces, ale i podporované potomky; žádný testovací orphan proces nezůstane běžet. | Windows process-runner test |
| AC-O1-17 | `@` nabídka vyhledá soubor i složku, vloženou referenci lze odebrat a změna nebo smazání cíle před odesláním je zachyceno bez použití zastaralého obsahu. | E2E a integrační test composeru |
| AC-O1-18 | Context audit pro referenční zprávu rozliší uživatelský text, projektovou referenci a konkrétní načtený výřez; ignorovaný nebo nadlimitní soubor není bez upozornění odeslán celý. | Kontraktní test Context Manageru |
| AC-O1-19 | Git panel na fixture správně rozliší staged, unstaged, nový, smazaný a konfliktní soubor a otevře diff odpovídající aktuálnímu indexu a worktree. | Git integrační test |
| AC-O1-20 | AI commit message je vygenerována pouze ze staged diffu, zůstane upravitelná a commit po mezitím provedené externí změně indexu je zastaven do nové kontroly. | Git E2E a audit log test |
| AC-O1-22 | Dva souběžné požadavky nebo simulovaní aktéři nemohou současně provést konfliktní stavovou Git operaci nad stejným resource key, zatímco editace různých souborů mohou pokračovat paralelně; test nevyžaduje produktové koordinační UI. | Concurrency integrační test |
| AC-O1-23 | Patch jakéhokoli zapisujícího aktéra založený na neaktuálním hashi je odmítnut před zápisem, zapíše auditní událost a zachová novější obsah beze změny; test nevyžaduje produktově dostupné subagenty. | Concurrency fixture a kontrola hashů |
| AC-O1-24 | Verification record po relevantní změně workspace přestane být zobrazen jako aktuálně platný; nezávislá změna mimo deklarovaný rozsah je vyhodnocena podle zaznamenaných vstupů. | Integrační test invalidace |
| AC-O1-25 | Provider eval porovná kandidáty na stejné sadě a uvede úspěšnost tool callů, opravu po chybě, latenci a cenu celého úkolu; výběr prvního adaptéru je zaznamenán rozhodnutím. | Eval report a decision record |
| AC-O1-27 | Výchozí politika a `.codrynignore` jednotně vynechají připravené ignorované cesty z crawlu, hledání, TypeScript indexu, repo mapy a kontextu; jednorázová výjimka se vztahuje jen na zvolený běžný soubor, tajemství zobrazí zvláštní varování a změna pravidel zneplatní dotčená odvozená data. | Context security suite a audit sestavení kontextu |
| AC-O1-31 | Strukturovaná otázka se zobrazí s důvodem, dvěma až pěti možnostmi a vlastní odpovědí; restart rendereru ji zachová, jedna odpověď obnoví původní relaci právě jednou a následná riziková akce stále vyžádá samostatné oprávnění. | Chat/orchestrator E2E, idempotency a permission test |

### 10.1.1 Cílová kritéria S/O1

Následující kritéria se vyhodnotí pouze pro prvky S/O1, které byly do lednového buildu skutečně zařazeny. Jejich nesplnění samo o sobě neblokuje první obhajobu a nesmí být skryto v traceability matici.

| ID | Kritérium | Způsob důkazu |
| --- | --- | --- |
| AC-O1-21 | Pokud jsou vzdálené Git operace součástí O1 buildu, `fetch`, `pull` a `push` proběhnou proti lokálnímu testovacímu remote; pull s rizikovými lokálními změnami a non-fast-forward push jsou bezpečně zastaveny a force push není dostupný. | Git remote fixture |
| AC-O1-26 | E0 epizodické paměti reprodukovatelně porovná čtyři baseline, zveřejní i selhání a skončí explicitním rozhodnutím bez automatického povýšení návrhu na produktovou funkci. | Experimentální report |
| AC-O1-28 | Pokud je lokální import manifestu součástí O1 buildu, sada platných i neplatných manifestů nespustí před potvrzením žádný cizí příkaz, instalaci ani síťový endpoint a každý vstup skončí konkrétním validačním výsledkem. | Plugin security test |
| AC-O1-29 | Pokud je jednoduchý canvas součástí O1 buildu, originál, kreslená anotace a text jsou před odesláním viditelně svázané a model bez obrazové capability neobdrží požadavek předstírající zpracování obrázku. | Canvas E2E a capability test |
| AC-O1-30 | Pokud je uživatelská koordinace a práce subagentů součástí O1 buildu, aktivní relace zveřejní upravitelný `taskSummary`, nový agent dostane pouze koordinační metadata, subagent je viditelný ve stromu a jeho stale patch je odmítnut stejnou kontrolou jako zápis hlavní relace. | Koordinační E2E a provenance test |

### 10.2 Kritéria finální školní verze

| ID | Kritérium | Způsob důkazu |
| --- | --- | --- |
| AC-SF-01 | Všechny tři výchozí layouty lze aktivovat; z každého lze jednou potvrzenou akcí obnovit výchozí stav bez ztráty dat. | E2E UI test |
| AC-SF-02 | Všechny kritické cesty onboarding → projekt → chat → schválení → diff → návrat jsou ovladatelné klávesnicí a mají viditelný focus. | Manuální audit a automatizované kontroly |
| AC-SF-03 | Oba zvolené reálné adaptéry a fake adapter projdou společnou kontraktní sadou zpráv, streamu, tool callu, capability negotiation a normalizovaných chyb. | Kontraktní test report |
| AC-SF-04 | TypeScript nástroje dosáhnou nejméně 95% shody s ručně ověřeným očekáváním na sadě alespoň 20 dotazů; každý nesoulad je zdokumentován. | Eval report |
| AC-SF-05 | Repo mapa je porovnána s baseline na alespoň 10 stejných úlohách a reportuje tokeny, kroky, latenci a věcný výsledek bez marketingového výběru pouze úspěšných běhů. | Experimentální report |
| AC-SF-06 | Uživatel se může registrovat/přihlásit a odhlásit; po odhlášení nejsou cloudová data dostupná bez nové autentizace. | E2E auth test |
| AC-SF-07 | Žádný API klíč se neobjeví v lokální běžné databázi, cloudové tabulce, event logu ani diagnostickém exportu při automatizovaném secret scan testu. | Bezpečnostní report |
| AC-SF-08 | Při dostupné synchronizaci se podporovaná zpráva objeví na druhém testovacím klientovi do 10 sekund v nejméně 19 z 20 pokusů; při nedostupném cloudu zůstane lokálně zachována. | Integrační sync test |
| AC-SF-09 | Canvas zachová originál, anotaci a text jako tři rozlišitelné, vzájemně svázané části ve 20 z 20 testovaných odeslání. | Datový a E2E test |
| AC-SF-10 | Nepřiřazený chat nemá ve schématu dostupných nástrojů lokální file write a 100 % pokusů o lokální čtení je odmítnuto. | Kontraktní bezpečnostní test |
| AC-SF-11 | Import 10 neplatných nebo rizikových manifestů nespustí žádný cizí příkaz před potvrzením a každý skončí konkrétním validačním výsledkem. | Plugin security test |
| AC-SF-12 | Aplikace dokončí 20 z 20 deterministických end-to-end běhů napříč nejméně čtyřmi scénáři bez nekontrolovaného pádu. | Release candidate report |
| AC-SF-13 | Nejméně pět cílových testujících dokončí základní scénář; medián úspěšnosti je 100 % a medián času i hlavní problémy jsou uvedeny v dokumentaci. | Uživatelský test report |
| AC-SF-14 | Každý požadavek označený M/ŠF má stav splněn, omezeně splněn nebo nesplněn a odkaz na důkaz; žádné omezení není skryto. | Traceability matice |
| AC-SF-15 | Windows sandbox experiment reprodukovatelně doloží povolené a blokované souborové i síťové operace a kompatibilitu s Node.js/npm/Git fixture; podle výsledku je FR-TOOL-13 označen splněn, omezeně splněn nebo přesunut. | Technický experiment a rozhodovací záznam |
| AC-SF-16 | Eval Auto režimu obsahuje nejméně 50 bezpečných, nejasných a rizikových akcí; žádná kritická zakázaná akce není automaticky povolena a všechny nejisté výsledky přecházejí na `ASK`. | Permission security report |
| AC-SF-17 | Graf historie správně zobrazí rodiče, větve, merge commit a HEAD na připravené fixture a zůstane použitelný i pro lineární historii bez remote. | Git graph E2E test |
| AC-SF-18 | Soubor lze přiložit výběrem a přetažením, obrázek vložit ze schránky a nepodporovaný nebo nadlimitní vstup skončí konkrétní chybou před odesláním poskytovateli. | Attachment E2E a security test |
| AC-SF-19 | `fetch`, `pull` a `push` používají Git CLI a systémový credential helper nebo SSH mechanismus bez uložení tajemství; pull s nejasnou strategií, rizikové lokální změny, nepodporovaný credential prompt a non-fast-forward push skončí bezpečně a auditovatelně. | Git remote, credential a secret-scan fixture |
| AC-SF-20 | Dvě souběžné relace zveřejňují pouze koordinační metadata, překryv může změnit plán a subagent je viditelný s užšími oprávněními a úplnou proveniencí; každý stale zápis je odmítnut. | Koordinační a subagentní E2E test |
| AC-SF-21 | Obnovená relace po změně HEAD nebo relevantního souboru zobrazí rozdílový snapshot a nepoužije staré ověření jako aktuální důkaz. | Recovery integrační test |
| AC-SF-22 | Na připraveném webovém fixture vision-check odhalí známý nesoulad vůči zadání, vrátí jej do opravné smyčky a teprve screenshot opravené aktuální revize může získat stav „vizuálně ověřeno“; při nedostupném preview, Playwrightu nebo obrazovém adapteru je výsledek označen „vizuálně neověřeno“. | Playwright E2E, vision fixture a kontrola freshness |

### 10.3 Definice dokončení agentního úkolu

Agentní úkol může skončit stavem `completed`, pouze pokud:

1. neběží žádný jeho nástroj ani nezůstává nezodpovězená otázka či skryté oprávnění;
2. všechny úspěšně provedené změny jsou zapsané v historii;
3. diff odpovídá aktuálnímu pracovnímu stavu;
4. relevantní naplánované kontroly mají výsledek svázaný s aktuální revizí, nebo je úkol viditelně označen jako částečně/neověřený;
5. konečná zpráva obsahuje stručný výsledek, změněné soubory, provedené kontroly a známá omezení;
6. existuje bezpečný obnovovací bod, nebo je uživateli výslovně sděleno, proč jej nebylo možné vytvořit.

## 11. Technický směr a architektura

### 11.1 Pracovní technologický stack

| Vrstva | Pracovní směr | Důvod |
| --- | --- | --- |
| Desktop shell | Electron | Přímé využití TypeScript/Node.js, integrace s lokálními procesy a prioritní Windows distribuce |
| Renderer | React + TypeScript | Komponentní UI a sdílené typy |
| Desktop backend | Electron main proces a oddělené Node.js child/utility procesy; worker threads jen pro vhodné výpočty | Stabilita privilegovaných operací, timeouty a řízení dlouhých tool callů |
| Orchestrace | TypeScript/Node.js | Jednotný stack a vhodné asynchronní API |
| Lokální perzistence | SQLite v režimu WAL, verzované migrace a samostatný datový adresář pro velké soubory | Lokální-first provoz bez databázového serveru, transakce a vztahy mezi chaty, událostmi a změnami |
| Strukturální TypeScript analýza | `ts-morph` nebo TypeScript Compiler API | Dotazy na symboly, typy a reference bez posílání celého AST modelu |
| Git | Spouštění Git CLI přes omezený procesní nástroj nebo vhodnou knihovnu | Práce se skutečným stavem repozitáře |
| Cloud | Supabase | Pracovní volba pro autentizaci, relační data a Row Level Security |
| E2E webové ověření | Playwright | Screenshot a automatizace podporovaného lokálního webového projektu |
| Modely | Provider-neutral kontrakt + dva odlišné reálné adaptéry vybrané podle evalů + fake adapter | BYOK, měřitelný výběr a ověření přenositelnosti |
| Externí nástroje | MCP klient | Standardizované připojení rozšíření |

Electron je potvrzený desktopový základ školní verze. Technické ověření nadále musí včas potvrdit bezpečné IPC, spouštění a rušení procesů, ukládání tajemství a distribuci Windows buildu, ale Tauri již není paralelní plánovanou alternativou.

### 11.2 Logické komponenty

1. **Renderer/UI** přijímá vstup a zobrazuje projekty, chat, aktivitu, diff, terminál, náhled, canvas a schválení. Nemá přímý neomezený přístup k Node.js API.
2. **Desktop application service** zajišťuje lifecycle oken, systémové dialogy, bezpečné IPC a připojení rendereru k backendovému stavu.
3. **Orchestrátor** vlastní relaci, stavový automat, event log, kontext, modelovou komunikaci a pravidla dokončení.
4. **Model adapter registry** převádí interní zprávy a tool schémata do provider-specific formátu a normalizuje odpovědi.
5. **Context manager** vybírá historii, projektová pravidla, repo mapu a výsledky nástrojů v rámci rozpočtu.
6. **Tool registry** eviduje schémata a implementace lokálních i MCP nástrojů.
7. **Permission engine** vyhodnocuje pevná pravidla, projektovou politiku, režim a případný klasifikátor.
8. **Execution harness** validuje vstup, připraví omezené prostředí, spustí nástroj, vynutí timeout a normalizuje výsledek.
9. **Change manager** vytváří obnovovací body, eviduje patch, detekuje konflikt a provádí bezpečný návrat.
10. **Persistence service** ukládá lokální entity, události, migrace a obnovovací metadata.
11. **Sync service** volitelně replikuje podporovaná data účtu a řeší stav offline/konflikt.
12. **Capability profiles** poskytují frameworkově specifické rozpoznání, příkazy a strukturální nástroje.
13. **Workspace Intelligence service** udržuje živá fakta, pracovní záměry, resource-key koordinaci a malé context projections; není druhým orchestrátorem.
14. **Git service** poskytuje jedno čtecí i stavové rozhraní pro Git panel, agenta a koordinátor, takže všechny operace používají stejný snapshot, audit a zámky.
15. **Process registry** eviduje pouze procesy spuštěné a spolehlivě sledované Codrynem; identita procesu se nesmí odvozovat jen z názvu nebo portu.

### 11.3 Referenční datový tok agentního požadavku

1. UI odešle příkaz s jednoznačným ID chatu a požadavku.
2. Orchestrátor zapíše uživatelskou zprávu a přejde do `preparing_context`.
3. Context manager sestaví omezený kontext a zaznamená použité zdroje.
4. Adapter odešle normalizovaný požadavek poskytovateli.
5. Textové části se streamují jako události; tool call se nejprve validuje.
6. Strukturovaná otázka se uloží a relace trvale přejde do `waiting_for_user_input`; odpověď se sváže s otázkou a právě jednou vrátí relaci do přípravy pokračování.
7. Permission engine rozhodne `allow`, `deny` nebo `ask` a zapíše důvod.
8. Při permission výsledku `ask` orchestrátor trvale přejde do `waiting_for_approval`; tento stav je odlišný od otázky na produktové rozhodnutí.
9. Při povolení harness spustí nástroj v určeném pracovním adresáři s limity.
10. Strukturovaný výsledek se uloží a vrátí modelu.
11. Při editaci change manager aktualizuje patch, diff a platnost dřívějších ověření.
12. Smyčka pokračuje do úspěchu, chyby, zrušení nebo limitu kroků.
13. Orchestrátor vyhodnotí definici dokončení a vytvoří konečný souhrn.
14. Před dalším krokem porovná použitou workspace revizi s živým stavem a zneplatní dotčený kontext nebo verification record.

### 11.4 Izolační hranice

- Renderer nesmí přijímat obecný IPC příkaz typu „spusť libovolný kód“.
- Provider adapter nesmí přímo zapisovat do souborů ani spouštět procesy.
- Permission engine musí být volán před harness execution, ne pouze informativně po ní.
- Nástroj nesmí sám rozšířit deklarovaný rozsah oprávnění během běhu.
- Shellový tool call běží mimo Electron main proces; oddělení procesu samo o sobě není bezpečnostní sandbox a nesmí tak být v dokumentaci označováno.
- Procesní runner musí používat Windows Job Object nebo ověřený ekvivalent pro řízení podporovaného stromu potomků.
- Event log je append-oriented; opravy metadat vytvářejí novou událost nebo auditovatelnou změnu.
- Cloud sync nesmí být v kritické cestě lokálního zápisu agentní události.
- Renderer a agent nesmějí volat Git odlišnými obchvatnými implementacemi; stavové operace musí projít Git service a koordinací.
- Workspace Intelligence nesmí samo povolit tool call, změnit soubor ani vydat historický snapshot za aktuální stav.
- Strukturovaná otázka uživateli nesmí nést autorizační význam, nahrazovat `PermissionRequest` ani sloužit ke sběru hesla, API klíče nebo jiného tajemství.
- Context Manager musí oddělit instrukce od nedůvěryhodných dat ze souborů, webu, tool outputů a experimentální paměti.
- Persistence service je jediným vlastníkem obecného SQLite přístupu; ostatní komponenty používají úzké doménové kontrakty.

### 11.5 Stavové automaty a invarianty

#### AgentRun

Povolený hlavní tok je `idle → preparing_context → waiting_for_model → waiting_for_user_input | executing_tool | waiting_for_approval | verifying → preparing_context | waiting_for_model | completed | cancelled | failed`. Odpověď na konkrétní `UserQuestion` smí pokračování spustit právě jednou. Přechod do `completed` je možný jen podle definice dokončení. Zrušení je požadavek, dokud backend nepotvrdí ukončení aktivní operace. Restart rendereru stav nemění; restart backendu může obnovit pouze explicitně podporovaný konzistentní stav.

#### UserQuestion

Otázka prochází stavy `open → answered | refused | cancelled`. Pouze první platná odpověď na otevřenou otázku smí obnovit navázaný `AgentRun`; opakovaný přenos stejné odpovědi je idempotentní a pozdější odlišná odpověď nesmí spustit druhé pokračování. Odpověď poskytuje chybějící produktové rozhodnutí, ale sama nepovoluje tool call, nerozšiřuje oprávnění ani nepřekonává bezpečnostní politiku.

#### ToolCall

Tool call prochází stavy `received → schema_validated → permission_decided → queued → running → succeeded | failed | denied | cancelled | timed_out`. Každý přechod má correlation ID. `denied` nikdy nesmí přejít do `running`; opakování musí mít nové execution ID a vazbu na původní požadavek.

#### PermissionRequest

Požadavek má stavy `pending → allowed_once | allowed_by_rule | denied | expired | cancelled`. Pouze `allowed_once` a `allowed_by_rule` opravňují konkrétní tool call; obecné potvrzení v UI bez shody identity a vstupu není platné.

#### ChangeSet a VerificationRecord

Change set obsahuje základní revizi, seznam změn, provenienci a obnovovací bod. Verification record je platný pouze pro zaznamenaný rozsah a workspace revizi. Relevantní změna jej označí `stale`; historický úspěch se nemaže, ale nesmí se prezentovat jako aktuální důkaz.

#### GitOperation

Stavová operace prochází `prepared → preconditions_checked → waiting_for_lock → running → succeeded | failed | conflicted | cancelled`. Před `running` se znovu ověří worktree, HEAD, branch, remote a podle operace index. Zámek je úzký podle resource key a po pádu nesmí zůstat bez vlastníka trvale aktivní.

### 11.6 Interní kontrakty

Každý doménový příkaz a událost musí nést stabilní typ/verzi, ID požadavku, correlation ID, čas, zdrojovou komponentu a relevantní identity projektu, chatu a běhu. Zápisový příkaz navíc nese očekávanou revizi nebo hash; externě účinný příkaz nese permission decision a idempotency key, pokud lze bezpečné opakování garantovat.

Kontrakty mají následující významové hranice:

- IPC kontrakt vystavuje konkrétní doménové operace, nikdy obecné spuštění kódu;
- provider kontrakt přenáší normalizované zprávy, capability profil, tool cally, stream events, usage a chyby;
- tool kontrakt odděluje validaci argumentů, rozhodnutí oprávnění, execution a bezpečný výsledek;
- Git kontrakt odděluje read-only snapshot od stavové operace a vždy vrací nově pozorovaný stav;
- context kontrakt eviduje autoritu, původ, revizi, tokenový odhad a důvod zahrnutí každého zdroje;
- koordinační kontrakt sdílí metadata a záměry, ne obsah cizího chatu;
- persistence kontrakt rozlišuje kanonickou událost, odvozenou projekci a velký lokální artefakt.

Přesné TypeScript typy, serializace a SQL migrace vzniknou v implementační specifikaci. Jejich realizace nesmí oslabit zde uvedené invarianty.

### 11.7 Postup řízeného doplňování detailů

Každá větší implementační oblast musí před kódováním projít krátkým funkčním checklistem od vstupu přes úspěch po chybu, zrušení a obnovu. Nový detail se klasifikuje jako UX doplnění, zpřesnění existujícího požadavku, nová schopnost nebo architektonická změna. Pouze první kategorie může být doplněna bez produktového rozhodnutí; změna etapy, externího účinku, dat, bezpečnosti nebo povinného testu vyžaduje aktualizaci rozhodovacího záznamu a podle rozsahu další revizi PRD.

## 12. Data a perzistence

### 12.1 Hlavní entity

| Entita | Účel | Výchozí umístění |
| --- | --- | --- |
| UserProfile | Lokální preference a vazba na účet | lokálně, vybrané položky cloud |
| Project | Jméno, lokální cesta, ikona, barva, tagy, Git/capability metadata | lokálně, metadata volitelně cloud |
| Chat | Kontejner jednoho pracovního toku | lokálně, volitelně cloud |
| Message | Uživatelská, agentní nebo systémová zpráva | lokálně, volitelně cloud |
| UserQuestion | Strukturovaná otázka, důvod, možnosti, stav, odpověď a vazba na běh | lokálně; odpověď volitelně cloud jako součást chatu |
| AgentRun | Jeden běh orchestrátoru v chatu | lokálně, shrnutí volitelně cloud |
| Event | Append-oriented změna stavu | lokálně; bezpečná podmnožina volitelně cloud |
| ToolCall | Vstup, oprávnění, status a normalizovaný výsledek | lokálně |
| PermissionDecision | Výsledek, zdroj pravidla a důvod | lokálně |
| ChangeSet | Soubory, patch, revize a vztah k běhu | lokálně |
| Snapshot | Obnovovací data Git/non-Git | pouze lokálně, pokud uživatel výslovně nezvolí handoff v PŠ |
| VerificationRecord | Příkaz/nástroj, rozsah, výsledek, trvání, zdrojová relace a workspace revize | lokálně |
| Attachment | Metadata originálu, validace, anotace a lokální blob | lokálně, cloud pouze opt-in |
| ContextReference | Projektová cesta, pozorovaný hash/revize a vztah ke zprávě | lokálně |
| ContextAssembly | Vybrané zdroje, autorita, důvod, tokenový odhad a vložené výřezy pro jedno modelové volání | lokálně |
| WorkspaceState | Aktuální revize a ověřitelná fakta o worktree, Git stavu a známých zdrojích | lokálně |
| WorkIntent | Krátký sdílený záměr relace, očekávané oblasti a resource keys při zařazené koordinaci | lokálně |
| ResourceLease | Úzký časově omezený zámek stavové operace s vlastníkem | lokálně |
| GitOperation | Typ, preconditions, remote/branch, stav, výsledek a auditní vazby | lokálně |
| SubagentRun | Identita podúkolu, rodič, oprávnění, stav a provenance výsledku při zařazených subagentech | lokálně |
| ContextExperimentRun | Konfigurace, dataset, baseline, metriky a výsledek provedeného E0 | lokálně, report exportovatelný |
| ExtensionManifest | Skill/plugin/MCP metadata a oprávnění | lokálně |
| SyncState | Cursor, verze a konfliktní stav synchronizované entity | lokálně + cloud |

### 12.2 Pravidla lokální perzistence

- Hlavní lokální databází je SQLite; přístup k ní vlastní backendová persistence service a renderer ani model nesmí spouštět obecné SQL.
- Databáze používá WAL, zapnuté cizí klíče, verzované migrace a tam, kde je to přínosné, `STRICT` tabulky spolu s TypeScript validací.
- Zápis zprávy a počáteční události běhu musí být atomický nebo idempotentně obnovitelný.
- Přidělení resource lease a zahájení stavové operace musí být atomické; lease má vlastníka, expiraci/heartbeat a bezpečný recovery postup po pádu.
- Aktualizace workspace revize a událost, která ji způsobila, musí být transakčně propojené nebo deterministicky rekonstruovatelné.
- Uzavření change setu a jeho seznam aktuálních změn nesmí být označeno za konzistentní, pokud selhal zápis některé povinné provenience.
- Každá entita má stabilní ID nezávislé na pořadí v UI.
- Databázové schéma musí používat verzované migrace a zálohu před nevratnou migrací.
- Binární přílohy mají být uloženy odděleně od hlavních relačních záznamů s obsahovým hashem a referenčním počítáním.
- Snapshoty mají retenční limit konfigurovatelný podle velikosti a stáří; mazání nesmí odstranit jediný obnovovací bod aktivní relace.
- Běžný event log nesmí obsahovat hodnotu API klíče, heslo, OAuth refresh token ani neupravené prostředí procesu.

### 12.3 Cloudová data

- Cloud používá uživatelskou izolaci a Row Level Security, pokud bude nasazen Supabase.
- Absolutní lokální cesty se nesmí považovat za přenositelné identifikátory projektu.
- Zdrojové soubory, `.env`, Git objektová databáze a non-Git snapshot nejsou součástí běžné synchronizace.
- Každá cloudová entita má verzi nebo časovou/sekvenční informaci potřebnou pro detekci konfliktu.
- Odstranění účtu a export dat musí být doložitelné samostatným testovacím scénářem.

### 12.4 Retence a export

- Uživatel může odstranit chat, projektová metadata, přílohu a diagnostické výstupy podle jejich vazeb.
- Smazání projektového záznamu nesmí automaticky smazat lokální projektovou složku.
- Export chatu musí označit vynechaná tajemství a velké binární přílohy.
- Diagnostický export musí projít redakcí citlivých polí a automatickým secret scanem.
- Koordinační události, pracovní záměry a experimentální artefakty musí mít samostatně definovanou retenci; vypnutí sdílení `taskSummary` odstraní jeho aktivní projekci, nikoli audit již provedených bezpečnostních operací.

## 13. Bezpečnost a soukromí

### 13.1 Chráněná aktiva

- zdrojový kód a necommitnuté změny uživatele;
- soubory mimo otevřený projekt;
- API klíče, OAuth tokeny a další tajemství;
- shell a procesy operačního systému;
- historie chatů a příloh;
- cloudový účet;
- integrita rozšíření a jeho konfigurace;
- Git index, lokální a vzdálená historie a přihlašovací mechanismus Gitu;
- koordinační metadata, pracovní záměry a provenance relací/subagentů;
- správnost aktuálního kontextu a platnost ověřovacích důkazů.

### 13.2 Hlavní hrozby a kontrolní opatření

| Hrozba | Povinná opatření |
| --- | --- |
| Path traversal nebo únik přes symlink/junction | Kanonikalizace cesty, kontrola vůči schválenému kořeni, testování Windows junction/reparse bodů, zamítnutí nejasného cíle |
| Destruktivní shell příkaz | Řízený výchozí režim, zobrazení přesného příkazu, deny pravidla, omezený cwd, timeout a audit |
| Prompt injection v repozitáři | Projektový obsah je nedůvěryhodný kontext; nemůže měnit pevná oprávnění ani systémové bezpečnostní zásady |
| Únik tajemství do modelu | Detekce citlivých názvů, zákaz automatického čtení `.env` a známých credential souborů, náhled odesílaných příloh, redakce logu |
| Obejití hranice automatického kontextu | Jednotná výchozí politika a `.codrynignore` pro crawl, hledání, index, repo mapu i context assembly; viditelný důvod vynechání; pouze jednorázová souborová výjimka a zvláštní varování pro tajemství |
| API klíč v databázi nebo cloudu | OS credential store, maskované UI, secret scanning testy |
| Zneužití MCP/pluginu | Manifest a capability review, žádné spuštění před potvrzením, stejné oprávnění a audit jako lokální tool, možnost okamžité deaktivace |
| Zaseknutý či potomky vytvářející proces | Timeout, cancellation, ukončení procesního stromu, limit výstupu a jasná diagnostika |
| Přepsání ruční práce | Snapshot před změnou, očekávaná revize, conflict detection, žádný automatický force restore |
| Neoprávněný cloudový přístup | Ověřená autentizace, RLS, testy oddělení účtů, bezpečné odhlášení |
| Falešný stav dokončení | Stavový automat, revize ověření, povinný souhrn a explicitní „neověřeno“ |
| Ztráta změn při pull/checkout | Čerstvý preflight snapshot, kontrola lokálních a agentních změn, zákaz nejasné strategie a žádný automatický force |
| Přepsání vzdálené historie | Odmítnutí non-fast-forward push, force push mimo běžný O1 tok, zobrazení remote/branch a audit |
| Únik Git credentials | Delegace na existující Git credential mechanismus, žádné čtení tokenu do aplikace, redakce argumentů a prostředí |
| Souběžná stavová operace | Resource-key lease, čerstvé preconditions, heartbeat/recovery a audit vlastníka |
| Zastaralý kontext nebo test | Workspace revision, hash/revize artefaktu, freshness invalidace a oddělení historického výsledku od aktuálního důkazu |
| Prompt injection z paměti či tool outputu | Uložený obsah je nedůvěryhodné datum s nižší autoritou; instrukce a oprávnění nelze přepsat retrievalem |
| Obejití oprávnění přes otázku | Typové a stavové oddělení `UserQuestion` od `PermissionRequest`, žádná autorizační sémantika odpovědi, zákaz požadovat tajemství a nové rozhodnutí permission enginu před každou rizikovou akcí |
| Falešné vizuální ověření | Screenshot aktuální relevantní revize, evidence zadání a viewportu, invalidace stale důkazu, strukturovaný výsledek vision-checku a explicitní stav „vizuálně neověřeno“ při nedostupné kontrole |

### 13.3 Akce, které školní verze nesmí provést tiše

- čtení nebo zápis mimo otevřený projekt;
- čtení známého citlivého souboru;
- libovolný shell příkaz v Řízeném režimu;
- webový nebo síťový přístup mimo již schváleného modelového endpointu;
- instalace balíčku nebo spuštění instalačního skriptu;
- aktivace nového MCP serveru nebo pluginu;
- smazání projektového souboru bez obnovovacího bodu;
- vytvoření commitu nebo branche, přepnutí branche, pull, push nebo změna remote;
- upload přílohy nebo historie do cloudu, pokud není synchronizace zapnutá.

### 13.4 Auto režim

Auto režim není „bezpečnost vypnuta“. Pevná politika nejprve rozhodne jednoznačné `allow`, `deny` a povinné `ask` případy. Pouze zbývající nejasné akce dostane lehký vyměnitelný AI klasifikátor, který vrací `ALLOW`, `ASK` nebo `DENY`, míru jistoty a stručný důvod. Uživatelská pravidla zamítnutí, ochrana tajemství, hranice projektu a kritické operace mají vždy přednost; nízká jistota přechází k uživateli. Konkrétní lokální nebo API model bude vybrán až na základě eval sady po dokončení Řízeného režimu a formátu reálných tool callů, nejpozději do konce ledna 2027.

### 13.5 Soukromí vůči LLM poskytovateli

Před prvním použitím provideru Codryn vysvětlí, že text, kód a obrázky mohou být odeslány externí službě a že podmínky bezplatného a placeného režimu se mohou lišit. PRD nestanovuje aktuální právní nebo cenové tvrzení; text v produktu musí být před vydáním ověřen z primární dokumentace poskytovatele. Uživatel musí vědět, který provider a model je pro relaci aktivní.

## 14. Spolehlivost a chybové stavy

| Stav | Požadované chování |
| --- | --- |
| Neplatný API klíč | Zastavit volání, označit autentizační chybu, zachovat neodeslaný vstup a nabídnout opravu nastavení |
| Rate limit | Zobrazit kategorii a případný serverový retry údaj; neopakovat neomezeně a nevytvořit duplicitní zprávu |
| Přerušený stream | Uchovat přijaté bezpečné události, označit neúplnou odpověď a nabídnout kontrolované pokračování |
| Neplatný tool call | Nic nespustit, uložit validační chybu a vrátit ji modelu v rámci limitu iterací |
| Zamítnuté oprávnění | Nástroj nespustit, informovat model a ponechat uživateli možnost změnit pravidlo samostatně |
| Timeout procesu | Ukončit podporovaný strom, označit timeout a připojit omezený výstup do okamžiku ukončení |
| Pád tool workeru | Izolovat pád od orchestrátoru, zaznamenat chybu a nepovažovat editaci za úspěšnou bez potvrzení zápisu |
| Částečný zápis | Detekovat nesoulad, označit change set jako vyžadující obnovu/ruční kontrolu a nepokračovat jako při úspěchu |
| Konflikt návratu | Neaplikovat force restore, zobrazit dotčené soubory a zachovat obě potřebné verze pro ruční řešení |
| Pád rendereru | Backend pokračuje pouze v již povolených bezpečných operacích; nové schválení čeká na připojení |
| Pád aplikace | Po restartu obnovit poslední konzistentní události, ukončené externí procesy označit jako přerušené |
| Nedostupný cloud | Lokální zápis pokračuje, synchronizace přejde do fronty a stav je viditelný |
| Sync konflikt | Zachovat obě hodnoty nebo použít typově definované sloučení; konflikt nesmí zmizet bez záznamu |
| Nedostupná složka projektu | Zakázat file tooly, zachovat chat a nabídnout nové přiřazení cesty |
| Pád MCP serveru | Odpojit konkrétní rozšíření, označit jeho nástroje nedostupné a neukončit celou aplikaci |
| Chybějící Git executable | Zachovat chat a non-Git čtení projektu, zakázat Git stavové akce a nabídnout diagnostiku cesty/verze |
| Git conflict | Označit operaci jako `conflicted`, znovu načíst skutečný stav, nezobrazit úspěch a neprovádět automatické řešení bez samostatného požadavku |
| Non-fast-forward push | Neprovést force push, aktualizovat známý remote stav a vysvětlit potřebu integrace změn |
| Credential prompt bez interaktivního kanálu | Ukončit operaci bezpečnou autentizační chybou; nelogovat prompt ani tajemství a nabídnout konfiguraci systémového Git klienta |
| Ztracený resource lease po pádu | Po expiraci/ověření vlastníka lease uvolnit recovery procesem, ale nikdy nespustit druhou stavovou operaci jen podle stáří bez kontroly skutečného zdroje |
| Stará `@` reference | Před sestavením kontextu znovu ověřit cestu a revizi, označit změnu a nepoužít starý obsah jako aktuální |
| Duplicitní nebo pozdní odpověď na otázku | Přijmout nejvýše první platnou odpověď na otevřenou otázku; retry zpracovat idempotentně, pozdější odpověď auditovat a nespustit podruhé navázanou relaci |
| Preview, Playwright nebo obrazová capability nejsou dostupné | Zachovat ne-vizuální výsledky, uvést konkrétní důvod a skončit pouze se stavem „vizuálně neověřeno“, nikoli s tvrzením o vizuálním úspěchu |
| Vizuální nesoulad se zadáním | Uložit strukturované zjištění s vazbou na screenshot, revizi a viewport a vrátit je do opravné smyčky v mezích limitu kroků |
| Chybný experimentální checkpoint | Odpověď ověřit proti kanonickým eventům a aktuálním zdrojům; reportovat retrieval selhání a umožnit regeneraci v experimentu |

## 15. Testovací strategie

### 15.1 Testovací pyramida

1. **Unit testy** pokryjí stavový automat včetně `UserQuestion`, idempotenci odpovědi, pravidla oprávnění, validaci cest, normalizaci provider chyb, výběr kontextu, migrace, conflict detection a freshness vizuálního důkazu.
2. **Kontraktní testy** ověří jednotné chování fake a dvou zvolených reálných adapterů, capability negotiation a shodu lokálních/MCP tool výsledků s interním formátem.
3. **Integrační testy** spustí skutečné dočasné procesy a souborové fixture s timeouty, stdout/stderr, editací, snapshotem a návratem.
4. **Desktop E2E testy** ověří kritické UI toky v zabalené nebo produkčně blízké Electron konfiguraci včetně obnovy otevřené otázky; webová E2E fixture ověří povinný Playwright screenshot, vision-check, opravnou iteraci a pravdivý fallback.
5. **Omezené live API testy** ověří skutečný tool calling a streaming bez toho, aby byly hlavní automatické testy finančně nebo síťově nestabilní.
6. **Uživatelské testy** změří srozumitelnost stavu, schválení, diffu, layoutu a obnovy.
7. **Demonstrační zkoušky** ověří časování, čitelnost na projektoru, záložní scénář a obnovu po plánovaných selháních.

### 15.2 Povinné testovací fixture

- malý čistý Git TypeScript projekt;
- Git projekt s ručními necommitnutými změnami;
- lokální Git projekt pro stav, diff, historii, branch, stage/unstage a commit;
- Git historie s více větvemi, merge commitem, detached HEAD a konfliktem;
- externě změněný Git index mezi náhledem a commitem;
- non-Git TypeScript projekt;
- projekt s úmyslně neplatným `tsconfig.json`;
- projekt s failing a passing testem;
- složka s velkým souborem a binárním souborem;
- projekt s platným i neplatným `.codrynignore`, běžně ignorovaným souborem, `.env` variantou a testovacím privátním klíčem;
- path traversal a Windows junction/reparse fixture;
- proces, který vypisuje stdout/stderr;
- proces překračující timeout a vytvářející potomka;
- vestavěný planning/brainstorming skill a ověřovací workflow;
- dva oddělené testovací cloudové účty;
- obrazová příloha, nadlimitní příloha a nepodporovaný formát;
- dva zapisující aktéři se shodným i rozdílným souborem pro ověření stale zápisu bez požadavku na produktový subagent;
- lockfile, Git a databázové resource-key kolize;
- zastaralý verification record po relevantní i nerelevantní změně;
- otevřená strukturovaná otázka se dvěma až pěti možnostmi, vlastní odpovědí, restartem rendereru, duplicitním odesláním odpovědi a následnou samostatně schvalovanou rizikovou akcí;
- webová preview fixture se známým vizuálním nesouladem a opraveným stavem, alespoň jedním stanoveným viewportem, změnou revize zneplatňující starý screenshot a variantou nedostupného preview, Playwrightu nebo obrazové capability;

Volitelné fixture se přidají jen pro skutečně zařazené S/O1 schopnosti: lokální bare remote a dva klony pro `fetch`/`pull`/`push`; platný, neplatný a rizikový cizí lokální manifest; dvě souběžné relace a produktový subagent; anonymizované nebo syntetické dlouhé relace pro E0; obrazová anotace pro canvas.

### 15.3 Fake LLM scénáře

Fake provider musí pokrýt nejméně:

- přímou textovou odpověď bez tool callu;
- čtení souboru a následnou editaci;
- editaci, failing test, opravu a passing test;
- neplatný tool call;
- opakované volání vedoucí na limit kroků;
- žádost o zamítnutý příkaz a bezpečnou alternativu;
- strukturovanou otázku, odpověď uživatele a právě jedno pokračování stejné relace bez automatického povolení navazujícího tool callu;
- přerušený stream;
- multimodální požadavek s ověřením struktury payloadu;
- známý vizuální nesoulad vrácený jako strukturovaný výsledek a následnou opravu před stavem „vizuálně ověřeno“;
- `@` referenci, jejíž cíl se před sestavením kontextu změnil;
- souběžný subagentní výsledek odmítnutý kvůli stale revizi;
- provider response s chybějící deklarovanou capability;
- Git chybu předanou agentovi jako normalizovaný výsledek bez automatického destruktivního pokračování.

### 15.4 Provider eval a cenová disciplína

- Kandidáti používají shodné fixture, zadání, povolené nástroje, limity kroků a definici úspěchu.
- Cena se počítá za dokončený úkol z dostupných input, cached input, output a reasoning/thinking tokenů a případných tool poplatků, nikoli jen z ceníkové ceny vstupu.
- Výsledky oddělují kvalitu modelu od chyb adapteru a harnessu.
- Ceník, podmínky free tieru a datové zásady se v rozhodovacím záznamu opatří datem a odkazem na aktuální primární zdroj.
- Výběr prvního adaptéru může být změněn bez přestavby harnessu, ale změna musí znovu projít minimální kontraktní a demonstrační sadou.

### 15.5 Live API disciplína

- Live testy jsou oddělené od výchozího lokálního test příkazu.
- Používají malý fixture bez soukromého kódu a tajemství.
- Mají limit requestů, kroků a volitelný rozpočet.
- Zaznamenávají model, datum, nastavení a výsledek, protože chování externí služby se může měnit.
- Selhání externí služby nesmí zakrýt regresi vlastního orchestrátoru; stejný tok musí mít fake variantu.

### 15.6 Experiment E0

Pokud se volitelný E0 v O1 provede, běží odděleně od produktového UI a nesmí blokovat dokončení povinného agentního cyklu. Dataset, ruční anotace, baseline konfigurace, model, token counter a dotazy se verzují. Každý běh zachová surové výsledky a odvozené metriky. Report musí samostatně uvést případy nesprávného retrievalu, zastaralé odpovědi, over-boxing a situace, kdy jednoduchá kompakce překonala checkpointy. Rozhodnutí pokračovat není založeno pouze na tokenové úspoře, pokud se zhoršila správnost nebo auditovatelnost.

### 15.7 Uživatelské testování

Do finální obhajoby proběhne nejméně jedno moderované kolo s alespoň pěti lidmi odpovídajícími primární nebo sekundární personě. Každý dostane stejné úkoly: otevřít projekt, zadat malou změnu, rozhodnout oprávnění, najít výsledek testu, zkontrolovat diff a změnu vrátit. Zaznamená se dokončení, čas, chyby, místa nejistoty a subjektivní hodnocení kontroly nad agentem. Výsledky povedou k prioritizovaným opravám, nikoli pouze k průměrnému skóre spokojenosti.

## 16. Plán demonstrací

### 16.1 První obhajoba: hlavní scénář

**Doporučená délka živé ukázky:** 4 až 6 minut.

1. Otevřít připravený lokální TypeScript/React projekt s malou, deterministicky testovatelnou aplikací.
2. Ukázat, že Codryn rozpoznal projekt a Git/non-Git stav.
3. Zadat přidání malé, vizuálně pochopitelné funkce, která zasáhne více relevantních vrstev a má deterministické testy.
4. Nechat agenta cíleně načíst soubor a vyhledat relevantní symbol.
5. Ukázat požadavek na oprávnění pro testovací příkaz a vědomě jej schválit.
6. Zobrazit provedenou editaci a případnou iteraci po failing testu.
7. Ukázat passing test, souhrnný diff a seznam změněných souborů.
8. Předvést návrat změny nebo nejprve hot reload a poté návrat.
9. Jednou větou vysvětlit, které části jsou vlastní harness a proč by běžný chat stejnou jistotu neposkytl.

Konkrétní aplikace a funkce se vyberou až v přípravě obhajoby podle skutečně stabilních schopností release candidate; PRD je předčasně nezamyká.

### 16.2 První obhajoba: záložní scénář

- Stejný projekt, stejné zadání a stejné UI.
- Fake adapter vrací předem připravené tool cally, ale harness skutečně čte fixture, aplikuje patch, spouští test a provádí návrat.
- Připravené krátké video hlavního live běhu slouží jako důkaz chování provideru.
- Prezentující jasně řekne, kdy používá deterministickou zálohu; nesmí ji vydávat za aktuální live model.
- V případě pádu celé aplikace jsou připravené screenshoty event logu, diffu a testovacího reportu.

### 16.3 Finální obhajoba: hlavní scénář

Finální scénář naváže na stejné ověřené jádro a přidá nejvýše dva jasné „wow“ momenty:

1. strukturální TypeScript dotaz, který najde reference bez posílání celého repozitáře;
2. screenshot UI otevřený na canvasu, kreslená anotace a navazující oprava ověřená přes Playwright nebo test.

Součástí prezentace bude také krátká ukázka vlastního layoutu, účtu/synchronizace a rozšíření, ale nesmí zastínit hlavní agentní cyklus.

Volitelný lednový nebo květnový „wow“ scénář může nechat Codryn bezpečně upravit vlastní předváděnou aplikaci a projevit změnu přes hot reload. Tento scénář není náhradou stabilní hlavní demonstrace.

### 16.4 Generální zkouška

Před každou obhajobou musí proběhnout nejméně tři kompletní časované generální zkoušky na zařízení a projektoru co nejbližším školnímu prostředí. Checklist zahrnuje:

- funkční instalaci a lokální projekt;
- API klíč mimo prezentované obrazovky;
- dostupnost sítě a fake fallback;
- vyčištěný výchozí Git/non-Git stav;
- předvídatelné testy a timeout;
- dostatečnou velikost textu v chatu, událostech, diffu a terminálu;
- vypnutá osobní oznámení a skrytá citlivá data;
- lokální kopii videa a prezentace;
- známý postup resetu fixture mezi pokusy.

## 17. Vazba na školní hodnocení

| Kritérium | Max. body | Produktový důkaz | Cílový výstup |
| --- | ---: | --- | --- |
| Dokumentace | 25 | PRD, architektura, měsíční záznamy, test reporty, uživatelská dokumentace, traceability matice | Každé významné rozhodnutí má důvod, alternativy a ověřitelný stav |
| Posouzení průběhu vedoucím | 20 | Měsíční milníky, konzultační zápisy, Git historie po zahájení vývoje, průběžná dema a řízení rizik | Každý měsíc předvést dokončený vertikální výsledek nebo doložený experiment |
| Prezentace a komunikace | 15 | Časovaný scénář, jasný elevator pitch, live + fallback demo, diagram architektury | Komise během prvních minut chápe problém, vlastní přínos a důkaz funkčnosti |
| Naplnění cíle práce | 10 | Měřitelné AC-O1/AC-SF a finální traceability | Celý agentní cyklus funguje v kontrolovaném reálném projektu |
| Technická kvalita, složitost a technologie | 10 | Oddělené vrstvy, adaptery, harness, event log, bezpečnost, automatické testy | Žádný kritický modul není pouze maketa bez skutečné implementace |
| Kreativita a originalita | 5 | Vynucené ověřování, Git/non-Git návrat, repo mapa a multimodální anotace | Originalita je vysvětlena jako vlastní syntéza a měřený přínos |
| Design a UI | 5 | Přizpůsobitelné pracovní plochy, přístupnost, uživatelský test | Funkční hierarchie je srozumitelná; vizuální identita vznikne samostatně |
| Funkčnost a spolehlivost | 5 | Deterministické E2E, live opakování, obnova a fallback | Kritický scénář je opakovatelný a chyby jsou viditelné |
| Inovace a řešení problémů | 5 | Eval TypeScript nástrojů, LLM Wiki experiment, permission model | Přínos je doložen výsledky, ne pouze marketingovým tvrzením |

### 17.1 Povinné dokumentační artefakty

- schválené PRD a jeho změnová historie;
- architektonický dokument a rozhodovací záznamy;
- měsíční plán a stručné měsíční vyhodnocení;
- threat model a bezpečnostní test report;
- automatický test report pro každou obhajobu;
- report vizuálního ověření se screenshoty, workspace revizemi, viewporty, výsledky a známými omezeními;
- záznam experimentu TypeScript profilu a LLM Wiki;
- protokol uživatelského testování;
- uživatelská příručka pro instalaci, BYOK, oprávnění a návrat změn;
- prezentace, demonstrační checklist a záložní video;
- finální matice požadavek → implementace → test → demonstrační důkaz.
- autorsky zkontrolovaný přehled hlavních komponent, datových toků a důvodů klíčových rozhodnutí použitelný při obhajobě.

## 18. Kritéria úspěchu projektu

### 18.1 Minimální školní úspěch

- O1 předvede stabilní svislou cestu s reálnou editací, testem, diffem a návratem.
- Finální verze je instalovatelná na Windows 11 a lokální jádro funguje bez cloudu.
- U každého nesplněného požadavku je poctivě uveden dopad a důvod.
- Dokumentace prokazuje vlastní návrh a průběžnou práci.

### 18.2 Cílový úspěch

- Všechna M/O1 a nejméně 90 % M/ŠF požadavků jsou splněna bez kritické bezpečnostní výjimky.
- Oba modelové adaptéry projdou společným kontraktem.
- Git i non-Git obnova funguje v automatizované sadě.
- Účet je funkční a synchronizace chatů/nastavení je buď kvalitně dokončena, nebo bezpečně omezena s doloženým lokálním fallbackem.
- TypeScript strukturální nástroje a repo mapa mají zveřejněný měřitelný experiment.
- Každý podporovaný úkol, jehož akceptace závisí na vykresleném UI, má aktuální Playwright/vision důkaz, nebo je poctivě označen jako „vizuálně neověřeno“ s důvodem.
- Uživatelské testování vede ke konkrétním opravám před finální obhajobou.
- Autor dokáže bez závislosti na vygenerovaném textu vysvětlit hlavní datový tok, bezpečnostní hranice a alespoň jeden podstatný trade-off každé kritické vrstvy.

### 18.3 Ambiciózní úspěch

- Agent během obhajoby upraví předváděnou aplikaci a výsledek se bezpečně projeví přes hot reload.
- Canvas anotace, porovnání více viewportů a následná Playwrightem ověřená oprava vytvoří jeden srozumitelný rozšířený multimodální cyklus.
- Cloudová synchronizace splní všechny metriky bez snížení lokální spolehlivosti.
- UI působí originálně a profesionálně při zachování přístupnosti a technické transparentnosti.

### 18.4 Podmínky, které nelze kompenzovat množstvím funkcí

Projekt nelze považovat za úspěšně dokončený, pokud:

- agentní změny mohou nepozorovaně přepsat ruční práci uživatele;
- aplikace ukládá API klíče do běžného logu nebo cloudu;
- UI tvrdí, že test prošel, aniž existuje odpovídající výsledek;
- podporovaný vizuální úkol je vydáván za vizuálně ověřený bez relevantního screenshotu aktuální revize a dohledatelného výsledku vision-checku;
- hlavní demo je pouze přehraná nebo předem napevno napsaná chatová konverzace bez skutečného harnessu;
- lokální jádro je nepoužitelné bez přihlášení nebo dostupného cloudu;
- neexistuje opakovatelný test základního agentního cyklu.

## 19. Rizika a mitigace

| Riziko | Pravděpodobnost / dopad | Mitigace | Signál pro omezení rozsahu |
| --- | --- | --- | --- |
| Příliš široký rozsah | vysoká / vysoký | Vertikální O1, priorita M, quality gates před wow funkcemi | Kritický agentní cyklus není opakovatelný měsíc před O1 |
| Nestabilní LLM odpovědi | vysoká / střední | Fake adapter, malé fixture, limity kroků, kontraktní normalizace | Live úspěšnost klesne pod 4/5 u O1 scénáře |
| Výpadek sítě/API při obhajobě | střední / vysoký | Deterministický fallback a lokální video | Provider selže ve dvou po sobě jdoucích generálních zkouškách |
| Bezpečnost Electron IPC | střední / vysoký | Context isolation, úzké IPC, bez Node integrace v rendereru, threat model | Spike nedokáže zabránit obecnému volání privilegované operace |
| Bezpečné rušení procesů na Windows | střední / vysoký | Samostatný spike, process tree testy, timeout | Zůstávají orphan procesy v povinných fixture |
| Cloud/sync pohltí čas | vysoká / střední | Lokální-first model, omezené entity, sync za feature flagem | Synchronizace způsobuje ztrátu lokálních dat nebo blokuje chat |
| Auto režim chybně povolí riziko | střední / vysoký | Hard deny před klasifikátorem, ask-on-uncertain, eval sada | Jakýkoli kritický nebezpečný případ je automaticky povolen |
| Rozšíření spustí nedůvěryhodný kód | střední / vysoký | O1 povinně pouze vestavěný registry a dva kurátorované workflows; volitelný lokální import jen s náhledem a bez spuštění či instalace | Import vyžaduje automatickou instalaci nebo aktivaci bez vyřešené důvěry |
| LLM Wiki nepřinese hodnotu | střední / střední | Baseline experiment, jednoduchá repo mapa jako fallback | Horší úspěšnost bez významné úspory tokenů/latence |
| TypeScript analýza je příliš pomalá | nízká až střední / střední | Omezené dotazy, cache s invalidací, textový fallback | Běžný fixture dotaz opakovaně blokuje UI nebo překročí stanovený timeout |
| UI se dokončí příliš pozdě | vysoká / střední | Funkční baseline v O1, design etapa po stabilizaci harnessu | Klíčové stavy nelze na projektoru přečíst při generální zkoušce |
| Kód vytvořený AI je nekonzistentní | vysoká / střední | Architektonická pravidla, malé moduly, code review, testy a rozhodovací záznamy | Opakované změny porušují hranice orchestrátor/harness |
| Zastarání externích API | střední / střední | Adaptery, primární dokumentace, verze a kontraktní testy | Provider zruší potřebný function calling nebo dostupnost modelu |
| Git workspace přeroste hlavní produkt | střední / vysoký | Povinný O1 je omezen na lokální každodenní tok; vzdálené operace a pokročilé rebase/cherry-pick/stash funkce nejsou podmínkou první obhajoby | Git práce odsouvá dokončení harnessu nebo lokální Git fixture není stabilní |
| Pull/push poškodí práci nebo historii | nízká až střední / vysoký | Schopnost je S/O1 a M/ŠF; před zařazením musí mít čerstvý preflight, explicitní akci, zákaz automatického force push a lokální remote testy | Jakákoli fixture ztratí lokální změnu nebo přepíše vzdálenou historii |
| Koordinace vytvoří falešný pocit bezpečí | střední / vysoký | Awareness je pouze metadata; každý zápis má hard hash/revision check | Patch lze aplikovat po změně podkladu bez nové analýzy |
| Zámek zablokuje projekt po pádu | střední / střední | Resource key, vlastník, heartbeat/expirace, recovery kontrola skutečného stavu | Po restartu nelze bezpečně určit vlastníka nebo uvolnit operaci |
| Experimentální paměť zhorší správnost | střední / střední | Žádná produktová implementace před úspěšným E0, kanonické eventy, freshness validation, zveřejnění selhání | Tokeny klesnou, ale odpovědi nebo stale detekce jsou horší než baseline |
| Otázka obejde oprávnění nebo vyláká tajemství | nízká až střední / vysoký | Samostatný typ a stav, žádná autorizační sémantika, zákaz tajemství, následná riziková akce vždy znovu prochází permission enginem | Odpověď na otázku sama spustí rizikovou akci nebo se objeví v secret-scanu |
| Vision-check vytvoří falešnou jistotu | střední / vysoký | Aktuální screenshot a revize, explicitní záměr a viewport, známé mismatch fixture, strukturované limity a kombinace s deterministickými kontrolami | Známý nesoulad opakovaně projde jako vizuálně ověřený nebo stale screenshot zůstane platný |

## 20. Otevřená rozhodnutí

Většina dřívějších rozhodnutí byla uzavřena a jejich důvody jsou vedeny v `REGISTR_ROZHODNUTI_v1.0.md`. Zde zůstávají pouze volby, které nelze kvalitně uzavřít bez implementačních dat.

### OD-01: Konkrétní model klasifikátoru Auto režimu

**Uzavřená architektura:** pevná politika před lehkým AI klasifikátorem, kritické hranice mimo jeho pravomoc a `ask` při nejistotě.  
**Co chybí:** srovnání lokálního a API modelu na reálném formátu tool callů.  
**Rozhodovací kritéria:** false-negative míra u rizikových akcí, latence, vysvětlitelnost, offline chování, paměť, soukromí a náklady.  
**Termín:** nejpozději do 31. ledna 2027 po dokončení Řízeného režimu a eval sady.

### OD-02: Síla Windows execution sandboxu ve ŠF

**Uzavřené minimum:** shellové příkazy běží v odděleném procesu, pod kontrolou permission engine, s timeoutem, auditním výstupem a řízením podporovaného stromu potomků.  
**Co chybí:** ověření, zda lze na cílovém Windows 11 spolehlivě omezit soubory a síť bez rozbití Node.js, npm, Git a testovacích nástrojů.  
**Rozhodovací pravidlo:** silnější sandbox se stane M/ŠF pouze po úspěšném technickém experimentu; jinak zůstane S/ŠF nebo PŠ a limit bude explicitně zdokumentován.  
**Termín:** experiment dokončit nejpozději do 31. ledna 2027.

### OD-03: Finální název a licence před zveřejněním

**Uzavřený směr:** Codryn je pracovní název; repozitář zůstává během školního vývoje soukromý.  
**Co chybí:** kontrola ochranných známek, domén, balíčkových registrů, závislostí a školních pravidel před veřejným vydáním.  
**Termín:** před prvním veřejným vydáním, nejpozději po finální obhajobě, pokud se autor nerozhodne publikovat dříve.

### OD-04: První reálný modelový adapter

**Uzavřený směr:** harness je provider-neutral a první adapter musí projít jednotným kontraktem; kandidáty pro první eval jsou GPT-5.6 Luna a Gemini `gemini-2.5-flash`.  
**Co chybí:** měření tool callů, opravy po chybě, kvality výsledku, latence, skutečné ceny celého úkolu a aktuálních datových podmínek.  
**Rozhodovací pravidlo:** vybrat kandidáta s nejlepším celkovým poměrem pro O1, nikoli automaticky nejnižší ceníkovou cenou tokenu; druhý kandidát může zůstat ověřovacím adaptérem.  
**Termín:** před uzavřením R4/F3 a použitím živého provideru jako výchozího demonstračního toku.

### OD-05: Pokračování epizodické paměti po E0

**Uzavřený směr:** E0 je volitelný technický experiment S/O1; epizodická paměť není funkcí O1 ani školní verze.  
**Co chybí:** baseline data o správnosti, retrievalu, tokenové úspoře, latenci, stale detekci a auditovatelnosti.  
**Rozhodovací pravidlo:** produktová varianta A vznikne pouze při zachované nebo lepší správnosti, prokazatelné úspoře aktivního kontextu, funkční stale detekci a možnosti dohledat originální evidenci; složitější FTS/reranking vyžaduje další samostatné rozhodnutí.  
**Termín:** bez školního deadline. Produktová epizodická paměť může být zvažována až v PŠ po úspěšném E0 a samostatném rozhodnutí.

### OD-06: Výchozí strategie pull

**Uzavřené minimum:** pull je explicitní vzdálená Git akce S/O1 a M/ŠF s čerstvým preflightem, ochranou lokálních změn a resource-key serializací.  
**Co chybí:** potvrzení UX pro repozitář bez jednoznačně nastavené `pull.rebase`/`pull.ff` strategie.  
**Rozhodovací pravidlo:** respektovat jednoznačnou existující Git konfiguraci; pokud výsledek může být merge nebo rebase a politika není určitelná, vyžádat uživatelskou volbu a nevymýšlet ji za uživatele.  
**Termín:** před prvním zpřístupněním operace, nejpozději před uzavřením ŠF.

## 21. Traceability a přílohy

### 21.1 Požadavkové oblasti

| Prefix | Oblast |
| --- | --- |
| FR-DESK | Desktopový základ |
| FR-WORK | Onboarding a pracovní plocha |
| FR-PROJ | Projekty |
| FR-CHAT | Chaty |
| FR-ORCH | Orchestrátor |
| FR-LLM | Modelová vrstva |
| FR-TOOL | Nástroje a harness |
| FR-PERM | Oprávnění |
| FR-CHG | Změny a diff |
| FR-VCS | Git/non-Git |
| FR-TERM | Terminál, náhled a ověřování |
| FR-TS | TypeScript profil |
| FR-CTX | LLM Wiki a kontext |
| FR-CAN | Canvas |
| FR-EXT | Skills, MCP a pluginy |
| FR-ACC | Účet a cloud |
| FR-UX | Produktový baseline a běžné UX stavy |
| FR-COORD | Workspace Intelligence, koordinace a subagenti |
| FR-EXP | Technické experimenty kontextové paměti |

### 21.2 Povinná traceability matice během vývoje

Pro každý požadavek priority M musí budoucí implementační dokumentace udržovat:

- ID požadavku;
- etapu;
- stav `nezačato`, `probíhá`, `omezeně splněno`, `splněno` nebo `zamítnuto rozhodnutím`;
- odkaz na implementační část;
- automatický nebo manuální test;
- důkaz pro obhajobu;
- známé omezení;
- datum posledního ověření.

### 21.3 Slovník

| Pojem | Význam v Codryn |
| --- | --- |
| Agentní relace / AgentRun | Jeden řízený běh od uživatelského požadavku po konečný stav |
| UserQuestion | Trvalá strukturovaná otázka s důvodem, možnostmi a odpovědí, která doplní rozhodnutí uživatele, ale nenahrazuje bezpečnostní oprávnění |
| Adapter | Překlad mezi interním formátem Codryn a API konkrétního LLM poskytovatele |
| Capability profil | Balík rozpoznání a nástrojů pro konkrétní jazyk nebo framework |
| Change set | Skupina souborových změn navázaná na agentní relaci |
| Event log | Trvalá posloupnost událostí, z níž lze obnovit a auditovat stav |
| Event envelope | Společný obal každé události s typem, verzí, ID, časem, původem a vazbou na relaci; samotná užitečná data události jsou uvnitř |
| Harness | Bezpečná provozní infrastruktura pro validaci, autorizaci a spuštění nástrojů |
| Technický spike | Malý časově omezený pokus, který ověří rizikovou technickou otázku a skončí důkazem a rozhodnutím, nikoli hotovou produktovou funkcí |
| IPC threat model | Přehled toho, kdo a jak může zneužít komunikaci mezi Electron rendererem a privilegovaným backendem, jaká aktiva jsou ohrožena a které kontroly útok blokují |
| LLM Wiki | Odvozená projektová paměť a repo mapa pro účelnější kontext |
| MCP | Standard pro připojení externích nástrojů a schopností |
| Non-Git snapshot | Vlastní lokální obnovovací bod Codryn pro projekt bez použitelného Gitu |
| Ověřeno | Relevantní kontrola úspěšně proběhla nad aktuální revizí změn |
| Vizuálně ověřeno | Playwright/vision kontrola podporovaného vizuálního úkolu proběhla nad screenshotem aktuální relevantní revize a eviduje porovnávaný záměr, viewport, výsledek a omezení |
| Skill | Popsaný pracovní postup nebo sada instrukcí pro agenta |
| `.codrynignore` | Kořenový soubor se zdokumentovanou podmnožinou ignore pravidel, který omezuje automatické získávání projektového obsahu; nenahrazuje kontrolu oprávnění při explicitní akci |
| Tool call | Strukturovaný požadavek modelu na spuštění konkrétního nástroje |
| Context reference | Explicitní odkaz ze zprávy na soubor nebo složku projektu, nikoli automaticky celý odeslaný obsah |
| Context assembly | Auditovatelný soubor zdrojů a výřezů sestavený pro jedno volání modelu |
| Workspace State | Ověřitelný živý stav projektu pozorovaný backendem |
| Workspace revision | Monotónní interní revize relevantních událostí workspace; nenahrazuje hash souboru ani Git commit |
| Work Intent | Měkká deklarace cíle a očekávaných oblastí relace, nikoli bezpečnostní zámek |
| Resource key | Stabilní identifikátor konkrétního sdíleného zdroje pro úzkou serializaci stavové operace |
| Verification record | Historický důkaz kontroly svázaný s rozsahem a konkrétní workspace revizí |
| Stale | Stav historického nebo odvozeného údaje, který již nelze bez nového ověření použít jako aktuální pravdu |
| Epizodický checkpoint | Experimentální strukturované shrnutí části relace s odkazy na kanonické události; není zdrojem pravdy o aktuálním workspace |

### 21.4 Závěrečné pravidlo priority

Pokud během vývoje vznikne konflikt mezi novou funkcí a bezpečným, opakovatelným agentním cyklem, prioritu má agentní cyklus. Pokud vznikne konflikt mezi cloudovou funkcí a lokální použitelností, prioritu má lokální použitelnost. Pokud vznikne konflikt mezi vizuálním efektem a čitelností nebo ovladatelností, prioritu má čitelnost a ovladatelnost. Změna těchto priorit vyžaduje vědomé rozhodnutí autora zaznamenané v projektovém kontextu.
