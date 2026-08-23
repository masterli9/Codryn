# **Vylepšení AI kódovacího nástroje**

[https://gemini.google.com/app/bc4ab6d50eeab31a](https://gemini.google.com/app/bc4ab6d50eeab31a)

*User prompt: Potřebuju začít hodně přemýšlet nad svým dalším ročníkovým projektem. Asi už jsem to s tebou probíral, ale můj nápad je udělat něco jako google antigravity, ale lepší. Prostě vibe coding nástroj na novém levelu. Z vlastní zkušenosti vím co má antigravity za problémy, např. že ikdyž má model k dispozici spoustu toolů, tak je málo kdy použije, mluvím zejména o kontrole své práce. Chtěl bych do toho přidat koncept llm wiki taky. https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f Co je ještě s antigravity problém je přidávání mcp a skillů. V claude code je to hrozně jednoduché, je tam na to marketplace a když na tom marketplacu nenajdu co hledám, tak tam jen dropnu github repo se skillem a ono se to přidá. Něco takového bych chtěl taky. Slyšel jsem o možnosti přístupu k typescript tsc serveru, aby při kontrole se nespouštěl tsc command ale rovnou si to přistoupilo k tomu, ale nevím jestli to je možné. Bohužel mě nic dalšího new level nenapadá. Zas takovou znalost nemám. A u toho projektu se hodnotí kreativita a originalita a inovace. Takže to asi chce ještě něco. Pojď mi s tímhle pomoct. Nějaký brainstorming pojď udělat. Možná najdi na internetu, redditu, co lidi štve na vibe coding nástrojích a jak se to dá řešit.*

Response: Když se dívám na to hodnocení z tvé obhajoby – mimochodem 99/100 je brutální výsledek – je jasné, že laťka pro maturitní projekt je pekelně vysoko. Dokumentaci a prezentaci máš evidentně v malíčku, ale jestli chceš urvat plný počet i za **Inovaci a řešení problémů** a **Kreativitu** v dalším ročníku, chce to něco víc než jen další wrapper nad OpenAI API.

Tvůj nápad udělat "next-level vibe coding" nástroj s lepším zapojením nástrojů zní skvěle, hlavně když ho postavíš na svém TS/React/Node stacku. Lidi na Redditu a vývojářských fórech u současných nástrojů (jako jsou Cursor, Copilot nebo Windsurf) nejčastěji nadávají na tři věci:

> 1. **Spooky Action at a Distance (Rozbíjení kódu jinde):** AI opraví bug v jedné komponentě, ale tiše rozbije něco jiného na druhé straně aplikace, protože nevidí hluboké závislosti.  
> 2. **Context Rot (Ztráta kontextu):** Nástroje sice mají k dispozici celý repozitář, ale v reálu do promptu nahází hromadu balastu a AI se v tom ztrácí.  
> 3. **Slepá důvěra (Chybějící self-check):** Přesně jak říkáš – model sice nástroje má, ale je líný si kód po sobě spustit a skutečně ho ověřit.

Zde je brainstorming několika "new level" konceptů, které by tvůj projekt mohly posunout na úroveň těch 5/5 za inovaci:

### **1\. Agentic TDD (Vynucený Self-Check)**

Problém "AI nekontroluje svou práci" nevyřešíš tím, že jí do systémového promptu napíšeš "pečlivě to zkontroluj". Musíš to vynutit architektonicky. Můžeš do svého nástroje zabudovat pipeline, kde AI **musí** nejdřív napsat test. Následně vygeneruje kód a tvůj Node backend ho na pozadí spustí proti tomu testu. Dokud to neprojde (a dokud svítí červená), agent nemá dovoleno úkol dokončit a musí ho iterovat. Ty pak v UI jen schvaluješ prokazatelně funkční řešení.

### **2\. Deep TypeScript Compiler API Integrace**

To, cos zmiňoval s tsc serverem, je absolutní "killer feature". Většina AI nástrojů hledá v kódu jako v textu (přes regex nebo embeddings). Pokud napojíš svého agenta přímo na AST (Abstract Syntax Tree) pomocí TypeScript Compiler API, dáš modelu programátorské superschopnosti.

> * Místo toho, aby AI hádala, kde všude se používá interface, dá svému nástroji dotaz přímo do AST a dostane přesný výpis všech referencí i s typy. Tím se drasticky sníží halucinace.

### **3\. Vizuální Feedback Loop (Vision-Check)**

Protože děláš hodně webové rozhraní (např. v Reactu), určitě znáš ten pocit, kdy kód sice projde přes TypeScript, ale UI je úplně rozsypané. Co kdyby tvůj nástroj uměl pomocí Playwrightu vyrenderovat danou komponentu na pozadí, udělat screenshot a poslat ho Vision modelu s otázkou: "Vypadá to tlačítko na mobilní verzi dobře?" To je vibe coding, kde AI *skutečně vidí*, co dělá, a umí ladit CSS/Tailwind na základě zraku, ne jen kódu.

### **4\. Dynamic LLM Wiki (Context Graph)**

Vycházej z Karpathyho nápadu, ale posuň ho dál. Místo statické wiki by si tvůj agent mohl budovat "znalostní graf" repozitáře. Každý soubor by měl na pozadí automaticky generované a průběžně aktualizované shrnutí (co dělá, jaké má architektonické výjimky, proč byl napsán takto). Když pak AI upravuje složitou logiku, tvůj nástroj mu jako kontext nepředhodí jen raw kód, ale i sémantické shrnutí pravidel pro tento typ komponent z LLM Wiki.

### **5\. Zero-Friction MCP Marketplace**

Pro přidávání skillů bys mohl udělat čisté rozhraní – vložíš URL na repozitář s MCP serverem, a tvůj backend si ho stáhne, nainstaluje závislosti a zaregistruje nástroje dynamicky do konverzace. To by z tvého projektu udělalo platformu, ne jen jednoúčelový nástroj.

Tohle všechno zabalené v pěkném rozhraní, kde vývojář neuvidí jen točící se kolečko, ale reálný strukturovaný myšlenkový proces (*"analyzuji AST \-\> píšu test \-\> generuji kód \-\> spouštím tsc \-\> vizuálně kontroluji render"*), by při obhajobě rozhodně zafungovalo.

Který z těch problémů současných vibe coding nástrojů – ať už jde o slepé rozbíjení kódu, ignorování kontextu, nebo zdlouhavé přidávání nových nástrojů – tě při tvé vlastní práci zdržuje a štve úplně nejvíc?

---

*User prompt: Okej to je jako hezký. Ale chci aby ses zamyslel nad tím jestli je to technicky proveditelné. Kromě toho mi přijde že jsi nepoužil web search tool a jenom jsi použil tvoje znalosti, chci aktuálně na co si lidi stěžují. Co myslíš tou pipeline u 1? 3 už bězně existuje, jenom se to nepoužívá pokaždé protože to buď žere moc tokenů nebo je to pomalé. Potřebuju začít mluvit víc technicky. Na čem to budu stavět? Co mě bude stát testing api key na google modely? Jaké jsou vlastně všechny různé části té aplikace a harnessu, které budu muset udělat? Btw budu to celé dělat s claude code, ne manuálně*

Response: Máš absolutní pravdu, omlouvám se – pojďme se podívat na to, co se skutečně děje teď v roce 2026, a rozebrat to víc na dřeň. Projel jsem aktuální diskuze na Hacker News a subredditech (jako r/ClaudeCode a r/VibeCodeDevs) a problémy vývojářů s nástroji jako Cursor, Windsurf nebo i samotným Claude Code jsou v tuto chvíli dost specifické.

### **Aktuální problémy s Vibe Codingem (2026)**

Lidi už si nestěžují jen na to, že "to neumí kódovat". Štve je infrastruktura a správa kontextu:

> * **"Cache Cliffs" a pálení peněz/limitů:** Tohle je obrovské téma. Pokud v dlouhé konverzaci odejdeš na 5 minut pro kafe a agent mezitím usne, vyprší mu na API context cache. Až napíšeš další zprávu, nástroj musí znovu zpracovat celou historii (třeba 100k tokenů). Jeden uživatel dělal audit a zjistil, že 54 % jeho API nákladů šlo na tyhle zbytečné re-loadingy kontextu, protože nástroje neumí chytře pracovat s "idle" stavem.  
> * **Shadow State Deadlocks (Ztráta stavu mezi UI a backendem):** Agent na pozadí čeká na schválení nějaké akce (třeba instalace balíčku nebo smazání souboru), ale v UI spojení mezitím blikne nebo problikne WebSocket. Agent tiše visí, v UI se nic neukáže, a celá session musí být restartována.  
> * **Architektonický šum (Verbose Abstractions):** Lidi si stěžují, že modely vytvářejí zbytečně složité, užvaněné abstrakce. Jakmile projekt roste, agent ignoruje CLAUDE.md nebo jiné systémové instrukce a pro jednoduchou chybu začne stavět složitá schémata a ukládat stavy na disk, místo aby fixnul jeden řádek.

### **Co je to ta "TDD Pipeline" v bodě 1?**

Není to o tom, že do promptu napíšeš "napiš na to test". Jde o **Harness (spouštěcí prostředí)**, který oddělí "myšlení" od "vykonávání". Technicky to znamená:

> 1. **Orchestrator** pošle LLM úkol.  
> 2. LLM přes Tool Call vygeneruje dva soubory (nebo upraví kód a přidá test soubor).  
> 3. Tvůj Node.js backend (ten Harness) zachytí tento Tool Call. **Neukáže to rovnou uživateli.** 4\. Pomocí child\_process.exec (nebo v lepším případě v izolovaném Docker kontejneru, aby ti agent nesmazal OS) spustí např. npx vitest run vygenerovany.test.ts \--run.  
> 4. Backend chytí stdout a stderr. Pokud je exit code 1 (fail), backend automaticky obalí tyhle chybové hlášky do nového JSON payloadu a pošle to jako chybu toolu zpět LLM: *"Tady je stack trace, ten test neprošel, oprav kód."*  
> 5. Tohle rotuje v asynchronní smyčce. Až když je exit code 0, Orchestrator pošle tobě do UI zprávu: *"Úkol dokončen, vše zezelenalo."*

K bodu 3 (Vision): Máš naprostou pravdu, posílat každý render do modelu je pomalé a sežere to mraky tokenů. V praxi se to optimalizuje tak, že se do Vision modelu posílá screenshot *jen* tehdy, pokud nástroj (např. Playwright) detekuje strukturální změnu v DOM stromečku, nebo se vyřízne jen přesný bounding box té dané React komponenty.

### **Z čeho se to bude skládat (Architektura)**

Pokud to budeš buildit pomocí Claude Code, budeš stavět v podstatě tři hlavní vrstvy:

**1\. Frontend (UI):** Nejspíš použiješ React. Tady potřebuješ vyřešit chatovací rozhraní, ale hlavně "Diff Viewer". Když ti agent chce upravit soubor, potřebuješ knihovnu (např. Monaco Editor od Microsoftu), která ti ukáže levý a pravý panel, co se reálně mění, než to schválíš.

**2\. Orchestrator (Server-side):** Node.js backend, který drží logiku.

> * **State Machine:** Musí držet aktuální stav projektu a hlídat tu cache.  
> * **API Client:** Komunikace s modely.  
> * **Context Manager:** Sestavuje prompty. Sem bys mohl napojit ten AST (Abstract Syntax Tree) parser. Když se agent zeptá na funkci, backend přes ts-morph sáhne přímo do TypeScript compileru a vrátí mu jen ty definice, které potřebuje, místo celého souboru.

**3\. Execution Harness / Tooling Server:** To je to prostředí, které sahá na tvůj disk. Zde implementuješ MCP (Model Context Protocol). Bude obsahovat sadu jasně definovaných funkcí (read\_file, write\_file, execute\_command, run\_tests).

### **Kolik budou stát Google modely (Ceník 2026)?**

Google nabízí velkorysý **Free Tier**, kde neplatíš nic, jen seš omezený počtem requestů za minutu (tzv. rate limits) a data se můžou použít pro trénink. Na testování a vývoj by ti to mělo stačit.

Pokud budeš potřebovat vyšší kapacitu nebo budeš řešit "Cache Cliffs" pomocí placeného Context Cachingu (abys ušetřil na obřích promptech), ceny v aktuálním Pay-as-you-go (Tier 1\) ceníku jsou zhruba tyto:

> * **Gemini 2.5 Flash-Lite / 2.0 Flash:** Extrémně levné modely. Cca **$0.10** za 1 milion input tokenů a **$0.40** za 1 milion output tokenů. Ideální na rychlé, malé úkoly (třeba ten automatický checking struktury nebo volání jednoduchých toolů).  
> * **Gemini 2.5 Flash:** Zlatá střední cesta. Cca **$0.30** za 1M input / **$2.50** za 1M output.  
> * **Gemini 2.5 Pro / 3 Pro Preview:** Modely pro nejtěžší logiku (architektura, složitý debugging). Tady už je to **$1.25 až $2.00** za 1M input tokenů a **$10.00 až $12.00** za 1M output tokenů.  
> * **Ukládání do cache:** Platí se hodinovou sazbou za uložené miliony tokenů (většinou mezi $0.50 až $1.00 za milion tokenů za hodinu).

Díky tomu, že budeš kód psát pomocí Claude Code, se můžeš mnohem víc soustředit na to "co" stavíš, než "jak" to napsat v syntaxi. Vymyslet robustní Orchestrator a State Machine je přesně ten typ inženýrského problému, u kterého si AI asistenti jako Claude Code občas lámou zuby, pokud jim nedáš perfektní architektonický návrh.

Jak se díváš na tu integraci TypeScript compileru přes AST? Je to něco, do čeho by ses chtěl ponořit, nebo tě víc láká ten dynamický MCP Marketplace pro snadné přidávání funkcí?

---

*User prompt: Hele, moje technické znalosti těchto nástrojů jsou hodně abstraktní. Potřebuju to popsat mnohem lépe a obsáhleji. Třeba i nějaká vizualizace by pomohla. Potřebuju i vysvětlit jak funguje ten typescript server a to ATS parsování. A jestli je opravdu možné aby si model do toho šahal a jak Jak by se daly vyřešit ty tři problémy co jsi našel?*

Response: Jasně, chápu. Zůstat u abstraktních konceptů nestačí, pokud to máš reálně naprogramovat. Pojďme to rozbít na součástky a podívat se, jak přesně to funguje pod kapotou, na čem to postavíš a jak vyřešíš ty zmiňované problémy.

### **1\. Jak funguje integrace TypeScript Compileru (AST)**

Když LLM čte kód jako obyčejný text (string), je to jako bys hledal slovo ve slovníku tak, že ho čteš od první do poslední stránky. Neefektivní a model se v tom ztratí.

**AST (Abstract Syntax Tree)** je způsob, jakým TypeScript kompilátor vidí tvůj kód. Rozloží text do stromové struktury objektů. Když napíšeš const x \= 5;, kompilátor to vidí jako:

> * VariableDeclaration (Deklarace proměnné)  
  * Identifier (Jméno: "x")  
  * NumericLiteral (Hodnota: 5\)

**Jak do toho model "šahá"?** Model do toho nešahá přímo. Tvůj Node.js backend funguje jako překladatel pomocí knihovny, jako je **ts-morph** (což je skvělý wrapper nad nativním TS Compiler API, velmi doporučuji pro tvůj projekt).

Funguje to v tomto cyklu:

> 1. **Požadavek LLM:** Model si přes Tool Call řekne: *"Potřebuju vědět, jaké parametry bere funkce calculateTotal v souboru cart.ts."*  
> 2. **Zpracování na backendu:** Tvůj Node.js server zavolá ts-morph. Ten načte AST daného souboru, najde uzel (node) s názvem calculateTotal a vytáhne z něj jen to nejnutnější (názvy parametrů a jejich typy).  
> 3. **Odpověď pro LLM:** Backend pošle modelu zpět čistý JSON: {"params": \["items: CartItem\[\]", "discount: number"\]}.

Model díky tomu nečte tisíce řádků balastu, nehalucinuje a přesně ví, co má dělat.

Zde je interaktivní vizualizace, abys lépe pochopil, jak takový AST strom vypadá a co přesně backend vytahuje pro model:

### **2\. Řešení aktuálních problémů Vibe Codingu**

Pokud tyhle tři věci vyřešíš v rámci své maturitní práce, posune to tvůj projekt z kategorie "hezká hračka" do "produkčně připravený nástroj".

#### **Problém A: "Cache Cliffs" (Ztráta kontextu a pálení tokenů)**

Když agent dlouho nic nedělá, API zapomene kontext a při dalším dotazu musíš znovu poslat celý repozitář (což stojí peníze a čas).

> * **Architektonické řešení:** Využij nativní **Context Caching API** (nabízí to Google Gemini i Anthropic). Místo abys posílal všechny soubory znova, nahraješ je do cache na serveru poskytovatele (platí se za to zlomková cena). Tvůj Orchestrator bude mít "Keep-alive" poller, který cache udržuje aktivní po dobu session.  
> * **Shadow Context:** Vytvoř na backendu SQLite databázi, kam si agent průběžně ukládá stručná shrnutí, co právě dělá (např. *"Pracuji na refaktoringu AuthProvideru"*). Když cache přece jen spadne, inicializuješ agenta tímto rychlým shrnutím, ne celým kódem.

#### **Problém B: Shadow State Deadlocks (Ztráta synchronizace mezi UI a backendem)**

UI si myslí, že se něco děje, ale backend už dávno spadl na chybě NPM instalace a agent zamrzl.

> * **Architektonické řešení: Event Sourcing.** Nestav to tak, že UI přímo volá modely. Tvůj Node.js backend musí být "Single Source of Truth". Zaveď architekturu, kde každá akce (LLM myslí, LLM volá tool, tool vrací výsledek) generuje událost (Event).  
> * Frontend přes WebSocket pouze poslouchá tyto události a vykresluje je. Pokud v UI spadne internet a znovu se připojí, backend mu prostě pošle posledních 10 událostí a UI se okamžitě překreslí do správného stavu.

#### **Problém C: Architektonický šum (Verbose Abstractions)**

Modely mají tendenci překombinovat jednoduché problémy, protože chtějí "programovat".

> * **Architektonické řešení: Strict Tool Enforcing (Omezená svoboda).** Nedávej modelu nástroj write\_file, který mu dovolí přepsat celý soubor. Dej mu nástroje typu replace\_ast\_node nebo update\_function\_body.  
> * Zároveň do pipeline přidej **LLM Linter**. Než se vygenerovaný kód dostane k tobě do UI, projde rychlým, levným modelem (např. Gemini Flash-Lite), který má jediný úkol: zkontrolovat, jestli návrh neporušuje pravidla v CLAUDE.md nebo architektonické standardy tvého projektu. Pokud ano, vrátí to hlavnímu agentovi k předělání.

Dává ti ten systém s ts-morph a manipulací AST smysl pro přesnější práci s kódem, nebo bys raději zkusil jít cestou vylepšování toho kontextového cachování?

---

*User prompt: okej zajímavý. Potřeboval bych vidět ale nějakou vizualizaci celé té mé aplikace \- z jakých bloků se skládá, co každý dělá, jak to spolu pracuje, co se k tomu použije za technologie. Potřebuju asi jakýsi obrázek který mi bude fungovat jako mapa aplikac*

Response: Tohle je naprosto logický krok. Než začneš psát první řádku kódu v Claude Code, potřebuješ "high-level" mapu, abys věděl, kam který kousek skládačky patří. Jinak z toho bude hrozný špagetový kód.

Tady je vizualizace toho, jak by tvůj systém měl z architektonického hlediska vypadat:

Pojďme si tu mapu rozebrat na tři hlavní bloky, ze kterých se tvá aplikace bude skládat.

### **1\. Frontend (Uživatelské rozhraní)**

Tohle je to, co vidíš v prohlížeči nebo v Electron aplikaci. Slouží jen a pouze k zobrazování stavu a přijímání tvých příkazů. Neobsahuje žádnou složitou logiku.

> * **Technologie:** React (nebo Next.js), Tailwind CSS.  
> * **Klíčové komponenty:**  
  * **Chat Interface:** Kde si píšeš s agentem.  
  * **Monaco Editor:** Knihovna od Microsoftu (pohání VS Code), kterou použiješ na zobrazení změn. Když ti agent nabídne úpravu kódu, Monaco ti ukáže krásný "Diff" (červeně smazané, zeleně přidané), než to schválíš.  
  * **WebSocket Client:** Udržuje neustálé, obousměrné spojení s backendem. Zajišťuje, že se UI updatuje v reálném čase, aniž bys musel refreshovat stránku.

### **2\. Orchestrator (Backend a "Mozek" aplikace)**

Tohle je centrální uzel. Řídí komunikaci mezi tebou, AI modely a tvým lokálním diskem. Tady řešíš ty problémy s mrtvými stavy (Deadlocks) a ztrátou kontextu.

> * **Technologie:** Node.js, Express/Fastify, WebSocket Server (ws nebo socket.io), SQLite (pro lokální historii).  
> * **Klíčové komponenty:**  
  * **State Machine (Stavový automat):** Srdce backendu. Pamatuje si, co se zrovna děje (např. IDLE, THINKING, WAITING\_FOR\_USER\_APPROVAL, EXECUTING\_TOOL). Tím se vyhneš zamrznutí.  
  * **Context & Cache Manager:** Sestavuje prompt. Bere historii chatu, otevřené soubory a udržuje Google Gemini/Claude Context Cache API, abys neplatil za stejné tokeny pořád dokola.  
  * **Event Router:** Zpracovává události. Když přijde zpráva z LLM "chci zavolat funkci read\_file", Event Router to vezme a předá to dál do Execution Harness.

### **3\. Execution Harness (Nástroje a "Ruce" aplikace)**

Tohle je část, která fyzicky sahá na tvůj kód, parsuje ho a spouští ho. Musí být striktně oddělená, ideálně spouštěná jako samostatný proces, aby chyba v testech neshodila celou aplikaci.

> * **Technologie:** Node.js (Child Processes), ts-morph (pro AST), vitest (pro testování), mcp-sdk (Model Context Protocol).  
> * **Klíčové komponenty:**  
  * **MCP Marketplace / Tool Registry:** Seznam všeho, co agent umí. Sem se dynamicky načítají ty "skilly", o kterých jsi mluvil (např. napojení na Github, čtení logů).  
  * **AST Parser (ts-morph):** Když model potřebuje zjistit strukturu aplikace, zeptá se této komponenty. Ta načte tvůj TypeScript kód, zanalyzuje stromy a vrátí jen čisté definice.  
  * **Test Runner:** Tady žije tvoje TDD pipeline. Přijme kód od modelu, na pozadí ho zkusí zkompilovat (přes tsc) a pustí na něj testy. Výsledek (úspěch/chyba) pošle zpět do Orchestrátoru.  
  * **File System Access:** Bezpečný wrapper nad fs modulem v Node.js, který upravuje soubory na disku.

### **Jak to funguje dohromady (Životní cyklus jednoho dotazu)**

Abychom si to dali do souvislostí, takhle proběhne jeden tvůj požadavek (např. *"Přidej do košíku slevový kód"*):

> 1. **UI:** Napíšeš zprávu do React chatu. Přes WebSocket se odešle na Backend.  
> 2. **Orchestrator:** Přijme zprávu, nabalí na ni kontext (co máš zrovna otevřené za soubory, co už je v cache) a pošle to přes API do Google Gemini / Claude.  
> 3. **LLM:** Model odpoví: *"Potřebuju vidět definici košíku, volám tool get\_ast\_structure('cart.ts')."*  
> 4. **Orchestrator:** Zastaví komunikaci s LLM a pošle příkaz dolů do Execution Harness.  
> 5. **Execution Harness:** ts-morph zanalyzuje cart.ts a pošle zpět typy rozhraní.  
> 6. **Orchestrator:** Pošle tyto typy zpět LLM.  
> 7. **LLM:** Model vygeneruje finální kód a test. Zavolá tool run\_tests\_and\_apply.  
> 8. **Execution Harness:** Spustí testy na pozadí. Projdou. Uloží změny nanečisto.  
> 9. **Orchestrator:** Pošle přes WebSocket zprávu do UI: *"Změny jsou připraveny, čekám na schválení."*  
> 10. **UI:** Zobrazí ti Monaco Editor s Diffem. Ty klikneš na "Approve" a propíše se to doopravdy.

S takovouhle mapou už můžeš klidně otevřít Claude Code a začít skládat. Co z toho bys chtěl začít budovat jako první – zkusíme navrhnout kostru pro ten Node.js Orchestrator, nebo se chceš napřed podívat na to, jak přesně napsat MCP tool pro ten AST parser s ts-morph?

---

*User prompt: to se mi nějak nezdá hele. Není ta harness to, kde jsou definované ty tooly náhodou?*

Response: Máš úplnou pravdu a trefil jsi velmi důležitý architektonický detail. Pojďme to upřesnit, protože v tom popisu jsem to trochu hodil do jednoho pytle.

Je potřeba striktně oddělit dvě věci: **Definici toolu (schéma)** a **Harness (spouštěcí prostředí)**.

### **1\. Kde jsou tooly definované?**

Definice toolů (v moderní architektuře jako je MCP – Model Context Protocol) jsou v podstatě jen **JSON schémata metadata**. Popisují, jak se tool jmenuje, co dělá a jaké parametry přijímá.

Tato schémata musí znát **Orchestrator (Backend)**, protože on je ten, kdo je balí do promptu a posílá je LLM. Model (Gemini/Claude) vidí jen textovou definici:

`{`  
  `"name": "get_ast_structure",`  
  `"description": "Vrátí typy a exporty z TS souboru",`  
  `"input_schema": { ... }`  
`}`

Model na základě toho ví, že tento nástroj existuje a jak ho zavolat. Sám o sobě ale žádný kód nespouští.

### **2\. Co je tedy ten Harness?**

**Harness (v překladu postroj/popruh) je runtime, sandbox nebo bezpečný obal.** Je to kód na tvém backendu, který má na starosti samotnou *exekuci* (vykonání) a zachycení výsledků.

Když model odpoví, že chce použít tool get\_ast\_structure, pošle JSON s parametry. V tu chvíli nastupuje Harness:

> 1. **Izolace:** Harness vezme požadavek a spustí ho v kontrolovaném prostředí (např. jako Node.js child\_process nebo v Docker kontejneru). Proč? Protože nechceš, aby halucinující model spustil kód, který ti smaže pevný disk.  
> 2. **Propojení na reálný svět:** Uvnitř Harnessu běží ta skutečná implementace – např. tvůj skript s ts-morph nebo příkaz pro vitest.  
> 3. **Hlídání chyb (Error Catching):** Harness zachytí stdout, stderr a exit codes. Pokud testovací skript vyhodí chybu, Harness ji nezpůsobí pád celé tvé aplikace, ale elegantně tu chybu zabalí a pošle ji zpět Orchestratoru, který ji předhodí LLM k opravě.

### **Jak to tedy rozdělit v kódu?**

Pokud to budeš psát přes Claude Code, tvá složková struktura na backendu by mohla vypadat takto:

> * /src/orchestrator/ \-\> Řídí stav aplikace, povídá si s Gemini/Claude API, posílá jim JSON schémata toolů.  
> * /src/tools/ \-\> Tady jsou **definice a implementace** jednotlivých funkcí (např. astParser.ts, fileWriter.ts). To jsou ty MCP skilly.  
> * /src/harness/ \-\> Tady je ten **spouštěč**. Třída nebo modul (např. ToolRunner.ts), který vezme jakýkoliv tool ze složky /tools/, spustí ho v izolovaném procesu, hlídá timeouty (aby se agent nezasekl v nekonečné smyčce), loguje co se stalo a bezpečně vrací výsledek.

Takže abych to shrnul: **Tooly (skilly) jsou definované samostatně (ideálně jako MCP servery/funkce), ale Harness je ta infrastruktura, která jim dává bezpečné prostředí ke spuštění, hlídá jejich životní cyklus a odchytává z nich errory.**

Dává to takhle lepší smysl z hlediska čisté architektury?

---

*User prompt: dobře, vygeneruj mi tedy obrázek jak vypadá ta mapa bloků mojí aplikace, s vizualizací toho jak to spolu pracuje a co to dělá*

Response: Tady máš tu slíbenou mapu tvé aplikace. Je to vizuální průvodce celým systémem, který přesně ukazuje, jak spolu jednotlivé bloky, o kterých jsme mluvili, spolupracují.

Když se na obrázek podíváš, uvidíš jasné rozdělení na čtyři hlavní vrstvy:

> 1. **Frontend (UI):** Tady vše začíná. Tvůj React interface (s Monaco Editorem pro Diffy a WebSocket klientem) posílá tvé požadavky a zobrazuje výsledky.  
> 2. **Orchestrator (Backend "Brain"):** Centrální uzel. Řídí stav (IDLE, THINKING, atd.), spravuje kontext (včetně LLM Wiki a Gemini Cache) a směruje události. Právě on komunikuje s Google Gemini API.  
> 3. **Harness & Tooling:** Tady se děje ta bezpečná magie. **Execution Harness** (izolovaný runtime) spouští nástroje, hlídá errory a orchestrates TDD smyčku. Pod ním jsou pak **MCP Tool Implementations** – ty "skilly", jako AST Parser (s ts-morph), Test Runner (vitest), nebo File I/O.  
> 4. **Model & Registry:** Vnější Google Gemini API pro myšlení a lokální **MCP Tool Registry**, kam si agent sahá pro schémata toolů, které umí použít.

Šipky ti krásně ukazují ten cyklus: Pošleš zprávu \-\> Orchestrator nabalí kontext \-\> LLM si řekne o tool \-\> Harness ho bezpečně spustí \-\> Výsledek jde zpět LLM \-\> LLM iteruje, dokud to není hotové \-\> Orchestrator ti v UI ukáže výsledek k approve.

Tuhle mapu můžeš klidně vytisknout a mít ji před sebou, až otevřeš Claude Code. Kterou z těch oranžových krabiček – Tool Implementations (třeba ten AST parser) nebo Execution Harness (izolovaný runner) – se pustíš budovat jako první?

---

*User prompt: víš co, zkus to znovu, lépe, akorát místo generování obrázku mi to hoď do html*

Response: Tady je ta mapa přepsaná do čistého HTML a CSS. Tento formát je mnohem praktičtější, protože si ho můžeš zkopírovat, hodit do prohlížeče a postupně si ho upravovat, jak budeš architekturu ladit.

Rozdělil jsem to do přehledného Grid layoutu, kde je jasně vidět tok dat od uživatele až po lokální soubory. Návrh přímo počítá s využitím Node.js a TypeScriptu na backendu a Reactu na frontendu.

Zkopíruj si tento kód a ulož ho jako .html soubor:

`<!DOCTYPE html>`  
`<html lang="cs">`  
`<head>`  
    `<meta charset="UTF-8">`  
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">`  
    `<title>Next-Level Vibe Coding System Map</title>`  
    `<style>`  
        `:root {`  
            `--bg-color: #0f172a;`  
            `--text-color: #e2e8f0;`  
            `--ui-bg: #1e3a8a;`  
            `--ui-border: #3b82f6;`  
            `--orch-bg: #064e3b;`  
            `--orch-border: #10b981;`  
            `--harness-bg: #78350f;`  
            `--harness-border: #f59e0b;`  
            `--tool-bg: #4c1d95;`  
            `--tool-border: #8b5cf6;`  
            `--external-bg: #334155;`  
        `}`

        `body {`  
            `font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;`  
            `background-color: var(--bg-color);`  
            `color: var(--text-color);`  
            `margin: 0;`  
            `padding: 2rem;`  
            `display: flex;`  
            `flex-direction: column;`  
            `align-items: center;`  
        `}`

        `h1 {`  
            `color: #fff;`  
            `margin-bottom: 2rem;`  
        `}`

        `.architecture-grid {`  
            `display: grid;`  
            `grid-template-columns: 250px 350px 250px;`  
            `gap: 20px;`  
            `max-width: 1000px;`  
        `}`

        `/* Společné styly pro hlavní bloky */`  
        `.block {`  
            `border-radius: 8px;`  
            `padding: 15px;`  
            `border: 2px solid;`  
            `box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);`  
        `}`

        `.block-title {`  
            `font-weight: bold;`  
            `font-size: 1.1rem;`  
            `margin-bottom: 15px;`  
            `text-align: center;`  
            `border-bottom: 1px solid rgba(255, 255, 255, 0.2);`  
            `padding-bottom: 10px;`  
        `}`

        `.component {`  
            `background: rgba(0, 0, 0, 0.2);`  
            `border-radius: 4px;`  
            `padding: 10px;`  
            `margin-bottom: 10px;`  
            `font-size: 0.9rem;`  
        `}`

        `/* Specifické barvy */`  
        `.frontend {`  
            `background-color: var(--ui-bg);`  
            `border-color: var(--ui-border);`  
            `grid-column: 1;`  
            `grid-row: 1 / 3;`  
        `}`

        `.orchestrator {`  
            `background-color: var(--orch-bg);`  
            `border-color: var(--orch-border);`  
            `grid-column: 2;`  
            `grid-row: 1;`  
        `}`

        `.harness {`  
            `background-color: var(--harness-bg);`  
            `border-color: var(--harness-border);`  
            `grid-column: 2;`  
            `grid-row: 2;`  
        `}`

        `.mcp-tools {`  
            `background-color: var(--tool-bg);`  
            `border-color: var(--tool-border);`  
            `grid-column: 3;`  
            `grid-row: 2;`  
        `}`

        `.external-api {`  
            `background-color: var(--external-bg);`  
            `border-color: #64748b;`  
            `grid-column: 3;`  
            `grid-row: 1;`  
        `}`

        `.project-files {`  
            `background-color: var(--external-bg);`  
            `border-color: #64748b;`  
            `grid-column: 2 / 4;`  
            `grid-row: 3;`  
            `text-align: center;`  
        `}`

        `/* Komponenty uvnitř bloků */`  
        `.comp-title {`  
            `font-weight: bold;`  
            `display: block;`  
            `margin-bottom: 4px;`  
            `color: #fff;`  
        `}`

        `.comp-desc {`  
            `font-size: 0.8rem;`  
            `color: #cbd5e1;`  
        `}`

        `/* Vazby (textové šipky pro kontext) */`  
        `.flow-text {`  
            `font-size: 0.75rem;`  
            `color: #94a3b8;`  
            `text-align: center;`  
            `margin: 5px 0;`  
            `font-style: italic;`  
        `}`  
    `</style>`  
`</head>`  
`<body>`

    `<h1>Architektura Vibe Coding Nástroje</h1>`

    `<div class="architecture-grid">`  
          
        `<!-- UI -->`  
        `<div class="block frontend">`  
            `<div class="block-title">Frontend (UI)</div>`  
            `<div class="flow-text">React / Next.js</div>`  
              
            `<div class="component">`  
                `<span class="comp-title">Chat Interface</span>`  
                `<span class="comp-desc">Komunikace s agentem, zadávání promptů.</span>`  
            `</div>`  
            `<div class="component">`  
                `<span class="comp-title">Monaco Editor (Diff Viewer)</span>`  
                `<span class="comp-desc">Vizuální kontrola změn kódu před schválením.</span>`  
            `</div>`  
            `<div class="component">`  
                `<span class="comp-title">WebSocket Client</span>`  
                `<span class="comp-desc">Naslouchá událostem z backendu (Event Sourcing) v reálném čase.</span>`  
            `</div>`  
            `<div class="flow-text">↓ Odesílá WebSockety →</div>`  
        `</div>`

        `<!-- Brain -->`  
        `<div class="block orchestrator">`  
            `<div class="block-title">Central Orchestrator</div>`  
            `<div class="flow-text">Node.js (Stav a logika)</div>`

            `<div class="component">`  
                `<span class="comp-title">State Machine</span>`  
                `<span class="comp-desc">Řídí stavy (IDLE, THINKING, WAITING). Zabraňuje uvíznutí.</span>`  
            `</div>`  
            `<div class="component">`  
                `<span class="comp-title">Context & Cache Manager</span>`  
                `<span class="comp-desc">Sestavuje prompty, udržuje LLM Wiki strukturu a řeší Context Caching (Gemini API).</span>`  
            `</div>`  
            `<div class="component">`  
                `<span class="comp-title">Event Router</span>`  
                `<span class="comp-desc">Směruje Tool Cally z LLM do Harnessu a vrací výsledky.</span>`  
            `</div>`  
            `<div class="flow-text">↓ Předává Tool Cally do bezpečného prostředí ↓</div>`  
        `</div>`

        `<!-- LLM API -->`  
        `<div class="block external-api">`  
            `<div class="block-title">Google Gemini API</div>`  
            `<div class="flow-text">Externí modely</div>`  
            `<div class="component">`  
                `<span class="comp-title">Reasoning & Generation</span>`  
                `<span class="comp-desc">Zpracovává kód, rozhoduje o použití toolů.</span>`  
            `</div>`  
            `<div class="flow-text">← Posílá Tool Cally / Čeká na výsledek</div>`  
        `</div>`

        `<!-- Safe Run -->`  
        `<div class="block harness">`  
            `<div class="block-title">Execution Harness</div>`  
            `<div class="flow-text">Bezpečný spouštěč (Child Process)</div>`

            `<div class="component">`  
                `<span class="comp-title">Tool Runner</span>`  
                `<span class="comp-desc">Izolovaně spouští MCP skilly, hlídá timeouty.</span>`  
            `</div>`  
            `<div class="component">`  
                `<span class="comp-title">TDD / Error Catcher</span>`  
                `<span class="comp-desc">Odchytává stdout/stderr a vrací je v JSONu při selhání. Neumožní pád aplikace.</span>`  
            `</div>`  
        `</div>`

        `<!-- Skills -->`  
        `<div class="block mcp-tools">`  
            `<div class="block-title">MCP Tool Implementations</div>`  
            `<div class="flow-text">Definice skillů a logika</div>`

            `<div class="component">`  
                `<span class="comp-title">AST Parser (ts-morph)</span>`  
                `<span class="comp-desc">Vyhledává definice typů bez nutnosti číst celý soubor.</span>`  
            `</div>`  
            `<div class="component">`  
                `<span class="comp-title">Test Runner (Vitest)</span>`  
                `<span class="comp-desc">Validuje, že generovaný kód nerozbil zbytek aplikace.</span>`  
            `</div>`  
            `<div class="component">`  
                `<span class="comp-title">File I/O</span>`  
                `<span class="comp-desc">Kontrolovaný zápis a čtení z disku.</span>`  
            `</div>`  
        `</div>`

        `<!-- Target -->`  
        `<div class="block project-files">`  
            `<div class="block-title">Lokální Souborový Systém (Kód projektu)</div>`  
        `</div>`

    `</div>`

`</body>`  
`</html>`

Když teď vidíš tu strukturu před sebou jako kód a jasně rozdělené bloky, přijde ti logičtější začít stavět odspodu – tedy napsat ten izolovaný Execution Harness – nebo chceš nejdřív rozchodit tu základní obousměrnou komunikaci přes WebSockety mezi React Frontendem a Orchestratorem?

---

*User prompt: co všechno potřebuju vlastně udělat/nastudovat, než začnu na tom pracovat?*

Response: Abys tohle postavil a neskončil s nepřehledným a nefunkčním kódem, musíš si před samotným programováním nastudovat a prakticky vyzkoušet několik specifických konceptů. Spoléhat se na to, že architekturu vymyslí a udrží Claude Code za tebe, u takto komplexního systému nebude fungovat.

Zde je seznam toho, co je potřeba zpracovat:

### **1\. Specifikace Model Context Protocol (MCP)**

> * Musíš přesně pochopit, jak MCP standardizuje komunikaci mezi LLM a lokálním prostředím.  
> * Nastuduj si oficiální dokumentaci a zaměř se na JSON-RPC formát, kterým se tooly definují (jejich metadata a schémata) a jak probíhá lifecycle volání (request/response).

### **2\. Práce s AST přes ts-morph nanečisto**

> * Než začneš psát MCP tool pro parser, musíš pochopit abstrakci kódu.  
> * Vytvoř si bokem prázdný projekt a napiš jednoduchý Node.js skript. Úkol: načti libovolný TypeScript soubor, najdi v něm pomocí ts-morph konkrétní třídu nebo funkci a vyextrahuj její parametry a návratové typy do JSONu. Dokud nepochopíš navigaci v Abstract Syntax Tree, nebudeš schopen Claude Code správně navigovat při tvorbě tohoto nástroje.

### **3\. Node.js Child Processes a správa procesů**

> * Tvůj Execution Harness bude spouštět kód a testy izolovaně. Nastuduj si modul child\_process.  
> * Zjisti, jaký je rozdíl mezi funkcemi exec a spawn.  
> * Nauč se číst data ze stdout a stderr pomocí streamů, abys mohl průběžně zachytávat chyby kompilátoru nebo testů.  
> * Vyřeš, jak bezpečně ukončit (kill) proces, který se dostane do nekonečné smyčky, a jak implementovat hard timeouty.

### **4\. Specifika Google Gemini API**

> * V dokumentaci k Gemini API (nebo API modelu, který finálně zvolíš) se zaměř na sekci **Function Calling** (Tool Use). Musíš vědět, v jakém formátu model vrací požadavek na spuštění toolu a jak mu musíš vrátit výsledek, aby pokračoval v generování.  
> * Nastuduj si **Context Caching API**. Zjisti, jak se technicky zakládá session, jak se tam nahrává statický obsah (otevřené soubory) a jaké to má limity a expirace.

### **5\. Event-Driven architektura a State Machines**

> * Orchestrator nesmí být jen sekvence asynchronních if/else podmínek. Nastuduj si, jak fungují stavové automaty (State Machines).  
> * Musíš definovat jasné stavy (např. IDLE, GENERATING, EXECUTING\_TOOL, AWAITING\_USER) a události, které spouští přechod mezi nimi.  
> * Zjisti, jak správně broadcastovat tyto události přes WebSocket klientovi v Reactu tak, aby se frontend jen překresloval podle aktuálního stavu backendu.

### **6\. Architektonický kontext pro AI**

> * Před napsáním prvního řádku kódu musíš vytvořit tvrdá pravidla pro LLM.  
> * Sepiš detailní architektonický dokument (např. CLAUDE.md do rootu projektu). V něm striktně definuj pravidla oddělení Orchestrátoru a Harnessu, popiš datové toky a zakaž modelu míchat exekuční logiku do komunikační vrstvy.

Chceš začít tím, že si bokem zkusíš napsat ten izolovaný AST parser přes ts-morph, nebo raději začneš studiem dokumentace k API a definováním datových struktur pro Orchestrator?

---

