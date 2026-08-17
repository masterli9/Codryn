# Kontext projektu – maturitní práce

> Tento soubor je živá pracovní paměť pro budoucí práci v tomto repozitáři.
> Před návrhem, implementací nebo změnou architektury jej vždy přečti a po
> významném rozhodnutí ho aktualizuj. Nezaměňuj zde označené nápady za hotová
> rozhodnutí.

## Aktualizace po vydání PRD v1.0 – 14. srpna 2026

- Aktuální produktovou autoritou je `PRD_v1.0.md`. `PRD_v0.3.md`, `PRD_v0.2.md` a `PRD_v0.1.md` jsou neměnné historické snapshoty.
- Důvody schválených rozhodnutí jsou v `REGISTR_ROZHODNUTI_v1.0.md`, řízení rozsahu v `ETAPIZACE_v1.0.md` a pořadí implementačních přírůstků bez kalendářních dat v `ROADMAP.md`.
- v1.0 znamená schválený implementačně připravený produktový kontrakt, nikoli hotovou implementaci. Po vydání se nemění; významná změna rozsahu, priority, etapy, bezpečnosti, dat nebo akceptačního kritéria vyžaduje novou verzi nejméně v1.1.
- První funkční průřez nadále vzniká bez produktového UI přes interní headless/CLI driver nad stejnými aplikačními službami, které později používá Electron. Současně vzniká pouze minimální Electron spike pro včasné ověření balení, úzkého IPC, SQLite a procesního runneru.
- Povinný O1 Git rozsah je lokální: status, diff, historie, stage/unstage celého souboru, branch, commit a upravitelný AI návrh commit message. `fetch`, `pull` a `push` jsou S/O1 a M/ŠF.
- Vzdálené Git operace používají nainstalovaný Git CLI a autentizaci ponechají systémovému credential helperu nebo SSH. Codryn hesla, tokeny ani privátní klíče nečte ani neukládá; nepodporovaný interaktivní prompt bezpečně skončí s návodem přihlásit se mimo agentní relaci.
- Povinné bezpečnostní jádro Workspace Intelligence v O1 tvoří `workspaceRevision`, expected-hash/revision ochrana zápisů, invalidace zastaralých verification recordů, resource-key serializace a audit provenience. `taskSummary`, snapshot aktivních relací, překryv, viditelný strom a skuteční subagenti jsou S/O1 a M/ŠF.
- `.codrynignore` je M/O1 a spolu s bezpečnými výchozími pravidly jednotně chrání automatický crawl, hledání, TypeScript index, repo mapu, hlubší inicializaci a context assembly. `.gitignore` je jen doplňkový signál; změna pravidel invaliduje dotčená odvozená data.
- Strukturované upřesňující otázky jsou M/O1: obsahují důvod, dvě až pět možností a vlastní odpověď, trvale pozastaví stejný běh ve `waiting_for_user_input` a po první platné odpovědi jej obnoví právě jednou. `UserQuestion` nikdy nenahrazuje `PermissionRequest`, nevyžaduje tajemství a navazující riziková akce znovu prochází permission enginem.
- O1 povinně obsahuje interní registry a dva vestavěné workflows: planning/brainstorming a ověření. Import cizího lokálního manifestu je S/O1 a M/ŠF; minimální MCP klient a správa rozšíření jsou M/ŠF; instalace z GitHubu nebo URL je S/PŠ.
- Playwright screenshot a vision-check jsou M/ŠF pro podporované úkoly závislé na vykresleném UI. „Vizuálně ověřeno“ vyžaduje screenshot aktuální relevantní workspace revize, záměr, viewport, výsledek a omezení; nesoulad se vrací do opravné smyčky a nedostupná kontrola se vždy označí „vizuálně neověřeno“.
- Vývoj probíhá přes krátkodobé pracovní branche nad stabilní `main`; přímý vývoj funkcí na `main` se nepoužívá. Před obhajobami vzniknou stabilizační branche `release/o1` a `release/sf`. Přesný commit skutečně použitého obhajovacího buildu se vždy uzamkne neměnným anotovaným tagem `obhajoba/o1-vN` nebo `obhajoba/sf-vN` a archivuje se s instalačním artefaktem, checksumem, test reportem a známými omezeními. Pozdější vývoj tak může pokračovat bez ztráty možnosti obnovit přesnou obhajovací verzi.
- E0 epizodické paměti je volitelný experiment S/O1 a neblokuje O1 ani ŠF. Produktová epizodická paměť je nejdříve C/PŠ, pouze po úspěšném E0 a samostatném rozhodnutí.
- Neveřejný, uniklý nebo licenčně nejasný proprietární codebase se nepoužívá jako implementační podklad. Přípustná inspirace vychází z veřejného chování, oficiální dokumentace a veřejných repozitářů s ověřenou licencí; významný vliv eviduje původ a vlastní odůvodnění.
- Pokud se starší text níže nebo starší dokumenty rozcházejí s v1.0 sadou, platí v1.0.

## Aktualizace po revizi PRD v0.3 – 12. srpna 2026

- Aktuální produktovou autoritou je `PRD_v0.3.md`; `PRD_v0.2.md` a `PRD_v0.1.md` jsou historické snapshoty.
- Důvody uzavřených rozhodnutí jsou v `REGISTR_ROZHODNUTI_v0.3.md` a interní rámec je v `ETAPIZACE_v0.3.md`.
- Pořadí skutečné implementace bez kalendářních dat určuje `ROADMAP.md`. Roadmap nenahrazuje produktový rozsah PRD ani řízení rizika v etapizaci.
- První funkční vertikální průřez agentního jádra vznikne přes interní headless/CLI driver bez produktového UI. CLI není samostatný produkt ani druhé trvale udržované uživatelské rozhraní; používá stejné aplikační služby jako pozdější Electron renderer.
- Současně s headless průřezem vznikne pouze minimální Electron spike pro včasné ověření Windows balení, úzkého IPC, SQLite a procesního runneru. Minimální produktové UI se připojí až ke stabilnímu jádru.
- PRD v0.3 je technicky konkrétní na úrovni odpovědností komponent, stavových automatů, invariantů, datových toků, chyb a testů. Přesné TypeScript interface, SQL migrace, adresářová struktura a volba každé knihovny patří do navazujících implementačních specifikací.
- Běžné UX detaily se doplňují systematicky přes oblastní baseline checklisty. Detail lze přidat bez nové revize PRD jen tehdy, pokud nemění etapu, bezpečnost, data, externí účinek nebo význam akceptačního kritéria.
- O1 zahrnuje `@` reference na soubory a složky projektu. Obecné textové/obrazové přílohy, drag-and-drop a vložení obrázku ze schránky jsou povinné nejpozději pro ŠF.
- O1 zahrnuje kompaktní Git workspace: stav, staged/unstaged změny, diff, historii, branch, commit, AI návrh commit message, fetch, pull a push. Operace jsou explicitní, používají čerstvý preflight, systémový Git credential mechanismus, resource-key serializaci a neprovádějí automatický force push.
- Dřívější pevná volba Gemini `gemini-2.5-flash` jako prvního adaptéru je nahrazena provider evalem. Počáteční kandidáti jsou GPT-5.6 Luna a Gemini `gemini-2.5-flash`; rozhoduje agentní kvalita, latence, cena celého úkolu, dostupnost a aktuální datové podmínky.
- Workspace Intelligence, koordinace relací a přímé zápisy subagentů jsou zapracovány do O1 v0.3. Awareness nenahrazuje expected-hash/revision kontrolu každého zápisu.
- `NAVRH_EPIZODICKE_PAMETI_KONTEXTU_v0.1.md` zůstává kandidátní architekturou. Schválen je pouze offline experiment E0; produktová implementace, FTS5, reranking ani embeddings nejsou automaticky součástí O1.
- Neveřejný nebo uniklý proprietární codebase se nepoužívá jako implementační podklad. Technická rešerše čerpá z veřejných dokumentací a repozitářů s ověřenou licencí a u převzatých praktik eviduje původ a vlastní odůvodnění.
- Pokud se starší text níže nebo dřívější podklady rozcházejí s v0.3 dokumenty, platí v0.3.

## Aktualizace po revizi PRD v0.2 – 11. srpna 2026

- Aktuálním pracovním názvem produktu je **Codryn**; Codey je předchozí pracovní název.
- Aktuální produktovou autoritou je `PRD_v0.2.md`.
- Důvody uzavřených rozhodnutí jsou v `REGISTR_ROZHODNUTI_v0.2.md`.
- Interní časový a scope rámec je v `ETAPIZACE_v0.2.md`; nejde o školní měsíční seznam úkolů.
- Schválený kandidát koordinace souběžných relací je popsán v `NAVRH_WORKSPACE_AWARENESS_v0.1.md` a musí být zapracován do kandidáta PRD v1.0.
- Subagenti smějí už v O1 přímo zapisovat do společného workspace; platí pro ně stejná hashová ochrana, provenance a koordinace stavových operací jako pro samostatné relace.
- Koordinační `taskSummary` vzniká v O1 automaticky z aktuálního zadání a plánu agenta a uživatel jej může upravit nebo vypnout; lehký sumarizační model je pozdější rozšíření pro dlouhé relace.
- `recently_writing` trvá pět minut od posledního zápisu; potom relace s nevrácenými změnami přechází do `idle_with_changes`, jinak přestává být aktivní pro koordinaci.
- Koordinátor serializuje podle konkrétního zdroje stavové Git operace, změny balíčků/lockfilu a databázové migrace. Dev servery nezamyká; jejich runtime konflikty řeší běžný procesní výsledek.
- Pokud se starší text níže nebo dřívější podklady rozcházejí s těmito třemi dokumenty, platí v0.2.
- `PRD_v0.1.md` zůstává zachované jako historický snapshot.

## Školní kontext

- Jde o ročníkový/maturitní projekt autora ve 4. ročníku střední školy se
  zaměřením na informační technologie.
- V září bude vybrán vedoucí práce. Pro něj bude potřeba dodat stručný popis
  projektu a měsíční plán s několika obecnými úkoly, který ponechá volnost při
  skutečném vývoji.
- Každý měsíc probíhá konzultace; v pololetí a před koncem školního roku jsou
  obhajoby. Druhá obhajoba se započítává do výsledné známky.
- Při první obhajobě musí existovat alespoň malá, stabilní a projektorem dobře
  předveditelná ukázka programu.
- Vývoj začíná už v srpnu, aby vznikl velký náskok. Git větve mohou později
  sloužit k věrohodnému rozdělení hotové práce do etap podle školního plánu.

## Hodnocení projektu (100 bodů)

| Kritérium | Maximum |
| --- | ---: |
| Dokumentace | 25 bodů |
| Posouzení průběhu vedoucím | 20 bodů |
| Prezentace a komunikace | 15 bodů |
| Naplnění cíle práce | 10 bodů |
| Technická kvalita, složitost a použité technologie | 10 bodů |
| Kreativita a originalita | 5 bodů |
| Design a uživatelské rozhraní | 5 bodů |
| Funkčnost a spolehlivost | 5 bodů |
| Inovace a řešení problémů | 5 bodů |
| **Celkem** | **100 bodů** |

Nejvíce bodů je mimo samotnou implementaci (dokumentace, průběh, komunikace),
proto musí PRD a následný plán obsahovat nejen funkce, ale i měřitelné milníky,
ukázky pro obhajobu, způsob testování a materiály pro prezentaci.

## Vize produktu

Vzniká desktopový nástroj pro *vibe coding*: AI asistent pracující nad lokálním
projektem podobně jako Claude Code nebo Google Antigravity. Cílem není pouhý
chatový obal nad API, ale lepší **harness** (řídicí a exekuční infrastruktura),
který vede model k účelnému používání nástrojů, ověřování výsledků a bezpečné
práci s kódem.

Pracovní technologický směr je TypeScript/Node.js a React; jako desktopový obal
zatím převažuje Electron (Tauri je alternativou k pozdějšímu ověření). Aplikace
má uživateli umožnit vlastní API klíč a případně i lokální model, takže vrstva
pro LLM nesmí být pevně svázaná s jediným poskytovatelem.

## Modelová vrstva a testovací poskytovatelé

Aplikace je *bring your own key*: uživatel si volí model a poskytovatele.
Harness však potřebuje jednotné interní rozhraní a pro každý API formát vlastní
adapter, protože se poskytovatelé liší v tool callech, streamování, kontextu a
dalších schopnostech.

- **První reálný adapter pro MVP:** vybere provider eval mezi počátečními
  kandidáty GPT-5.6 Luna a Gemini `gemini-2.5-flash`. Eval porovnává tool
  calling, dokončení úkolu, opravu po chybě, latenci, cenu celého úkolu a
  aktuální podmínky zpracování dat. Ceníková cena tokenu sama nerozhoduje.
- **Druhý ověřovací adapter:** používá odlišný API formát nebo srovnatelný
  OpenAI-kompatibilní endpoint a prochází stejnou kontraktní sadou. Konkrétní
  model se může změnit podle dostupnosti bez změny hranic harnessu.
- **Bezplatné režimy:** před odesláním projektového obsahu musí Codryn upozornit
  na aktuální podmínky poskytovatele, zejména pokud může obsah využívat ke
  zlepšování produktů. Pro automatické testy se soukromý kód nepoužívá.
- Levnější model, například Gemini Flash-Lite, může později sloužit pro malé
  pomocné úlohy (sumarizace nebo klasifikace rizika), nikoli jako nezbytná
  závislost základní agentní smyčky.
- Vývoj harnessu má ve většině automatických testů používat falešného,
  deterministického poskytovatele vracejícího předem připravené odpovědi a tool
  cally. Skutečné API se používá jen pro omezené integrační testy a demo, aby
  náklady zůstaly pod kontrolou.

## Rozsah programovacích ekosystémů

Základní práce se soubory, chatem, historií změn a uživatelsky schváleným
terminálem má fungovat nad libovolnou lokální složkou. Prvotřídní, automaticky
rozpoznaná podpora školního MVP se však soustředí na TypeScript/Node.js a
webové projekty v Reactu a Next.js. Tento profil může znát jejich konfiguraci,
typovou kontrolu, testy a nástroje pro strukturální analýzu; další jazyky a
frameworky budou později přidávané jako samostatné capability profily.

## Multimodální zadání a kreslená poznámka

Kreslení je podpůrný způsob zadání, nikoli samostatný generátor aplikací.
Uživatel popíše záměr textem a doplní jej jednoduchou skicou, když je potřeba
vysvětlit rozložení stránky, umístění prvku nebo přibližnou podobu komponenty
(např. tlačítka). Agent dostane obě části jako jeden požadavek a má je použít
pro návrh či úpravu UI. Funkce má pomoci s komunikací záměru, nikoli slibovat
pixelově přesný převod kresby do hotového designu.

Plátno musí umožnit vložit uživatelův obrázek jako podklad a kreslit nad ním.
Stejně tak se uživatel může rozhodnout reagovat kresbou na obrázek vložený do
chatu agentem — například na vygenerovaný návrh nebo screenshot z Playwrightu.
Do dalšího požadavku se předává původní obrázek, kreslená anotace i navazující
text, aby agent rozuměl, k čemu se značky vztahují.

Ve fázi první obhajoby postačí ručně nahrané obrázky a kreslené anotace.
Automatické spuštění webového projektu, pořízení screenshotu a jeho využití
agentem přes Playwright patří do rozšířeného rozsahu pro druhou obhajobu.

## Cílový uživatel a pozice produktu

Primárním uživatelem je zkušený vývojář pracující nad vlastním lokálním
projektem. Rozumí zdrojovému kódu, Gitu, terminálu a důsledkům změn; nechce
zjednodušený „vygeneruj mi aplikaci“ nástroj pro laiky, ale schopné, průhledné
a ovladatelné pracovní prostředí. Produkt má agentovi rozšiřovat možnosti,
nikoliv skrývat technické detaily za neprůhledné automatizace. Zároveň má mít
vysokou míru autonomie: zkušený uživatel nemá být nucen běžně psát rutinní kód
ručně, ale musí rozumět a mít kontrolu nad tím, co agent dělá.

## Platforma a distribuce

Školní verze se oficiálně navrhuje, balí a testuje pro Windows 11. Electron je
proto pracovní volba desktopového obalu, zejména kvůli TypeScriptu/Node.js a
integraci s lokálními soubory a procesy. Další desktopové systémy mohou být
později podporované, ale nejsou součástí kritérií MVP ani obhajoby.

## Desktop quality baseline

Školní verze má poskytovat očekávaný základ profesionální Windows aplikace:
trvalá uživatelská nastavení, přemapovatelné klávesové zkratky, světlé/tmavé
barevné schéma, čitelný kontrast, plnohodnotnou klávesovou navigaci, viditelný
focus, omezení rušivých animací a zřetelně srozumitelné chybové i stavové
hlášky. Součástí je spolehlivé ukládání lokálních dat, obnova po pádu a jasně
zobrazený stav agentní relace. Detailní vizuální styl a nadstandardní UI prvky
budou samostatně navrženy pro druhou obhajobu.

## Účet, cloud a synchronizace

Produkt má běžný uživatelský účet a cloudovou vrstvu. Hlavní důvod je
přenositelnost chatů mezi zařízeními; synchronizovat se mohou také uživatelská
nastavení a projektová metadata. API klíče poskytovatelů modelů se však nesmí
bez výslovného návrhu zabezpečení automaticky ukládat do cloudové historie;
výchozí bezpečný směr je jejich lokální úložiště operačního systému.

Přihlášení a účet jsou závaznou součástí školní verze. Synchronizace chatů a
nastavení je prioritní rozšíření, které může zvýšit hodnocení, ale nesmí
ohrozit samostatně funkční lokální agentní jádro ani spolehlivost obhajoby;
pokud by se ukázala jako neúměrně riziková, může být dodána v omezeném rozsahu
nebo dokončena po škole.

**Supabase** je pracovní volba pro autentizaci (včetně OAuth), perzistenci a
pozdější synchronizaci. Relační model se hodí pro uživatele, projekty, chaty,
zprávy a oprávnění; Firebase zůstává jen záložní alternativou, pokud krátké
technické ověření odhalí problém s Electronem nebo potřebným rozsahem. Žádná
cloudová infrastruktura se neprovisionuje, dokud k tomu uživatel nedá souhlas.

Pro cloudově povolený projekt s Git remotem může později existovat explicitní
**handoff snapshot** pro přesun rozpracované práce mezi zařízeními. Obsahuje
identitu chatu, remote, výchozí commit, testovací stav a patch celého
pracovního stromu — tedy jak změny agenta, tak ruční necommitnuté změny
uživatele. Na cílovém zařízení se patch aplikuje jen po ověření kompatibilního
klonu a se zobrazením diffu; při špinavém stromu nebo konfliktu se nesmí nic
automaticky přepsat. Handoff je vědomá akce uživatele, nikoli tichá
synchronizace zdrojového kódu. Před vytvořením se zobrazí rozsah, standardně
se vynechají ignorované a citlivé soubory (např. `.env`) a uživatel může výběr
upravit. Funkce nepatří do první obhajoby.

## První spuštění a projekty

- Při prvním spuštění po instalaci má aplikace nabídnout onboarding pro
  základní nastavení pracovního prostředí.
- Součástí onboardingu je výběr výchozí pracovní plochy. Uživatel si může
  vybrat **Stavitel (B)** s trvale dostupným spodním panelem pro diff, terminál
  a náhled; **Přizpůsobitelný základ (C)** s projektem vlevo, chatem uprostřed,
  inspektorem práce agenta vpravo a spodním pracovním panelem; nebo **Prázdné
  plátno**, na kterém si pokročilý uživatel rozmístí panely zcela sám.
- Všechny režimy jsou pouze výchozí stav: panely lze přesouvat, skrývat,
  připínat a ukládat do vlastních profilů. Výchozí rozložení musí jít vždy
  jedním kliknutím obnovit. Prázdné plátno neznamená chybějící funkce — musí
  nabídnout jasný způsob, jak přidat Chat, Soubory, Aktivitu agenta, Diff,
  Terminál, Náhled nebo Canvas zpět. Zachová minimální globální horní lištu
  s výběrem projektu, přidáním panelu a obnovením rozložení.
- Po onboardingu uživatel pracuje s projekty uloženými v lokálních složkách:
  může existující složku otevřít nebo založit nový projekt.
- Projektová karta/záznam má mít vlastní zobrazované jméno a uživatelské
  označení, alespoň ikonu a barvu. Tyto údaje mají být metadata aplikace, aby
  nezasahovaly do zdrojového kódu ani struktury cizího repozitáře.
- Po běžném spuštění se výchozí domovská pracovní plocha zobrazí jako přehled
  projektových dlaždic. Zároveň obsahuje spodní vstup pro samostatný chat mimo
  konkrétní projekt. Po odeslání zprávy se dlaždice skryjí a plocha se přepne
  do soustředěné konverzace; tato relace není automaticky svázána se soubory
  žádného projektu. Nepřiřazený chat může po splnění pravidel oprávnění používat
  webové vyhledávání, ale bez otevřeného projektu nemá přístup k lokálním
  souborům ani je nemění.
- Uživatel může prostřednictvím uloženého rozložení upravit, co se při startu
  zobrazuje, ale nesmí si snadno odstranit základní navigaci: návrat na domov,
  výběr projektu a obnovení výchozího rozložení musí být vždy dostupné.
- Organizace práce bude **chat-first**: každý projekt obsahuje seznam
  samostatných chatů a každý chat sleduje konkrétní úkol od zadání přes průběh
  nástrojů a změny až po výsledek. V první verzi se nemá vymýšlet vlastní
  komplikovaný systém tasků nad rámec známého modelu coding agentů.

## Oprávnění a míra autonomie agenta

Aplikace nabídne dva pracovní režimy:

1. **Řízený režim:** agent se před citlivější akcí ptá na schválení. Výchozí
   příklady jsou práce mimo kořen otevřeného projektu, webové vyhledávání a
   spouštění bash/příkazů v terminálu. Uživatel si může v nastavení pro příkazy
   vytvořit pravidla pro automatické schválení i automatické zamítnutí.
2. **Auto režim:** klasifikátor rizika vyhodnotí každou akci a požádá uživatele
   jen tehdy, když ji nezvládne vyhodnotit jako bezpečnou. Pevná uživatelská
   pravidla zamítnutí a bezpečnostní hranice mají přednost před klasifikátorem.

Každé automatické i ručně potvrzené rozhodnutí musí být viditelné v průběhu
práce a zapsané do historie s důvodem, aby uživatel mohl chování agenta
kontrolovat. Konkrétní technické řešení klasifikátoru (pravidla, lokální model
nebo kombinace) bude rozhodnuto až podle proveditelnosti a rozsahu MVP.

## Životní cyklus změn kódu

Úpravy souborů uvnitř otevřeného projektu nemají v běžné práci vyžadovat
potvrzení každého jednotlivého zápisu. Po splnění pravidel oprávnění může agent
změny průběžně provádět; aplikace je ukazuje v historii a v diffu. Uživatel má
v každém okamžiku snadno dostupné vrácení změny a po dokončení úkolu dostane
souhrnný diff ke kontrole či konečnému schválení. Návrh musí chránit uživatele
před nevratnou ztrátou práce i při delší agentní relaci.

Git nesmí být podmínkou plnohodnotné agentní práce. Při otevření složky má
aplikace zjistit, zda jde o Git repozitář, a uživateli zřetelně přizpůsobit
postup: v repozitáři může agent pracovat s branchemi, diffy a commity podle
pravidel projektu; mimo Git nabídne ekvivalentní vlastní snapshoty a obnovu
změn. Rozdíl nesmí zhoršit základní schopnost agenta změny provést, ověřit a
vrátit.

## Hlavní hodnoty a funkční pilíře

1. **Vynucené ověřování práce agenta.** Agent nemá změnu jen oznámit; musí
   transparentně ukázat provedené kroky a výsledek kontrol (typy, testy,
   případně později vizuální test Playwrightem). Chyby se vracejí do další
   iterace místo tichého „hotovo“.
2. **Chytrý kontext projektu.** „LLM Wiki“ / repo mapa uchovává stručná
   shrnutí, vazby a pravidla projektu, aby se do modelu neposílal celý
   repozitář. Konkrétní podobu a metodu výběru kontextu je nutné ještě navrhnout
   a vyhodnotit.
3. **Strukturální porozumění TypeScriptu.** Model nečte AST přímo. Vyžádá si
   nástroj, backend přes TypeScript Compiler API nebo `ts-morph` najde symbol,
   reference či typy a modelu vrátí malé strukturované výsledky. Později lze
   ověřit i napojení na LSP/TypeScript language server.
4. **Rozšiřitelnost přes skills a MCP.** Vestavěné pracovní postupy (např.
   brainstorming, plánování, Playwright) a připojitelné MCP servery/skilly.
   Marketplace nebo instalace z GitHub URL je aspirace, nikoli požadavek MVP;
   před automatickou instalací musí být vyřešena bezpečnost a důvěra zdroje.
5. **Silné a srozumitelné GUI.** Přehledné odlišené komponenty, viditelné
   upozornění na akci, diff před zápisem, integrovaný terminál a zrychlené
   spuštění projektu. Inspirací je IKEA efekt: uživatel si může uspořádat
   pracovní plochu nebo zvolit přednastavení. Do budoucna patří i kreslený
   vstup.

## Architektonický jazyk

- **UI / renderer:** chat, průběh práce, diff a schvalování změn, terminál,
  uspořádání pracovních panelů.
- **Orchestrátor:** vlastní stav relace, sestaví kontext, komunikuje s vybraným
  LLM, nabídne schémata nástrojů, řídí smyčku model → nástroj → výsledek a
  zapisuje události. Backend je zdroj pravdy; UI se k němu pouze připojuje.
- **Nástroj:** samostatně popsaná schopnost se vstupním schématem a konkrétní
  implementací (např. čtení souboru, hledání symbolu, spuštění testu). MCP je
  standard pro připojení externích nástrojů; lokální nástroje nemusí být hned
  samostatné MCP servery.
- **Harness:** bezpečné provozní prostředí pro spouštění nástrojů. Validuje
  vstupy, vynucuje oprávnění a timeouty, izoluje procesy, zachycuje stdout,
  stderr a exit code a vrací strukturovaný výsledek orchestrátoru. Harness není
  totéž co registry ani definice nástrojů.
- **Perzistence:** lokální historie a event log pro obnovu stavu po odpojení;
  později může nést stručnou pracovní paměť a LLM Wiki.

## Doporučené pořadí realizace

Nejdřív dodělat malou, spolehlivou a obhajitelnou svislou cestu místo stavby
všech „wow“ funkcí naráz:

1. Electron + React + TypeScript: výběr lokálního projektu, základní chat a
   průběhový panel.
2. Jeden LLM adapter a několik lokálních nástrojů: bezpečné čtení souboru,
   cílená úprava s diffem a explicitní schválení uživatelem.
3. Tool runner s event logem, timeoutem a zobrazeným výsledkem příkazu/testu.
4. Ověřovací smyčka nad TypeScriptem a testy; teprve poté AST/LSP dotazy přes
   `ts-morph`.
5. Repo mapa/LLM Wiki a promyšlená obnova kontextu.
6. Volitelné rozšíření: Playwright vision check, sandbox v Dockeru, více
   providerů/model routing a bezpečně navržený MCP/skills marketplace.

Toto pořadí je návrh pro snížení rizika, ne neměnný školní harmonogram.

## Import a přenositelnost nastavení

Import z jiných coding agentů není součástí školního MVP; je to kandidát pro
pozdější fázi nebo pokračování projektu po škole. Prioritu má ověřovací
prototyp importu MCP konfigurace, protože MCP je přenositelný protokol.
Například Codex Desktop, CLI a IDE rozšíření podle oficiální dokumentace
sdílejí konfiguraci MCP serverů uloženou v `config.toml`, případně v projektu.

Importér nesmí slepě spouštět nebo přebírat cizí konfiguraci. Musí ji načíst,
normalizovat do vlastního formátu, zobrazit uživateli příkazy, URL, proměnné a
oprávnění a vyžádat potvrzení. Import skillů, pluginů a klávesových zkratek z
Codexu, Claude Code či Google Antigravity bude případně řešen samostatnými
adaptéry podle jejich skutečně dostupných formátů; univerzální konverze se
neslibuje bez provedeného technického průzkumu.

## První verze marketplace

Pro první obhajobu má marketplace podobu lokálního, kurátorovaného katalogu
vestavěných skillů a pluginů plus ručního importu uživatelem vybraného souboru
nebo složky s manifestem. Před instalací se zobrazí název, verze, schopnosti a
požadovaná oprávnění. Online publikování, GitHub/URL instalace, aktualizace a
hodnocení zdrojů patří do pozdější fáze, protože vyžadují samostatné řešení
bezpečnosti a důvěryhodnosti.

## Směr demonstrace a obhajoby

- **První obhajoba:** hlavní důkaz hodnoty má být živě pozorovatelná agentní
  smyčka: uživatel zadá malý, konkrétní úkol nad lokálním projektem (např. hra
  šibenice), agent cíleně pracuje s nástroji, ukáže změny a ověří výsledek.
  Ambiciózní „wow“ varianta je nechat agenta za běhu upravit samotnou
  předváděnou aplikaci a nechat změnu projevit přes hot reload.
- Živá ukázka musí mít předem připravený kontrolovaný projekt, limity kroku a
  spolehlivou záložní ukázku stejné funkce pro případ výpadku API, sítě nebo
  nečekaného selhání modelu. Záloha není náhradou implementace, ale součástí
  profesionální prezentace.
- **Druhá obhajoba:** kromě funkčnosti má přesvědčit propracované, originální
  a dobře použitelné UI. Inovativní vstup, například kreslení/skica jako
  podklad pro zadání agenta, je silný kandidát na odlišující rozšíření.

První obhajoba má pokrývat alespoň přibližně 65 % plánované funkčnosti
harnessu, ideálně více: naprostou většinu potřebných tool callů a použitelný
základ pro skilly i pluginy. Procento se nebude posuzovat podle počtu
komponent, ale podle toho, zda agent zvládne celý reálný cyklus analýza →
změna → ověření → prezentace diffu/výsledku → bezpečné vrácení. Mezi první a
druhou obhajobou se těžiště vývoje přesune na výraznější UI a doplňující
funkce.

## Důležitá bezpečnostní a výzkumná pravidla

- Nikdy neukládat API klíče do repozitáře ani do běžného logu událostí.
- Příkazy od agenta nespouštět bez kontroly oprávnění, omezeného pracovního
  adresáře a timeoutu. Automatická instalace cizího MCP/skill repozitáře je
  bezpečnostně citlivá funkce.
- Když je potřeba aktuální cena modelu, limit API, specifikace MCP nebo
  vlastnost cizího nástroje, ověř ji z aktuální primární dokumentace. Starší
  podklady v tomto repozitáři mohou obsahovat neověřené nebo zastaralé údaje.
- Pro obhajobu preferovat demonstraci vlastního problému, vlastního návrhu,
  měřitelných výsledků a konkrétních trade-offů před marketingovými tvrzeními
  nebo neověřenými informacemi o konkurenci.

## Existující podklady

- `Idea Paper Converted.txt` – původní stručný seznam funkcí a rozhodování
  Electron vs. Tauri.
- `Vylepšení AI kódovacího nástroje.md` – předchozí brainstorming, vysvětlení
  AST, návrh rozdělení UI/orchestrátoru/harnessu/nástrojů a ukázková mapa.
- `Analýza alternativních kódovacích nástrojů.md` – rešerše Aideru,
  OpenHands, Continue a MCP; slouží jako inspirace, nikoli jako bezvýhradně
  ověřený zdroj aktuálních technických či cenových údajů.

## Otevřená rozhodnutí

- Název produktu, přesná definice cílového uživatele a věta, která projekt
  prodá komisi.
- Co bude minimum pro první obhajobu a jak se bude objektivně demonstrovat
  přínos oproti běžnému chatu s LLM.
- Electron vs. Tauri; konkrétní databáze, LLM provider a licence.
- Hranice mezi lokálními nástroji, MCP klientem a případným marketplace.
- Jaké akce lze automatizovat a které musí vždy výslovně schválit uživatel.
