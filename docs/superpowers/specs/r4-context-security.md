# R4 kontext, repo mapa a ochrana projektových cest

**Stav:** oblastní technická specifikace odvozená z `PRD_v1.1.md` a schváleného směru R4; před produkční implementací ověřit rozhraní proti aktuálnímu kódu.

**Autorita:** `PRD_v1.1.md` `FR-CHAT-12..14`, `FR-CTX-01..06/12..17`, `AC-O1-14/17/18/27`; `docs/product/ROADMAP.md` §8. Implementační kroky jsou v plánech návaznosti chatu a repo mapy.

## Kontrakt

- Backend skládá modelový kontext z aktuální zprávy, omezené relevantní historie téhož chatu, povolených projektových pravidel, explicitně získaných výsledků nástrojů, vybraných mapových metadat a bezpečných výřezů explicitních referencí. Historie je minulé tvrzení, ne důkaz aktuálního obsahu souborů. Projektová pravidla mají vlastní autoritu oddělenou od odvozených shrnutí.
- Jediná rozhodovací politika kombinuje pevné výchozí zákazy a zdokumentovanou podmnožinu kořenového `.codrynignore`. Neplatné pravidlo ukáže řádek a důvod. `.gitignore` může být pomocný signál, nenahrazuje ochranu. Výchozí ochrana vylučuje `.git`, `node_modules`, build/cache, velké binární soubory, `.env` varianty a známé credential/privátní klíče z automatického procházení a kontextu. Negace pravidla nesmí trvale zpřístupnit známé tajemství.
- Stejná aktuální politika a její revize se ověřují při crawlu, textovém hledání, TypeScript indexu, repo mapě, hlubší inicializaci, explicitním čtení i sestavení kontextu. Cesty se kontrolují před a po kanonikalizaci cíle; symlink/junction nesmí obejít kořen nebo ignore. Změna pravidel zneplatní odvozený index, mapu a kontext před dalším použitím.
- Rychlá deterministická mapa běží asynchronně po otevření projektu. Záznam obsahuje cestu, druh, hlavní exporty/symboly, stručnou roli, obsahovou revizi a čerstvost. U aktuálního úkolu se prohlubují jen relevantní položky. Uživatel může samostatně spustit hlubší inicializaci struktury, konfigurace, symbolů, vazeb a povolených projektových instrukcí; limity a neúplnost jsou viditelné. Změna zdroje označí jeho odvozené a závislé položky zastaralými před sestavením dalšího kontextu.
- `@` vyhledá soubor i složku v otevřeném projektu, ovládá se klávesnicí a vybraný ukazatel lze před odesláním odebrat. Ukazatel nese stabilní relativní cestu, druh a revizi. Při sestavení backend znovu kontroluje existenci, druh, hash, velikost a politiku. Změna, smazání nebo možná změna názvu má viditelný stav; starý obsah se nepoužije. Folder reference nikdy neposílá všechna těla souborů.
- Pro jeden běžný ignorovaný soubor může uživatel udělit výjimku pouze pro jednu konkrétní akci. Známé tajemství vyžaduje samostatné varování a výslovné potvrzení; žádná výjimka nepovolí automatický index, sousední soubor, složku ani příští běh.
- Audit odlišuje uživatelský text, projektový ukazatel, pravidla, mapu a skutečně načtený výřez. U každého zaznamená bezpečná metadata, hash/revizi, použité bajty/řádky, zkrácení či důvod vynechání. Neukládá další kopii projektového obsahu ani tajemství.

## Důkazy a hranice

- `AC-O1-14/17/18/27`: časovaný async crawl, UI použitelné při indexaci, deep init, stale invalidace, `@` E2E a kontextový audit.
- Společná security fixture pro všechny automatické čtecí/indexovací cesty, výchozí zákazy, chybu pravidla, jednorázovou výjimku, zvláštní varování tajemství a změnu politiky.
- Srovnání mapy s baseline bez mapy na předem fixovaných stejných fixture úlohách podle tokenů, kroků a věcné úspěšnosti. Výsledek může být neutrální či záporný a musí být uveden pravdivě.
