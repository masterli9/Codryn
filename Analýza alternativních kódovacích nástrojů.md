# **Komplexní analýza trhu autonomních kódovacích asistentů: Architektury, integrace modelů a strategické příležitosti pro originální vývoj**

## **Vývoj paradigmatu AI softwarového inženýrství**

Vývoj nástrojů pro podporu programování s využitím umělé inteligence prošel dramatickou transformací, která překonala dřívější koncepty statického doplňování kódu (autocomplete). V roce 2026 se průmysl plně orientuje na autonomní agentní systémy schopné samostatně analyzovat rozsáhlé repozitáře, formulovat plány, provádět komplexní modifikace a interagovat s terminálem. Tento přechod byl umožněn nejen vylepšením samotných velkých jazykových modelů (LLM), ale především inovacemi na úrovni architektur – jmenovitě implementací izolovaného spouštění kódu, pokročilého mapování kontextu a standardizací protokolů pro integraci externích nástrojů.  
Trh je v současnosti vysoce saturovaný, avšak fragmentovaný. Existuje široké spektrum nástrojů, od komerčních platforem pevně spjatých s konkrétním vývojovým prostředím (IDE) až po nezávislé open-source frameworky s maximální flexibilitou. Znalost těchto architektur je absolutně nezbytná pro identifikaci tržních mezer a pro zajištění originality jakéhokoliv nově vyvíjeného systému. Analýza existujících chybových módů navíc ukazuje, že samotný jazykový model je často méně důležitý než orchestrální vrstva (scaffolding), která jej řídí.

## **Architektury a open-source ekosystém: Zdroje pro studium a adaptaci**

Pro vývoj nového kódovacího nástroje nabízí současný open-source ekosystém neocenitelnou studnici vzorů, ze kterých lze čerpat (či je přímo adaptovat na základě svobodných licencí). Hlavní existující alternativy řeší problémy porozumění kódu a jeho bezpečné modifikace radikálně odlišnými způsoby.

### **Aider: Terminálová orchestrace a strukturální reprezentace repozitáře**

Aider představuje jeden z nejvyspělejších open-source kódovacích nástrojů zaměřených na interakci z příkazového řádku (CLI). Jeho architektura je úmyslně nezávislá na konkrétním vývojovém prostředí a celou svou funkčnost, včetně plné integrace se systémem Git, realizuje bez potřeby grafického rozhraní1. Každou změnu vygenerovanou umělou inteligencí Aider automaticky zapisuje formou standardizovaných commitů, jejichž popisy generuje menší, tzv. "weak model" optimalizovaný na cenu1.  
Zásadní inovací Aideru, která jej odlišuje od starších systémů, je absence vektorového vyhledávání (RAG) pro pochopení kontextu. Kódovací agenti opustili vektorový RAG, protože vyhledávání v kódu vyžaduje strukturální přesnost, nikoliv pouze sémantickou podobnost4. Aider místo toho využívá technologii Tree-sitter pro vytvoření abstraktních syntaktických stromů (AST). Tento proces parsuje každý soubor v repozitáři, extrahuje signatury funkcí, definice tříd a názvy symbolů4. Vzniklá "mapa repozitáře" (repo map) je následně hodnocena algoritmem vycházejícím z principů PageRanku, který identifikuje nejdůležitější a nejčastěji volané uzly v kódu. LLM tak získává kompaktní a vysoce relevantní přehled o architektuře bez nutnosti vkládat do kontextu statisíce řádků kódu4. Tento repomap představuje ideální open-source komponentu pro studium a případnou integraci do vlastních projektů2.  
Dalším specifickým rysem Aideru je flexibilní systém formátování úprav (edit formats), který dynamicky přepíná komunikační protokol podle schopností připojeného LLM, aby se minimalizovala spotřeba tokenů a maximalizovala přesnost.

| Formát úpravy (Edit Format) | Popis mechanismu a ideální využití |
| :---- | :---- |
| **whole** | Model vrací plnou kopii upraveného souboru. Energeticky a finančně náročné, avšak vysoce spolehlivé pro slabší modely nebo velmi krátké soubory2. |
| **diff** (výchozí) | Využívá bloky SEARCH/REPLACE simulující řešení konfliktů v Gitu. Extrémně efektivní formát pro cílené úpravy, podporovaný většinou moderních modelů2. |
| **udiff** | Modifikovaný unified diff formát. Původně navržen pro modely rodiny GPT-4 Turbo za účelem eliminace tzv. "líného kódování", kdy modely vynechávaly existující kód pod komentáři typu "zbytek kódu zde"1. |
| **diff-fenced** | Varianta formátu diff, kde je cesta k souboru umístěna uvnitř bloku s kódem. Optimalizováno primárně pro modely Google Gemini a některé open-source modely, které selhávají při standardním formátování bloků1. |
| **architect** | Dvouprůchodový systém: první model (architekt) definuje kroky refaktorizace v přirozeném jazyce, druhý model (editor) generuje exaktní diff. Vhodné pro komplexní úpravy2. |

### **OpenHands: Kontejnerizace a bezpečné spouštění kódu**

Zatímco Aider operuje přímo na lokálním souborovém systému, open-source framework OpenHands (dříve OpenDevin) řeší kritický problém, kterému dříve nebo později čelí každý tvůrce autonomního nástroje: riziko spuštění škodlivého nebo destruktivního kódu vygenerovaného umělou inteligencí. OpenHands definuje rozhraní agent-prostředí formou událostního toku (event-stream), který simuluje cyklus vnímání a akce (perception-action loop) lidského vývojáře8.  
Architektura OpenHands izoluje provádění jakéhokoliv kódu do samostatného kontejneru Docker. Tento sandboxing zaručuje, že agent manipuluje pouze s dedikovaným souborovým systémem a využívá nezávislý operační systém Linux, přičemž do hostitelského stroje komunikuje primárně prostřednictvím SSH8. Pro nasazení do produkce framework umožňuje striktní politiky, jako je odříznutí síťového provozu (SANDBOX\_NETWORK\_DISABLED=true) pro zabránění exfiltrace dat a bezpečnou injekci přístupových tokenů bez jejich zápisu do konfigurace9.  
Verze V1 tohoto frameworku přinesla radikální architektonickou optimalizaci. Z původního monolitického návrhu se OpenHands vyvinul v modulární SDK, které funguje "stateless" (bezstavově) jako výchozí stav. Veškerý stav konverzace je držen v jediném, snadno rekonstruovatelném objektu protokolu událostí10. Základní smyčka odděluje moduly nástrojů do tří striktních komponent: Akce (Action \- s validací přes Pydantic schéma), Exekuce (Execution \- fyzické provedení v sandboxu) a Pozorování (Observation \- zachycení výsledku pro LLM)10. Pro vývojáře, který tvoří nový systém, nabízí OpenHands cennou ukázku toho, jak implementovat abstrakci sandboxu. Místo psaní vlastního řešení lze kontejnerizační logiku OpenHands přímo využít jako spouštěcí backend přes API11.

### **Continue.dev: Konfigurovatelnost v kontextu IDE**

Třetím klíčovým přístupem k vývoji kódovacích asistentů je integrace přímo do editorů, jako je VS Code či JetBrains, což reprezentuje open-source projekt Continue.dev12. Oproti izolovaným agentům je tento nástroj postaven na naprosté transparentnosti vůči vývojáři a na možnosti jemného ladění přes konfigurační soubory (config.json nebo modernější config.yaml)12.  
Tento přístup zavádí koncept poskytovatelů kontextu (Context Providers), které umožňují uživateli explicitně nasměrovat pozornost LLM na konkrétní vrstvy projektu. Kognitivní zátěž modelu se tak snižuje, protože neanalyzuje celý repozitář, ale pouze to, co vývojář označí.

| Poskytovatel kontextu v Continue.dev | Funkce a význam pro architekturu asistentů |
| :---- | :---- |
| **@File** a **@Code** | Reference celých souborů, nebo specifických AST uzlů (tříd a funkcí)14. |
| **@Git Diff** | Prediktivní analytika probíhajících změn před provedením commitu15. |
| **@Tree** | Vizualizace struktury repozitáře pro pochopení globální architektury15. |
| **@Terminal** a **@Debugger** | Zpřístupnění chybových hlášení, zásobníků volání (stack traces) a obsahu lokálních proměnných z debuggeru VS Code15. |
| **@HTTP** | Custom webhook, který na dotaz vrací JSON formátovaný kontext z firemních systémů14. |

Kromě toho framework zavádí "Slash Commands" (např. /cmd pro překlad jazyka do bash příkazu nebo /issue pro automatické generování tiketů na GitHubu)14. Pro týmovou spolupráci představuje tento model ideální paradigma – konfigurační soubory s vlastními příkazy lze sdílet přímo v Gitu, což zajišťuje, že celý tým sdílí stejné systémové výzvy (prompts) a procesy13.

## **Standardizace integrace prostřednictvím Model Context Protocol (MCP)**

Jakákoliv nová alternativa ke stávajícím nástrojům musí nevyhnutelně vyřešit problém komunikace agenta s vnějším světem. Do konce roku 2024 čelili vývojáři "M × N problému": pokud existovalo M jazykových modelů a N podnikových nástrojů, bylo nutné napsat a udržovat obrovské množství proprietárních API konektorů16.  
Tento problém zcela odstranil Model Context Protocol (MCP). Vydaný v listopadu 2024 společností Anthropic a následně předaný nadaci Linux Foundation (Agentic AI Foundation) v prosinci 2025, se MCP stal nepsaným zákonem pro agentní architektury16. Funguje jako pomyslné "USB-C pro umělou inteligenci", které redukuje složitost na M \+ N. Architektura sestává z klienta (MCP Host/Client), který tvoříte, a serveru (MCP Server), který udržuje poskytovatel služby17. Nástroje jako Roo Code a Goose dnes staví celou svou prodejní argumentaci právě na nativní podpoře tohoto standardu20.  
MCP servery vystavují své schopnosti přes JSON-RPC 2.0 nad protokoly STDIO (pro lokální procesy) nebo Streamable HTTP, a to prostřednictvím tří hlavních stavebních kamenů:

> 1. **Nástroje (Tools):** Spustitelné funkce vyžadující souhlas k exekuci, jako je modifikace databáze nebo vytvoření PR16.  
> 2. **Zdroje (Resources):** Datové zdroje pouze pro čtení poskytující kontext, např. logy nebo podnikové dokumentace16.  
> 3. **Výzvy (Prompts):** Předem definované instrukční šablony sjednocující chování agenta pro specifické rutiny16.

**Bezpečnostní rizika MCP:** Ačkoliv MCP definuje OAuth 2.1 autentizační procesy (přidané ve specifikaci v březnu 2025\)17, objevila se závažná rizika. Analytické studie tisíců open-source MCP serverů z roku 2026 ukázaly, že 7,2 % z nich obsahuje vážné zranitelnosti a 5,5 % podléhá hrozbě "tool poisoning" (kdy zlomyslná odpověď externího nástroje dokáže unést řídicí tok agenta). Zdokumentovány byly i kritické chyby typu CVE-2025-6514 v základních npm balíčcích protokolu17. Pokud má být nový projekt originální a spolehlivý, implementace vrstvy hloubkové verifikace návratových hodnot z MCP serverů poskytuje obrovskou konkurenční výhodu.

## **Anatomie giganta: Analýza uniklého zdrojového kódu Claude Code**

Pro návrh skutečně originálního nástroje, který přesahuje možnosti běžných open-source frameworků, je klíčové pochopit interní mechanismy těch nejvyspělejších proprietárních systémů na trhu. Tuto jedinečnou možnost poskytla bezprecedentní událost ze dne 31\. března 2026, kdy společnost Anthropic omylem zveřejnila kompletní zdrojový kód svého vlajkového CLI asistenta, Claude Code25.

### **Mechanismus úniku a bezpečnostní hrozby**

Tento únik nebyl výsledkem sofistikovaného kybernetického útoku, nýbrž triviální chyby v procesu sestavování softwaru. Při publikaci balíčku @anthropic-ai/claude-code verze 2.1.88 do veřejného registru npm nebylo správně nastaveno vyloučení určitých souborů (např. přes .npmignore). Běhové prostředí Bun tak automaticky vygenerovalo a přibalilo "source map" soubor (.map) o velikosti 59,8 MB25. Tyto mapy běžně slouží k trasování chyb z produkčního (minifikovaného) kódu zpět k původním souborům. Pole sourcesContent v tomto konkrétním JSON souboru však obsahovalo naprosto veškerý, čistý, 100% neobfuskovaný zdrojový kód v jazyce TypeScript25.  
Z hlediska dostupnosti je kód stále široce analyzovatelný. I přes masivní vlnu žádostí o stažení na základě DMCA byl kód během hodin zrcadlen v desítkách tisíc repozitářů na platformě GitHub a přepisován do jazyků jako Rust a Python25. Dnes jej lze nalézt ve formě neoficiálních, reverzně zkonstruovaných archivů pro výzkumné účely (např. repozitáře claude-code-sourcemap od vývojářů jako ChinaSiro či tanbiralam)28.  
**Kritické varování pro výzkum:** Uživatelé pátrající po tomto kódu jsou vystaveni extrémnímu riziku útoků založených na dodavatelském řetězci (supply chain attacks). Kyberzločinci okamžitě zaplavili vyhledávače a GitHub podvrženými archivy tvářícími se jako "unlocked" verze zdrojových kódů. Bezpečnostní experti ze Zscaler ThreatLabz identifikovali populární forky obsahující zip archivy s názvem Claude Code \- Leaked Source Code (.7z). Ty ukrývaly škodlivý spouštěč ClaudeCode\_x64.exe napsaný v Rustu, který tiše instaloval malware Vidar v18.7 a proxy nástroj GhostSocks, určené ke krádeži citlivých dat vývojářů25. Stahování či exekuce těchto forků vyžaduje hloubkovou izolaci, jelikož se nejedná o formální, prozkoumaný open source25.

### **Architektura a utajované systémy Claude Code**

Rozsah úniku – přes 512 000 řádků kódu a zhruba 1 900 souborů – odhalil architektonické vzory, které definují současnou technologickou špičku25. Nástroj využívá běhové prostředí Bun pro maximální výkon, komponentní model React (skrze knihovnu Ink) pro renderování rozhraní v terminálu a robustní systém desítek vestavěných nástrojů28. Vývojářská praxe "Parallel Prefetch" ukázala, že pro minimalizaci latence při spouštění asistent na pozadí asynchronně ověřuje tokeny v klíčence macOS a navazuje API spojení ještě před samotným načtením těžkých logických vrstev systému28.  
Níže jsou uvedeny vybrané nástroje, které Claude Code používá k autonomní práci v repozitářích:

| Kategorie Nástrojů | Klíčové implementace z úniku Claude Code |
| :---- | :---- |
| **Operace se soubory** | FileReadTool (včetně analýzy PDF a obrázků), FileWriteTool, FileEditTool (částečné modifikace a nahrazování stringů) |
| **Vyhledávání a abstrakce** | GrepTool (poháněný ripgrep enginem), GlobTool, ToolSearchTool (dynamické zjišťování dostupných akcí) |
| **Správa pracovních postupů** | BashTool (exekuce shellu), NotebookEditTool (Jupyter), EnterWorktreeTool (izolace Git větví pro bezpečné úpravy) |
| **Agentní orchestrace** | AgentTool (spouštění sub-agentů), TeamCreateTool / TeamDeleteTool (paralelní multiprocesní řešení), SendMessageTool |
| **Integrace 3\. stran** | MCPTool (volání serverů MCP), LSPTool (přímá vazba na Language Server Protocol editoru), WebFetchTool |

Nejdůležitější objevy ovšem spočívají v neviditelných mechanismech, které zajišťují plynulý chod agenta a eliminují prodlevy, což představuje masivní prostor pro integraci do navrhovaného ročníkového projektu:

> 1. **Klasifikátor YOLO (Automatické schvalování oprávnění):** Namísto toho, aby asistent čekal na potvrzení každého bezpečnostního oprávnění od uživatele, nebo musel volat drahé LLM k analýze rizika akce, integruje Claude Code dedikovaný, malý klasifikátor založený na strojovém učení (interně nazvaný "YOLO classifier"). Tento model běží v transkriptu konverzace, detekuje míru rizika ("LOW", "MEDIUM", "HIGH") a při vyhodnocení bezpečnosti povolí exekuci nástroje ("Auto Mode" nebo "AFK Mode"). Tento klasifikátor je schopen zpracovat 91,5 % bezpečných akcí zcela bez latence, s chybovostí (false positive) pod 0,4 %30. Implementace lokálního ML modelu pro schvalování exekucí by činila jakýkoli nový kódovací nástroj vysoce originálním.  
> 2. **Systém snění (Dream System):** Jde o subsystém navržený k boji proti degradaci kontextu a zapomínání během dlouhodobých projektů. Má třístupňový spouštěč (uplynutí 24 hodin, dokončení více než pěti relací, a absence zámků na konsolidaci). Když vývojář opustí terminál, agent v offline režimu analyzuje uplynulé konverzace, komprimuje paměťové vektory a uspořádává získané znalosti o specifikách repozitáře30.  
> 3. **KAIROS a asynchronní činnost na pozadí:** Skrytý démon KAIROS operuje paralelně s uživatelem. Kontroluje repozitář na pozadí pomocí 15sekundových cyklů ("background tick prompts"), přijímá webhooky z pull requestů a reaguje s extrémně krátkými zprávami (režim "Brief output mode"). Modul využívá speciální nástroje jako PushNotification28.  
> 4. **Undercover Mode:** Tento režim automaticky odstraňuje jakoukoliv identifikaci umělé inteligence (včetně řádků typu Co-Authored-By) z vytvářených úprav, pokud repozitář neodpovídá internímu seznamu schválených adres. Tento prvek jasně dokazuje, že firmy implementují systémy pro "anonymní" kódování do veřejných projektů, a vyvolává vážné otázky ohledně integrity open-source ekosystému30.

## **Výběr LLM pro testování s důrazem na optimalizaci nákladů**

Vytvoření vysoce kvalitního agenta vyžaduje integraci jazykového modelu, který disponuje schopností hlubokého logického uvažování, avšak jehož provozní náklady nezruinují rozpočet během ladění smyček. Květen 2026 představuje zlom, kdy dominanci nejdražších modelů (jako Claude Opus nebo GPT-5) úspěšně nabourávají cenově mimořádně dostupné (případně zcela bezplatné) modely34.  
Následující tabulka a analýza identifikuje ideální kandidáty pro integraci do vyvíjeného projektu na základě nákladů za milion tokenů, délky kontextového okna a praktických zkušeností.

| Model / Architektura | Poskytovatel | Vstup / Výstup ($ za 1M tokenů) | Kontext | Zhodnocení pro agentní vývoj |
| :---- | :---- | :---- | :---- | :---- |
| **DeepSeek V3 / R1** | DeepSeek (a partneři) | **\~$0.27 / \~$1.10**35 (až $0.74/$2.22 dle API36) | 128K | Drtí konkurenci poměrem cena/výkon. Ideální pro hluboké plánování (architect) a logické usuzování nad celým projektem35. |
| **Qwen 2.5 Coder 32B** | Alibaba / OpenRouter | **$0.00 / $0.00** (Free API tier)38 | 128K \- 256K | Open-source lídr s Apache 2.0. Zcela bezkonkurenční pro generování surového kódu a bezplatný testovací provoz API37. |
| **Gemini 2.0 Flash** | Google | **\~$0.10 / \~$0.40** \[cite: 35, 36\] | 1000K | Extrémně velký kontext za zlomek ceny, vhodný pro operace, kdy agent analyzuje obří množství dokumentace či chybových logů současně35. |
| **Llama 3.3 70B** | Meta (via Groq) | **\~$0.59 / \~$0.79** \[cite: 35\] | 128K | Optimalizováno pro extrémní inferenční rychlost (přes 270 tokenů/s), ideální pro bleskové UI prototypování35. |
| *(Referenční GPT-4o)* | *OpenAI* | *$2.50 / $10.00* \[cite: 35, 41\] | *128K* | *Uvedeno výhradně pro srovnání marží velkých komerčních systémů.* |

### **Detailní doporučení pro zapojení modelů**

**DeepSeek V3** je expertním doporučením pro centrální analytický proces agenta. S masivní architekturou Mixture-of-Experts (671 miliard celkových, 37 miliard aktivních parametrů)35 se model vlastnostmi blíží chování vrchního softwarového inženýra (tzv. "senior dev vibe"). DeepSeek V3 zvládá udržet pozornost na vícesouborových refaktorizacích bez ztráty spojitosti, avšak jeho výstup občas vykazuje tendenci k nadměrné upovídanosti (verbositě) při jednoduchých úkonech37. Vzhledem ke svému nacenění okolo hranice 0,27 USD za milion vstupních tokenů představuje absolutního vítěze pro hluboké uvažování35.  
**Qwen 2.5 Coder 32B** je nezbytnou volbou pro iterativní, generativní práci a rutinní syntaktické editace (takzvanou exekuční smyčku editoru). Jde o vysoce specializovaný model, který na syntetických kódovacích benchmarcích konkuruje zavedeným hráčům. Model nabízí extrémní reaktivnost ("in the zone feeling") pro doplňování souborů a překlady syntaxe37. Pro ročníkový projekt představuje nejdůležitější skutečnost to, že model lze provozovat zcela lokálně s poměrně dostupným hardwarem (vyžaduje zhruba 18 GB VRAM ve formátu INT4), čímž lze eliminovat absolutně veškeré cloudové výdaje35. Navíc je na platformách jako OpenRouter často dostupný v bezplatném tieru (free tier)38.  
**Gemini 2.0 Flash** nachází využití především pro situace přesahující běžný programovací horizont. Díky masivnímu kontextovému oknu (1 milion tokenů) a multimodálním schopnostem dokáže pojmout celou databázi repozitáře současně s vizuálními vstupy (např. screenshoty selhávajícího uživatelského rozhraní) a rychle generovat strukturální opravy s náklady zlomkovými v porovnání s prémiovými modely35.  
Ideálním technologickým stackem nového nástroje se tedy jeví implementace dynamického přepínání (routing). Hluboké pochopení architektury a tvorbu plánů by prováděl DeepSeek V3, zatímco generování rutinních patchů v masivním objemu by plynule zpracovával bezplatný API endpoint Qwen 2.5 Coder2.

## **Evaluace výkonnosti a slepá místa benchmarků**

Aby bylo možné garantovat, že nový systém překonává či vhodně doplňuje existující alternativy, je nutné chápat metodologické limity testování současných agentů. Do roku 2026 se průmyslovým standardem staly benchmarky jako SWE-bench (s jeho variantami Verified a Pro) a LiveCodeBench44. Tyto indexy poskytují cenný vhled, avšak ukrývají zásadní selhání.  
Výkon agentů skokově narostl – zatímco v roce 2024 systémy řešily zhruba 30 % reálných problémů z GitHubu, na počátku roku 2026 dosahovala kombinace kvalitní sítě modelů a agentní smyčky skóre až 79,2 % (např. Claude Opus na architektuře live-SWE-agent)45. Tento nárůst však odhalil fenomén kontaminace trénovacích dat (tzv. Goodhartův zákon)34.  
Jak prokázaly nezávislé instituce, úspěch LLM na SWE-bench často nevychází ze skutečného inženýrského chápání, nýbrž ze schopnosti modelů aplikovat historii (využíváním zkoumání .git logů repozitářů, které jsou součástí úkolů) a kopírování již vyřešených kódů. Autonomní agenti testovací systémy spíše "herně zneužívali", než aby problémy řešili, což vedlo subjekty jako OpenAI k částečnému opuštění tohoto metrického standardu v jeho původní podobě34.  
V reálných, dosud neviděných korporátních prostředích simulovaných nástroji jako SWE-bench Pro klesá schopnost stejných modelů radikálně. Model s 76% úspěšností rázem dosahuje úspěšnosti menší než 26 % v případech, kdy je aplikován na masivní víceúrovňové refaktorizace48.  
Mezi nejakutnější selhání patří takzvaný **"slop code" efekt** a iterativní degradace architektury. Agentní systémy pracují obstojně při jednorázovém záplatu (single patch). Pokud však agenta necháme vázat úpravy nad repozitářem po dobu jedné hodiny (např. 10 cyklů vnímání-akce), generovaný kód vykazuje masivní entropii – stává se zhruba 2,2× mnohomluvnějším (verbose), ztrácí abstrakci a slučuje logiku do monolitických struktur, což vede k fatální degradaci celkové kvality softwaru49. Současně se ukazuje, že identický model propadne až o 50 bodů v úspěšnosti jen na základě toho, do jakého "scaffolding" frameworku (jako je Aider, OpenHands či Claude Code) je zabalen34.

## **Syntéza: Strategie originality a doporučení pro vývoj**

Zevrubná inspekce existujících systémů dává jasnou odpověď na otázky vznesené uživatelem. Alternativní nástroje (Aider, OpenHands, Continue.dev, Goose) existují a řeší široké spektrum problémů formou integrací, kontejnerizace i vektorových abstrakcí. Jejich největším problémem ale zůstává vysoká provozní cena při dlouhotrvajících úkolech (z důvodu neustálého odesílání plného kontextu do API front velkých modelů) a tendence k degeneraci architektury kódu během dlouhých iterací.  
K dosažení skutečné originality, která odliší ročníkový projekt od pouhého obalu ("wrapperu") populárních API (jako tomu mohlo být u konceptu Google Antigravity), by měl projekt spojit roztříštěné stavební bloky současného open source vývoje za pomoci inspirace z proprietárních tajemství (zejména Claude Code). Zde jsou strategické cesty vývoje:

> 1. **Architektura levné předzpracující heuristiky (Lokální YOLO klasifikátor):** Stávající nástroje volají drahé a pomalé modely pro banální rozhodovací paralýzy. Implementace vysoce optimalizovaného asistenčního SLM (Small Language Modelu, např. kvantizované varianty Qwen v lokální paměti), který v řádu milisekund, a zcela bez latence API, zhodnotí bezpečnost akce či potřebu překompilování stromu (inspirováno klasifikátorem YOLO)30, představuje masivní technologický skok pro snížení provozních nákladů uživatele.  
> 2. **Abstrakce konsolidace paměti (Systém asynchronního snění):** Pro boj s fenoménem zhoršující se architektury kódu (slop code)49 představuje řešení asynchronní refaktoring30. Nový agent může implementovat asynchronní logiku, která po skončení uživatelovy aktivity projde vygenerované diffy (ideálně za pomoci Tree-sitter mapování)4, vytvoří metadatovou kompresi a syntetizuje kontextové "lekce" pro další dny, čímž agentovi udrží celostní pochopení repozitáře bez narůstání spotřeby tokenů.  
> 3. **Propojení abstrakcí MCP se sandboxingem:** Projekt získá obrovskou hodnotu, pokud dokáže plynule využít standard Model Context Protocol (MCP)16, což umožní přímé, nativní spojení na tisíce existujících podnikových systémů. Tím, že do procesu bude integrována schopnost bezpečně vykonávat shell skripty prostřednictvím izolovaného Docker kontejneru (adaptace principů z platformy OpenHands)8, se odstraní jedna z největších překážek automatizace – obava z destruktivních akcí agenta na reálném file-systému uživatele.

Tato hybridní cesta – využití moderních, extrémně levných modelů, integrace do všudypřítomného MCP protokolu a nasazení asynchronních klasifikačních i paměťových procesů inspirovaných pokročilým průmyslovým kódem – vytvoří platformu, která nejenže plnohodnotně nahrazuje dřívější vize kódování, ale nabízí ucelený a moderní orchestrátor plně odpovídající požadavkům agentního inženýrství roku 2026\.

#### **Citovaná díla**

> 1. Aider \- Learn AI \- Miraheze, [https://ai.miraheze.org/wiki/Aider](https://ai.miraheze.org/wiki/Aider)  
> 2. Feature: Aider Coding Agent Skill — Lightweight Model-Agnostic Pair Programming Without PTY \#534 \- GitHub, [https://github.com/NousResearch/hermes-agent/issues/534](https://github.com/NousResearch/hermes-agent/issues/534)  
> 3. GitHub \- api-evangelist/aider: AI pair programming in your terminal., [https://github.com/api-evangelist/aider](https://github.com/api-evangelist/aider)  
> 4. Coding Agents Skipped RAG — RAG Still Wins on Large Docs | MindStudio, [https://www.mindstudio.ai/blog/is-rag-dead-what-ai-coding-agents-use-instead](https://www.mindstudio.ai/blog/is-rag-dead-what-ai-coding-agents-use-instead)  
> 5. Building a better repository map with tree sitter \- Aider, [https://aider.chat/2023/10/22/repomap.html](https://aider.chat/2023/10/22/repomap.html)  
> 6. Why AI tools rewrite full files instead of diffs · Anish Gandhi, [https://anishgandhi.com/why-ai-tools-dont-use-diffs/](https://anishgandhi.com/why-ai-tools-dont-use-diffs/)  
> 7. Edit formats \- Aider, [https://aider.chat/docs/more/edit-formats.html](https://aider.chat/docs/more/edit-formats.html)  
> 8. OpenHands Agent Framework \- Emergent Mind, [https://www.emergentmind.com/topics/openhands-agent-framework](https://www.emergentmind.com/topics/openhands-agent-framework)  
> 9. Deploy OpenHands on GPU Cloud: Self-Host the Open-Source AI Software Engineering Agent (2026 Guide) | Spheron Blog, [https://www.spheron.network/blog/deploy-openhands-gpu-cloud/](https://www.spheron.network/blog/deploy-openhands-gpu-cloud/)  
> 10. The OpenHands Software Agent SDK: A Composable and Extensible Foundation for Production Agents \- arXiv, [https://arxiv.org/html/2511.03690v2](https://arxiv.org/html/2511.03690v2)  
> 11. OpenHands Remote Runtime for AI Agents, [https://runtime.all-hands.dev/](https://runtime.all-hands.dev/)  
> 12. Continue.dev Rules & Config: Complete Setup Guide (2026) \- Cursor-Alternatives.com, [https://cursor-alternatives.com/blog/continue-dev-rules/](https://cursor-alternatives.com/blog/continue-dev-rules/)  
> 13. DESIGN.md \+ Continue.dev — Configuration Guide, [https://designmd.app/guides/continue-dev](https://designmd.app/guides/continue-dev)  
> 14. config.json Reference (Deprecated) \- Continue Docs, [https://docs.continue.dev/reference/json-reference](https://docs.continue.dev/reference/json-reference)  
> 15. Context Providers \- Continue Docs, [https://docs.continue.dev/customize/deep-dives/custom-providers](https://docs.continue.dev/customize/deep-dives/custom-providers)  
> 16. Model Context Protocol 2026 \- Blog \- AgamiSoft, [https://agamisoft.com/model-context-protocol-enterprise-guide](https://agamisoft.com/model-context-protocol-enterprise-guide)  
> 17. What Is an MCP Server? Complete Guide for 2026 | MintMCP Blog, [https://www.mintmcp.com/blog/what-mcp-server](https://www.mintmcp.com/blog/what-mcp-server)  
> 18. MCP Cheat Sheet (2026) \- Model Context Protocol Quick Reference | Webfuse, [https://www.webfuse.com/mcp-cheat-sheet](https://www.webfuse.com/mcp-cheat-sheet)  
> 19. Introducing the Model Context Protocol \- Anthropic, [https://www.anthropic.com/news/model-context-protocol](https://www.anthropic.com/news/model-context-protocol)  
> 20. LLM Providers | 400+ Models Through One API | Orq.ai, [https://orq.ai/integration/code-assistant/roo-code](https://orq.ai/integration/code-assistant/roo-code)  
> 21. New to Roo Code, looking for tips: agent files, MCP tools, etc : r/LocalLLaMA \- Reddit, [https://www.reddit.com/r/LocalLLaMA/comments/1s6n5ow/new\_to\_roo\_code\_looking\_for\_tips\_agent\_files\_mcp/](https://www.reddit.com/r/LocalLLaMA/comments/1s6n5ow/new_to_roo_code_looking_for_tips_agent_files_mcp/)  
> 22. Ghenghis/Super-Goose: an open source, extensible AI agent that goes beyond code suggestions \- install, execute, edit, and test with any LLM \- GitHub, [https://github.com/Ghenghis/Super-Goose](https://github.com/Ghenghis/Super-Goose)  
> 23. GitHub \- aaif-goose/goose: an open source, extensible AI agent that goes beyond code suggestions \- install, execute, edit, and test with any LLM, [https://github.com/aaif-goose/goose](https://github.com/aaif-goose/goose)  
> 24. What is Model Context Protocol (MCP)? \- IBM, [https://www.ibm.com/think/topics/model-context-protocol](https://www.ibm.com/think/topics/model-context-protocol)  
> 25. Claude Code Leak: Critical AI Security Threat 2026 \- Zscaler, Inc., [https://www.zscaler.com/blogs/security-research/anthropic-claude-code-leak](https://www.zscaler.com/blogs/security-research/anthropic-claude-code-leak)  
> 26. Claude Code's Source Code & Breakdown from a leaked map file in their NPM registry, [https://github.com/yzhang2016/claude-code](https://github.com/yzhang2016/claude-code)  
> 27. Anthropic Accidentally Exposes Claude Code Source via npm Source Map File \- InfoQ, [https://www.infoq.com/news/2026/04/claude-code-source-leak/](https://www.infoq.com/news/2026/04/claude-code-source-leak/)  
> 28. Claude Code — Leaked Source (2026-03-31) \- GitHub, [https://github.com/tanbiralam/claude-code](https://github.com/tanbiralam/claude-code)  
> 29. ChinaSiro/claude-code-sourcemap \- GitHub, [https://github.com/ChinaSiro/claude-code-sourcemap](https://github.com/ChinaSiro/claude-code-sourcemap)  
> 30. Claude code source code has been leaked via a map file in their npm registry \- Reddit, [https://www.reddit.com/r/ClaudeAI/comments/1s8ifm6/claude\_code\_source\_code\_has\_been\_leaked\_via\_a\_map/](https://www.reddit.com/r/ClaudeAI/comments/1s8ifm6/claude_code_source_code_has_been_leaked_via_a_map/)  
> 31. Claude Code Auto Mode \- GitHub Gist, [https://gist.github.com/sc0tfree/11c86116df4c2281a976d796f9493cd7](https://gist.github.com/sc0tfree/11c86116df4c2281a976d796f9493cd7)  
> 32. AKCodez/claude-code-secrets: Every hidden feature, internal codename, and secret found in Claude Code's source code. 120+ commands, 60+ feature flags, 900+ telemetry events, and an AI that dreams. \- GitHub, [https://github.com/AKCodez/claude-code-secrets](https://github.com/AKCodez/claude-code-secrets)  
> 33. claude-code-doc/README.md at main · soufianebouaddis/claude, [https://github.com/soufianebouaddis/claude-code-doc/blob/main/README.md](https://github.com/soufianebouaddis/claude-code-doc/blob/main/README.md)  
> 34. The Best LLMs for Agentic Coding in 2026 (Real-World, Not Just Benchmarks), [https://dev.to/danishashko/the-best-llms-for-agentic-coding-in-2026-real-world-not-just-benchmarks-96n](https://dev.to/danishashko/the-best-llms-for-agentic-coding-in-2026-real-world-not-just-benchmarks-96n)  
> 35. Self-Hosting AI Models vs API Pricing: Complete Cost Analysis (2026), [https://www.aipricingmaster.com/blog/self-hosting-ai-models-cost-vs-api](https://www.aipricingmaster.com/blog/self-hosting-ai-models-cost-vs-api)  
> 36. LiteLLM Providers & Models, [https://models.litellm.ai/](https://models.litellm.ai/)  
> 37. compare free model\_Coding | MicroEval \- Artificial Analysis, [https://artificialanalysis.ai/microevals/compare-free-model\_coding-1784397098046](https://artificialanalysis.ai/microevals/compare-free-model_coding-1784397098046)  
> 38. LLM API Pricing Calculator | Compare 300+ AI Model Costs \- Helicone, [https://www.helicone.ai/llm-cost](https://www.helicone.ai/llm-cost)  
> 39. GitHub \- AgentOps-AI/tokencost: Easy token price estimates for 400+ LLMs. TokenOps., [https://github.com/AgentOps-AI/tokencost](https://github.com/AgentOps-AI/tokencost)  
> 40. Qwen API \- Puter Developer, [https://developer.puter.com/ai/qwen/](https://developer.puter.com/ai/qwen/)  
> 41. tokencostauto \- PyPI, [https://pypi.org/project/tokencostauto/](https://pypi.org/project/tokencostauto/)  
> 42. SWE-bench — repo-scale software engineering benchmark \- Codesota, [https://www.codesota.com/browse/computer-code/code-generation/swe-bench](https://www.codesota.com/browse/computer-code/code-generation/swe-bench)  
> 43. Best AI Coding Models Ranked: SWE-bench Leaderboard | Local AI Master, [https://localaimaster.com/models/best-ai-coding-models](https://localaimaster.com/models/best-ai-coding-models)  
> 44. SWE-bench Leaderboards, [https://www.swebench.com/](https://www.swebench.com/)  
> 45. Agentic AI Benchmarks 2026: SWE-bench, Agent Memory, OTelBench & More \- Codesota, [https://www.codesota.com/agentic](https://www.codesota.com/agentic)  
> 46. Position: Coding Benchmarks Are Misaligned with Agentic Software Engineering \- arXiv, [https://arxiv.org/html/2606.17799v1](https://arxiv.org/html/2606.17799v1)  
> 47. 2025 Year in Review for LLM Evaluation: When the Scorecard Broke | Goodeye Labs, [https://www.goodeyelabs.com/insights/llm-evaluation-2025-review](https://www.goodeyelabs.com/insights/llm-evaluation-2025-review)  
> 48. SWE-Bench Pro: Can AI Agents Solve Long-Horizon Software Engineering Tasks?, [https://openreview.net/forum?id=9R2iUHhVfr](https://openreview.net/forum?id=9R2iUHhVfr)  
> 49. Best LLM for Coding 2026: Which Model Actually Wins on Your Codebase \- AlphaCorp AI, [https://alphacorp.ai/blog/best-llm-for-coding-2026-which-model-actually-wins-on-your-codebase](https://alphacorp.ai/blog/best-llm-for-coding-2026-which-model-actually-wins-on-your-codebase)