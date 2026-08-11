# Návrh epizodické paměti kontextu v0.1

**Produkt:** Codryn  
**Datum:** 11. 8. 2026  
**Stav:** kandidátní návrh k diskuzi  
**Autorita:** tento dokument není součástí schváleného PRD v0.2 a nezavádí nový povinný rozsah O1

## 1. Shrnutí návrhu

Codryn by mohl dlouhý chat automaticky rozdělovat do tematických nebo pracovních epizod – neformálně do „škatulek“. Když se pozornost přesune jinam nebo začne být aktivní kontext příliš velký, agent uzavře dosavadní epizodu, zachová její kompletní dohledatelný záznam a v aktivním kontextu ponechá jen malý checkpoint a katalog epizod.

Při pozdějším dotazu agent:

1. rozpozná, že dotaz souvisí s dřívější epizodou,
2. podle katalogu vybere správnou epizodu,
3. nejprve načte pouze relevantní zprávy, rozhodnutí, výsledky nástrojů a odkazy na artefakty,
4. v případě nejasnosti může epizodu rozbalovat postupně až k jejímu plnému záznamu,
5. před tvrzením o aktuálním kódu ověří současný stav souborů nebo databáze.

Základní pravidlo návrhu je:

> Uložit celou pracovní epizodu, ponechat malý checkpoint a při návratu načítat selektivně – s možností rozbalit epizodu celou, pokud je to skutečně potřeba.

Nejde o zvětšení kontextového okna modelu. Jde o agentní vrstvu, která rozhoduje, co z rozsáhlejšího lokálního stavu se do omezeného okna modelu právě vloží.

## 2. Terminologie

### 2.1 Model a agent

- **Model** dostává při jednom volání omezený vstup: instrukce, vybrané zprávy, výsledky nástrojů a další vložený obsah. Tento vstup spolu s rezervou pro výstup a případné reasoning tokeny tvoří jeho kontextové okno.
- **Agent** je celý systém kolem modelu: orchestrátor, nástroje, databáze, event log, pravidla, plán, Context Manager a logika pro výběr kontextu.

Přesná formulace tedy je: **model má kontextové okno; agent spravuje kontext a paměť**.

### 2.2 Kontext, historie a paměť

- **Historie chatu:** úplný lokální záznam zpráv a událostí. Nemusí být celý posílán modelu.
- **Aktivní kontext:** konkrétní pracovní sada sestavená pro jedno volání modelu.
- **Pracovní stav:** aktuální cíl, plán, rozpracované kroky, omezení a důležité reference.
- **Epizoda:** souvislý úsek práce s vlastním záměrem, průběhem a výsledkem.
- **Checkpoint epizody:** malé strukturované shrnutí, podle kterého lze epizodu najít a bezpečně znovu otevřít.
- **Epizodická paměť:** uchovává, co se stalo, v jakém pořadí a s jakým výsledkem.
- **Sémantická paměť:** uchovává destilované fakty, preference a znalosti bez nutnosti přehrát celý zážitek.
- **Procedurální paměť:** uchovává pravidla a postupy, typicky v instrukcích, skills nebo kódu agenta.

Tento návrh se zaměřuje na **epizodickou paměť omezenou na jeden chat**. Nejde o automatickou paměť uživatele napříč projekty nebo chaty.

## 3. Problém

Dlouhý chat postupně obsahuje:

- mnoho zpráv a oprav,
- velké výstupy nástrojů,
- staré verze plánu,
- neúspěšné hypotézy,
- rozhodnutí z různých oblastí projektu,
- popisy souborů, které se mezitím změnily,
- informace důležité pro audit, ale nepotřebné pro právě prováděný krok.

Pokud se modelu pokaždé pošle co nejvíce historie, vznikají čtyři samostatné problémy:

1. narůstá cena a latence,
2. model musí rozlišovat aktuální stav od již překonaných informací,
3. relevantní detail se může ztratit v množství málo relevantního obsahu,
4. po dosažení limitu je nutné historii oříznout nebo zkompaktovat, což je z principu ztrátové.

Neexistuje univerzální hranice, například 250 000 tokenů, od které by každý model náhle „zhloupl“. Praktická kvalita závisí na modelu, skladbě vstupu, umístění relevantní informace, typu úlohy a rezervě pro výstup. Pro Codryn proto dává větší smysl měřit kvalitu na vlastních scénářích než zakódovat jednu domnělou magickou hranici.

## 4. Jak se s kontextem pracuje dnes

Dnešní systémy obvykle kombinují několik vrstev. Neexistuje jediný standardní mechanismus, který by používali všichni agenti.

### 4.1 Řetězení konverzace

API nebo agentní framework může propojit jednotlivá volání a udržovat thread. To usnadňuje pokračování konverzace, ale samo o sobě to neznamená, že je historie zdarma nebo že se modelu zpřístupní neomezená paměť.

OpenAI Responses API například umožňuje řetězit odpovědi pomocí `previous_response_id`; oficiální dokumentace zároveň uvádí, že předchozí vstupní tokeny v řetězci jsou stále účtovány jako vstup. [Zdroj: OpenAI – Conversation state](https://developers.openai.com/api/docs/guides/conversation-state)

### 4.2 Posuvné okno a trimming

Nejjednodušší správa ponechá posledních několik tahů a starší obsah zahodí. Je levná a předvídatelná, ale ztrácí starší rozhodnutí bez ohledu na jejich důležitost.

Lepší varianta vybírá zprávy podle relevance, typu, autority nebo vazby na právě řešené soubory. To už je context engineering: aktivní kontext není kopie celé historie, ale sestavený pracovní balíček.

### 4.3 Lineární kompakce

Při kompakci je dosavadní průběh nahrazen menší reprezentací, která má zachovat klíčový stav pro další tahy. OpenAI podporuje serverovou i samostatnou kompakci. Kompakční položka přenáší důležitý dřívější stav v menším počtu tokenů, je ale neprůhledná a není určena k lidskému čtení. [Zdroj: OpenAI – Compaction](https://developers.openai.com/api/docs/guides/compaction)

Kompakce je vhodná jako bezpečnostní ventil, ale jedno souhrnné lineární zhuštění má slabinu: podrobnost, která v okamžiku shrnutí nevypadala důležitě, už v něm později nemusí být.

### 4.4 Strukturovaný stav a paměťové poznámky

Agent může mimo historii udržovat strukturovaný stav a malé poznámky. Po oříznutí kontextu je znovu vloží do promptu. OpenAI Cookbook popisuje vzor, ve kterém se během session ukládají paměťové poznámky, po trimování se znovu injektují a do modelu se vkládají jen relevantní části stavu. [Zdroj: OpenAI Cookbook – Context Engineering for Personalization](https://developers.openai.com/cookbook/examples/agents_sdk/context_personalization)

To potvrzuje, že princip „odložit mimo aktivní kontext a podle potřeby vrátit“ se dnes skutečně používá.

### 4.5 Epizodická paměť a hierarchie paměti

Pojem epizodická paměť se v agentních frameworcích používá pro záznam minulých zkušeností a akcí. LangChain rozlišuje sémantickou, epizodickou a procedurální paměť; Deep Agents ukládají konverzace jako checkpointované thready a umožňují je zpřístupnit vyhledávacím nástrojem. [Zdroj: LangChain – Memory overview](https://docs.langchain.com/oss/python/concepts/memory), [Deep Agents – Memory](https://docs.langchain.com/oss/python/deepagents/memory)

Výzkumný systém MemGPT popsal „virtuální správu kontextu“ analogickou virtuální paměti operačního systému: hlavní kontext funguje jako omezená RAM, externí kontext jako disk a agent relevantní informace načítá zpět pomocí vyhledávání a funkcí. [Zdroj: MemGPT – Towards LLMs as Operating Systems](https://arxiv.org/abs/2310.08560)

### 4.6 Co z toho plyne pro originalitu návrhu

Samotná myšlenka externí paměti, checkpointů, selektivního retrievalu ani přesouvání informací mezi aktivním a externím kontextem není nová.

Specifická produktová kombinace ale může být hodnotná:

- scope pouze jednoho chatu,
- automatické tematické a pracovní epizody,
- kompletní lokální záznam jako důkazní vrstva,
- malý trvale dostupný katalog,
- selektivní rozbalování od checkpointu k detailu,
- ověření tvrzení proti aktuálnímu workspace,
- auditovatelné vysvětlení, proč byla epizoda vybrána.

Hodnota tedy není v tvrzení „nikdo nikdy nepoužil externí paměť“, ale v dobře navrženém chování, integraci s coding agentem a ověřeném dopadu na kvalitu.

## 5. Rozdíl mezi běžnou kompakcí a epizodickými škatulkami

| Vlastnost | Lineární kompakce | Plné přepínání škatulek | Doporučený hybrid |
|---|---|---|---|
| Uložení originálu | záleží na implementaci | ano | ano, jako event log a reference |
| Aktivní reprezentace | jedno pokračující zhuštění | celá vybraná škatulka | checkpoint + relevantní výřezy |
| Návrat ke starému detailu | omezený obsahem shrnutí | dobrý, ale drahý | postupný a cílený |
| Riziko zahlcení | roste po opakované kompakci | vysoké u velké škatulky | řízené token budgetem |
| Zachování vztahů mezi tématy | ve shrnutí se mohou slít | vyžaduje přepínání | katalog a odkazy mezi epizodami |
| Implementační složitost | nižší | střední | vyšší |
| Doporučené použití | fallback při tlaku na limit | experiment nebo velmi oddělené úlohy | hlavní kandidátní směr |

Původní varianta „odložit všechno aktivní a načíst celou starou škatulku“ je funkční mentální model, ale v praxi by často jen přesouvala problém velkého kontextu z jednoho místa na druhé. Hybrid zachovává její nejdůležitější vlastnost – možnost návratu k originálu – bez povinnosti originál pokaždé celý vložit modelu.

## 6. Širší využití než pouze změna tématu

Škatulkování není užitečné jen tehdy, když uživatel v jednom chatu přeskočí z databáze na UI. Epizoda může reprezentovat i:

- dokončenou fázi plánu,
- průzkum architektury před implementací,
- jednu diagnostickou hypotézu,
- neúspěšný pokus, který se nemá opakovat,
- velký výstup testů nebo logů,
- dokončenou práci subagenta,
- dočasně odloženou větev rozhodování,
- stav před delší pauzou,
- přechod na model s menším kontextovým oknem,
- auditní balíček vysvětlující, proč agent provedl změnu.

Největší potenciál je u dlouhých coding sessions s více fázemi a velkým množstvím tool outputů. U krátkého chatu by systém neměl vytvářet režii bez prokazatelného užitku.

## 7. Návrhové principy

### 7.1 Plný zápis, selektivní čtení

Originální události se ukládají do lokálního event logu. Model standardně dostává jen checkpoint a relevantní výřezy. Plný záznam zůstává dostupný pro dohledání, audit a opravu chybného shrnutí.

### 7.2 Paměť není zdroj pravdy o aktuálním workspace

Epizoda dokládá, co agent tehdy viděl a udělal. Nevypovídá automaticky o tom, co platí nyní. Tvrzení o souboru, schématu databáze, Git stavu nebo testech se před použitím ověřuje proti aktuálnímu zdroji.

### 7.3 Automatika s auditovatelnou stopou

Uživatel nemá ručně ukládat každou epizodu. Agent epizody spravuje automaticky, ale do event streamu zapisuje:

- proč epizodu uzavřel,
- jak ji pojmenoval,
- jaké zdroje do ní patří,
- kterou epizodu později načetl,
- jaké konkrétní části vložil do kontextu,
- zda ověřil aktuálnost proti workspace.

### 7.4 Zdroj a autorita každé informace

Každý checkpoint a výřez nese odkazy na původní události. Paměťové shrnutí nesmí přepsat vyšší instrukce, aktuální uživatelské zadání ani projektový zdroj pravdy.

### 7.5 Postupné rozbalování

Retrieval probíhá ve vrstvách:

1. katalog epizod,
2. checkpoint vybrané epizody,
3. relevantní rozhodnutí a události,
4. okolí vybraných událostí,
5. plný záznam epizody pouze při potřebě.

### 7.6 Kompakce zůstává fallback

Epizody neruší globální ochranu před překročením limitu. Pokud ani sestavený aktivní kontext nesplňuje rozpočet, Context Manager použije trimming nebo kompakci podle podporovaných schopností providera.

## 8. Navrhovaná architektura

Návrh rozšiřuje stávající komponentu `Context Manager`; nevytváří druhý nezávislý kontextový systém.

### 8.1 Komponenty

#### Episode Boundary Detector

Rozhoduje, zda aktivní epizoda pokračuje, nebo vznikla hranice. Používá deterministické signály a volitelně klasifikaci modelem.

#### Episode Store

Ukládá metadata epizod, checkpointy, odkazy na event log a vztahy mezi epizodami. Pro lokální MVP je přirozeným backendem SQLite.

#### Episode Index

Umožňuje hledat podle názvu, klíčových slov, cest souborů, ID rozhodnutí, nástrojů, času a výsledku. První verze může použít SQLite FTS5 a metadata filtry; embeddingy nejsou nutné pro první experiment.

#### Episode Retriever

Seřadí kandidátní epizody, vybere relevantní výřezy a odhadne jistotu. Při nízké jistotě rozšíří hledání nebo si vyžádá více okolních událostí.

#### Context Assembler

Sestaví finální vstup modelu v pořadí autority a relevance. Prosazuje tokenový rozpočet a zaznamená, co bylo vloženo nebo vypuštěno.

#### Freshness Validator

Porovná paměťové odkazy se současným workspace. Pracuje s cestou, hashem nebo revizí, poslední změnou a případně se schématem databáze.

#### Compaction Adapter

Odděluje vlastní epizodickou vrstvu od provider-specific kompakce. Codryn tak může využít providerovou kompakci, ale není na její interní reprezentaci datově závislý.

## 9. Datový model

Následující model je konceptuální. Konkrétní SQL migrace patří až do implementační specifikace.

### 9.1 `context_episode`

| Pole | Význam |
|---|---|
| `id` | stabilní UUID epizody |
| `chat_id` | chat, v jehož scope epizoda existuje |
| `parent_episode_id` | volitelná nadřazená epizoda |
| `title` | krátký lidsky čitelný název |
| `intent` | cíl nebo otázka epizody |
| `status` | `active`, `paused`, `completed`, `superseded` nebo `stale` |
| `summary` | stručný checkpoint bez detailního průběhu |
| `outcome` | výsledek, neúspěch nebo důvod přerušení |
| `open_loops` | neuzavřené otázky a následující kroky |
| `keywords` | termíny pro levné hledání |
| `started_at`, `ended_at` | časové hranice |
| `start_event_id`, `end_event_id` | rozsah v kanonickém event logu |
| `summary_version` | verze checkpointu pro audit a regeneraci |
| `token_estimate` | orientační velikost plné epizody |

### 9.2 `episode_evidence`

| Pole | Význam |
|---|---|
| `episode_id` | vlastník reference |
| `event_id` | původní zpráva, tool call nebo výsledek |
| `evidence_type` | `decision`, `artifact`, `tool_result`, `error`, `verification` nebo `message` |
| `importance` | priorita při retrievalu |
| `excerpt` | malý indexovatelný výřez, nikoli náhrada originálu |

### 9.3 `episode_artifact_ref`

| Pole | Význam |
|---|---|
| `episode_id` | související epizoda |
| `path` | cesta k souboru nebo logickému artefaktu |
| `observed_hash` | hash při uložení checkpointu |
| `observed_revision` | revize, pokud ji zdroj podporuje |
| `relationship` | např. `read`, `created`, `modified`, `verified` |

### 9.4 `episode_link`

Ukládá vztahy `continues`, `depends_on`, `contradicts`, `supersedes` a `related_to`. Tím se zabrání tomu, aby katalog byl jen plochý seznam izolovaných shrnutí.

### 9.5 `context_retrieval_event`

Auditní záznam obsahuje dotaz, kandidáty, použité filtry, vybrané epizody, vložené eventy, odhad tokenů, skóre relevance a výsledek freshness kontroly.

## 10. Životní cyklus epizody

### 10.1 Otevření

První epizoda vznikne s novým cílem chatu. Další může vzniknout při explicitním přechodu uživatele nebo automaticky při dostatečně silné hranici.

### 10.2 Průběžná aktualizace

Agent neprovádí drahé kompletní shrnutí po každé zprávě. Průběžně pouze připisuje události a aktualizuje malý strukturovaný stav. Plný checkpoint vytvoří na hranici epizody, při pauze nebo před vynucenou kompakcí.

### 10.3 Uzavření nebo pozastavení

Epizoda se označí jako:

- `completed`, pokud má ověřený výsledek,
- `paused`, pokud se práce odkládá s otevřenými kroky,
- `superseded`, pokud ji nahradilo novější rozhodnutí,
- `stale`, pokud reference neodpovídají aktuálnímu workspace.

### 10.4 Znovuotevření

Agent epizodu nemusí vracet do stavu `active`, pokud z ní pouze cituje minulý fakt. Znovu ji aktivuje tehdy, když se k jejímu cíli skutečně vrací a bude v něm pokračovat.

## 11. Detekce hranic

### 11.1 Deterministické signály

- změna kroku v explicitním plánu,
- dokončená verifikace a přechod k novému cíli,
- uživatelské „teď jiné téma“,
- dlouhá pauza nebo obnovení chatu,
- dokončení subagenta,
- skok na nesouvisející resource keys,
- dosažení měkkého limitu aktivního kontextu.

### 11.2 Modelová klasifikace

Malý nebo levný model může vrátit strukturované rozhodnutí:

```json
{
  "action": "continue | close_and_open | temporarily_branch",
  "confidence": 0.91,
  "new_intent": "ověřit migraci tabulky users",
  "related_episode_ids": ["episode-id"]
}
```

Modelové rozhodnutí se nepoužije samo bez omezení. Musí respektovat minimální velikost epizody, cooldown a prah jistoty.

### 11.3 Doporučený hybrid

Pro Codryn je vhodné začít deterministickými hranicemi a model použít jen v nejasných případech. Snižuje to cenu, latenci i riziko, že agent vytvoří škatulku pro každou drobnou odbočku.

## 12. Retrieval a sestavení kontextu

### 12.1 Vyhledávání kandidátů

Počáteční skóre může kombinovat:

- shodu klíčových slov a FTS,
- shodu cest souborů a resource keys,
- vazbu na aktuální plán,
- časovou blízkost,
- stav epizody,
- odkazy mezi epizodami,
- sémantickou podobnost, pokud se později zavedou embeddingy.

První verze nemá vyžadovat samostatnou vektorovou databázi. SQLite FTS5, metadata a reranking modelem postačí k ověření, zda je princip užitečný.

### 12.2 Pořadí autority v aktivním kontextu

1. bezpečnostní a systémové instrukce,
2. aktuální uživatelský požadavek,
3. platné projektové instrukce a zdroje pravdy,
4. aktivní plán a pracovní stav,
5. aktuální data z workspace,
6. nedávná relevantní historie,
7. vybrané výřezy z epizod,
8. malý katalog ostatních epizod.

Starší paměť se nikdy nesmí tvářit jako vyšší instrukce.

### 12.3 Tokenový rozpočet

Rozpočet nesmí být pevné procento pro všechny modely. Context Manager vychází z konkrétního limitu providera a rezervuje prostor pro:

- odpověď modelu,
- reasoning a tool calls,
- neočekávané rozšíření retrievalu,
- provider-specific bezpečnostní rezervu.

Pokud kandidátní kontext přesahuje budget, nejprve se zmenšují nebo vypouštějí nízko hodnocené epizodické výřezy; vyšší instrukce a aktuální zadání se neobětují.

## 13. Konkrétní příklad session

### 13.1 První epizoda: databáze

Uživatel požádá o přidání pozvánek do týmu. Agent prozkoumá schéma, navrhne migraci, přidá tabulku `team_invitation` a ověří testy.

Checkpoint obsahuje:

- cíl: perzistence týmových pozvánek,
- výsledek: migrace a testy tehdy prošly,
- rozhodnutí: token pozvánky se ukládá pouze jako hash,
- dotčené artefakty s jejich pozorovanými hashy,
- odkazy na migrační eventy a test output,
- otevřený bod: UI zatím není implementováno.

Kompletní SQL, diskuze a výstupy testů zůstanou v event logu; nejsou trvale v aktivním kontextu.

### 13.2 Druhá epizoda: UI

Uživatel přejde na obrazovku správy týmu. Agent uzavře databázovou epizodu a otevře UI epizodu. Do nového kontextu vloží jen relevantní kontrakt databáze a otevřený bod, nikoli celou historii migrace.

### 13.3 Třetí epizoda: nesouvisející chyba autentizace

Během práce uživatel odbočí k chybě přihlášení. UI epizoda se pozastaví. Diagnostika autentizace vytvoří samostatnou epizodu, aby její logy a neúspěšné hypotézy nezatěžovaly pozdější dokončení pozvánek.

### 13.4 Návrat k databázovému detailu

Uživatel se později zeptá: „Jaké atributy měla ta nová tabulka?“

Agent:

1. najde databázovou epizodu podle `team_invitation` a dotazu na tabulku,
2. načte checkpoint a reference na migraci,
3. ověří, zda migrační soubor stále existuje a zda se jeho hash nezměnil,
4. pokud se nezměnil, přečte pouze definici tabulky,
5. pokud se změnil, odpoví podle aktuálního souboru a upozorní, že se stav od původní epizody změnil.

Agent tedy neodpovídá pouze z potenciálně zastaralého shrnutí a zároveň nemusí načíst kompletní starou session.

## 14. Implementační varianty

### Varianta A: pouze lepší checkpointy

Po hranici fáze se uloží strukturované shrnutí a odkazy na události. Retrieval je podle klíčových slov a cest.

**Přínos:** nejmenší cena a rychlé ověření základní hypotézy.  
**Slabina:** horší tematické hledání a závislost na kvalitě checkpointu.

### Varianta B: epizody s FTS a rerankingem

Epizody mají katalog, evidence, artifact refs a fulltextový index. Model rerankuje malý seznam kandidátů a vybírá výřezy.

**Přínos:** dobrý poměr kvality, složitosti a lokálního provozu.  
**Slabina:** vyžaduje evaluaci hranic, retrievalu a freshness kontrol.

### Varianta C: hierarchická paměť s embeddingy

K FTS se přidají embeddingy, hierarchické epizody, vztahový graf a background consolidation.

**Přínos:** lepší hledání při nepřesné formulaci a velmi dlouhých sessions.  
**Slabina:** vyšší cena, složitost, obtížnější ladění a větší riziko neviditelných chyb retrievalu.

### Doporučení

Začít variantou A jako měřitelným experimentem a přejít k variantě B pouze tehdy, pokud baseline ukáže užitek. Variantu C neplánovat jako počáteční implementaci.

## 15. Selhání a ochrany

### 15.1 Chybné shrnutí

Checkpoint může vynechat detail nebo překroutit závěr. Proto musí mít odkazy na originální eventy a možnost regenerace. U kritických tvrzení agent čte evidenci, ne pouze summary.

### 15.2 Chybný retrieval

Agent může vybrat podobnou, ale nesprávnou epizodu. Ochrany jsou metadata filtry, evidence paths, confidence threshold, reranking a rozšíření dotazu při nejasnosti.

### 15.3 Zastaralá paměť

Reference na soubory a databázi nesou pozorovaný hash nebo revizi. Neshoda označí epizodu jako potenciálně `stale`; agent poté čte aktuální zdroj.

### 15.4 Příliš mnoho epizod

Over-boxing vytváří režii a zhoršuje hledání. Pomáhá minimální velikost, cooldown, slučování krátkých sousedních epizod a hierarchický katalog po překročení limitu.

### 15.5 Paměťová smyčka

Pokud se nové shrnutí vytváří jen ze starého shrnutí, chyby se mohou zesilovat. Regenerace musí vycházet z kanonických eventů a evidence.

### 15.6 Prompt injection v uloženém obsahu

Staré tool outputy, webový obsah nebo text souborů jsou data, nikoli instrukce. Context Assembler je vkládá s jasným označením zdroje a nižší autoritou. Aktivní bezpečnostní pravidla mají vždy přednost.

### 15.7 Citlivá data

Epizodický store nesmí obcházet redakci secrets ani `.codrynignore`. Velké výstupy se mohou uchovat lokálně pro diagnostiku, ale do indexovatelného excerptu se nesmí kopírovat tajné hodnoty.

### 15.8 Selhání zápisu checkpointu

Uzavření epizody a zápis checkpointu musí být transakční. Pokud checkpoint selže, originální event log zůstane nedotčený a epizoda se označí k opakovanému zpracování. Agent nesmí tvrdit, že paměť bezpečně uložil, pokud to nepotvrdila databáze.

## 16. UX a transparentnost

Pro první verzi není nutné přidávat samostatný velký panel. Chování může být automatické a zobrazené jako stručné události v timeline:

- `Kontext uložen: Databáze týmových pozvánek`
- `Načten dřívější kontext: 3 relevantní události`
- `Paměť byla ověřena proti aktuálnímu souboru`
- `Původní epizoda je zastaralá; použit aktuální stav`

Později lze přidat inspektor, který ukáže katalog epizod, jejich stav, vložené výřezy a vazbu na originální eventy. Uživatelské ovládání může nabídnout akce `Otevřít epizodu`, `Sloučit`, `Přejmenovat` a `Zapomenout v tomto chatu`, ale základní funkce na nich nesmí záviset.

## 17. Postup ověření a implementace

### Fáze E0: offline experiment

- vybrat několik anonymizovaných nebo syntetických dlouhých coding sessions,
- ručně označit epizody a dotazy vyžadující návrat,
- porovnat plnou historii, posuvné okno, lineární kompakci a hybridní retrieval,
- změřit správnost, počet tokenů, latenci a chybové typy.

Tato fáze nevyžaduje produktové UI ani změnu závazného O1 scope.

### Fáze E1: minimální checkpointy

- rozšířit event log o hranice epizod,
- ukládat checkpointy a evidence refs do SQLite,
- použít pouze deterministické hranice,
- vyhledávat přes FTS5 a metadata,
- sestavování kontextu zaznamenávat do diagnostiky.

### Fáze E2: automatické hranice a selektivní rozbalování

- doplnit klasifikaci nejasných hranic,
- zavést confidence a fallback,
- přidat retrieval okolních eventů,
- zapojit freshness validaci pro soubory a databázi.

### Fáze E3: pokročilá paměť pouze podle evalů

- embeddingy,
- hierarchické epizody,
- background consolidation,
- pokročilý inspektor,
- přenos checkpointu mezi modely v rámci jednoho chatu.

Přechod mezi fázemi se má řídit výsledkem evaluace, nikoli předpokladem, že složitější paměť je automaticky lepší.

## 18. Evaluace

### 18.1 Testovací scénáře

- návrat k databázovému rozhodnutí po dlouhé UI odbočce,
- otázka na přesný atribut ze staré migrace,
- stará epizoda odkazující na mezitím změněný soubor,
- dvě podobné epizody s odlišným výsledkem,
- neúspěšná hypotéza, kterou agent nesmí vydávat za řešení,
- velký test output, z něhož je později potřeba jediná chyba,
- dotaz propojující rozhodnutí ze dvou epizod,
- krátký chat, ve kterém systém nemá zbytečně epizody vytvářet.

### 18.2 Metriky

- **retrieval recall:** zda se správná evidence dostala mezi kandidáty,
- **retrieval precision:** kolik vloženého obsahu bylo skutečně relevantní,
- **answer correctness:** zda odpověď odpovídá evidenci a aktuálnímu workspace,
- **stale-state detection:** zda agent rozpoznal změnu od uložené epizody,
- **token reduction:** rozdíl proti plné historii a lineární kompakci,
- **latency overhead:** čas indexace, retrievalu a ověření,
- **boundary quality:** počet zbytečných a chybějících hranic,
- **recovery rate:** zda lze chybný checkpoint napravit načtením evidence.

### 18.3 Kandidátní kritéria pro pokračování

Experiment má pokračovat do produktové implementace pouze tehdy, pokud:

- hybrid zlepší nebo zachová správnost proti současné baseline,
- prokazatelně sníží počet aktivních tokenů u dlouhých sessions,
- freshness kontrola zachytí připravené zastaralé reference,
- režie zůstane přijatelná pro lokální desktopovou aplikaci,
- chybný retrieval je auditovatelný a opravitelný přes původní eventy.

Konkrétní číselné prahy se mají stanovit až po vytvoření baseline; jinak by šlo o vymyšlená čísla bez dat.

## 19. Dopad na současný Codryn

Návrh dobře navazuje na existující směr PRD v0.2:

- `Context Manager` už má skládat jen relevantní historii a výsledky,
- plná lokální historie má zůstat zachována i po kompresi,
- event log je přirozený kanonický záznam,
- SQLite/WAL je vhodné lokální úložiště metadat,
- velké tool outputy už mají oddělovat zkrácený vstup modelu od plné lokální diagnostiky,
- hash a revize odpovídají bezpečnostnímu principu ověření aktuálního stavu.

Současně jde o pokročilou schopnost, která nesmí vytlačit z O1 základní spolehlivý vertikální loop:

`analýza → změna → verifikace → diff/výsledek → bezpečný návrat`

Proto je doporučení:

1. zachovat tento dokument jako kandidátní architekturu,
2. provést malý offline experiment bez rozšíření O1,
3. teprve podle dat rozhodnout, zda vznikne položka v etapizaci a následně závazné PRD požadavky.

## 20. Odpověď na původní otázku

Ano, princip se dnes používá: agenti uchovávají stav mimo prompt, zkracují historii, injektují paměťové poznámky, vyhledávají starší události a některé systémy pracují s explicitními vrstvami paměti.

Ne, není doloženo, že by každý dnešní agent automaticky používal přesně tuto podobu tematických škatulek uvnitř jednoho chatu, s kompletním lokálním archivem, malým katalogem, postupným rozbalováním a povinným ověřením proti aktuálnímu workspace.

Návrh tedy není nový v jednotlivých stavebních blocích, ale není ani „trash“. Je to rozumná syntéza známých technik pro konkrétní problém dlouhých coding sessions. Jeho skutečná hodnota se musí prokázat evaluací proti jednodušší kompakci a retrieval baseline.

## 21. Primární zdroje

- [OpenAI API – Conversation state](https://developers.openai.com/api/docs/guides/conversation-state)
- [OpenAI API – Compaction](https://developers.openai.com/api/docs/guides/compaction)
- [OpenAI Cookbook – Context Engineering for Personalization](https://developers.openai.com/cookbook/examples/agents_sdk/context_personalization)
- [LangChain – Memory overview](https://docs.langchain.com/oss/python/concepts/memory)
- [Deep Agents – Memory](https://docs.langchain.com/oss/python/deepagents/memory)
- [Packer et al. – MemGPT: Towards LLMs as Operating Systems](https://arxiv.org/abs/2310.08560)

