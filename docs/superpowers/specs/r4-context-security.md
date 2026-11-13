# R4 kontext, repo mapa a ochrana projektových cest

**Stav:** oblastní technická specifikace odvozená z `PRD_v1.1.md` a schváleného směru R4. Rozhraní politiky bylo ověřeno proti výchozímu kódu `4230544`.

**Autorita:** `PRD_v1.1.md` `FR-CHAT-12..14`, `FR-CTX-01..06/12..17`, `AC-O1-14/17/18/27`; `docs/product/ROADMAP.md` §8. Implementační kroky jsou v plánech návaznosti chatu a repo mapy.

## Kontrakt

- Backend skládá modelový kontext z aktuální zprávy, omezené relevantní historie téhož chatu, povolených projektových pravidel, explicitně získaných výsledků nástrojů, vybraných mapových metadat a bezpečných výřezů explicitních referencí. Historie je minulé tvrzení, ne důkaz aktuálního obsahu souborů. Projektová pravidla mají vlastní autoritu oddělenou od odvozených shrnutí.
- Jediná rozhodovací politika kombinuje pevné výchozí zákazy a zdokumentovanou podmnožinu kořenového `.codrynignore`. Neplatné pravidlo ukáže řádek a důvod. `.gitignore` může být pomocný signál, nenahrazuje ochranu. Výchozí ochrana vylučuje `.git`, `node_modules`, build/cache, velké binární soubory, `.env` varianty a známé credential/privátní klíče z automatického procházení a kontextu. Negace pravidla nesmí trvale zpřístupnit známé tajemství.
- Stejná aktuální politika a její revize se ověřují při crawlu, textovém hledání, TypeScript indexu, repo mapě, hlubší inicializaci, explicitním čtení i sestavení kontextu. Cesty se kontrolují před a po kanonikalizaci cíle; symlink/junction nesmí obejít kořen nebo ignore. Změna pravidel zneplatní odvozený index, mapu a kontext před dalším použitím.
- Rychlá deterministická mapa běží asynchronně po otevření projektu. Záznam obsahuje cestu, druh, hlavní exporty/symboly, stručnou roli, obsahovou revizi a čerstvost. U aktuálního úkolu se prohlubují jen relevantní položky. Uživatel může samostatně spustit hlubší inicializaci struktury, konfigurace, symbolů, vazeb a povolených projektových instrukcí; limity a neúplnost jsou viditelné. Změna zdroje označí jeho odvozené a závislé položky zastaralými před sestavením dalšího kontextu.
- `@` vyhledá soubor i složku v otevřeném projektu, ovládá se klávesnicí a vybraný ukazatel lze před odesláním odebrat. Ukazatel nese stabilní relativní cestu, druh a revizi. Při sestavení backend znovu kontroluje existenci, druh, hash, velikost a politiku. Změna, smazání nebo možná změna názvu má viditelný stav; starý obsah se nepoužije. Folder reference nikdy neposílá všechna těla souborů.
- Pro jeden běžný ignorovaný soubor může uživatel udělit výjimku pouze pro jednu konkrétní akci. Známé tajemství vyžaduje samostatné varování a výslovné potvrzení; žádná výjimka nepovolí automatický index, sousední soubor, složku ani příští běh.
- Audit odlišuje uživatelský text, projektový ukazatel, pravidla, mapu a skutečně načtený výřez. U každého zaznamená bezpečná metadata, hash/revizi, použité bajty/řádky, zkrácení či důvod vynechání. Neukládá další kopii projektového obsahu ani tajemství.

## Rozhraní politiky

- `ContextPathPolicy.fromProjectRoot(root)` otevře politiku pro kanonický kořen. `await policy.refresh()` vrátí aktuální `revision`, SHA-256 z verze výchozí ochrany a uspořádaných platných pravidel. Pokud je soubor pravidel neplatný, typovaná chyba `R2_CONTEXT_POLICY_INVALID` nese důvod a u chyby syntaxe řádek. Poslední platná revize zůstane beze změny a čtení vyžadující aktuální politiku selže.
- `policy.decide(relativePath, action, { kind?, size?, bytes? })` přijímá relativní cestu a jednu z akcí `crawl`, `search`, `typescript_index`, `map`, `deep_init`, `context`, `explicit_file`. Výsledek obsahuje `allowed` a při zamítnutí stabilní kód a bezpečný důvod. Volající nejprve kontroluje cestu, pak druh a kanonický cíl. Při čtení platí strop 1 MiB a požadavek na UTF-8 text bez NUL. Podpis s volitelnými metadaty umožňuje rozhodnout i před čtením. `allowed(path)` zůstává pro stávající volající. Potvrzení výjimky je až odpovědnost resolveru v Task 5.
- Ve výchozím kódu už politiku načítá R2 runtime a předává ji do `ProjectFilesystem` a `FileWorkspaceObserver`. R2 `ContextAssembler` používá stejné čtení. Task 1 sjednotí náhradní výchozí větve, čtení pravidel a kontroly před vydáním obsahu. TypeScript discovery a strukturální host použijí stejnou politiku i pro konfiguraci a projektové deklarace. Standardní knihovny přibaleného TypeScriptu leží mimo projektovou politiku.
- Klient před použitím odvozených dat obnoví pravidla a porovná `policyRevision` s revizí uloženou u výsledku. Při čtení porovná revizi také na konci operace. Textová `policyRevision` je samostatná hodnota vedle číselné revize pracovního prostoru `expectedRevision` z TypeScript plánu a vedle hashe obsahu.

## Důkazy a hranice

- `AC-O1-14/17/18/27`: časovaný async crawl, UI použitelné při indexaci, deep init, stale invalidace, `@` E2E a kontextový audit.
- Společná security fixture pro všechny automatické čtecí/indexovací cesty, výchozí zákazy, chybu pravidla, jednorázovou výjimku, zvláštní varování tajemství a změnu politiky.
- Srovnání mapy s baseline bez mapy na předem fixovaných stejných fixture úlohách podle tokenů, kroků a věcné úspěšnosti. Výsledek může být neutrální či záporný a musí být uveden pravdivě.
