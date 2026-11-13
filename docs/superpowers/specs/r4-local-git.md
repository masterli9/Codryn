# R4 lokální Git pracovní tok

**Stav:** oblastní technická specifikace odvozená z `PRD_v1.1.md` a schváleného směru R4; před produkční implementací ověřit rozhraní proti aktuálnímu kódu.

**Autorita:** `PRD_v1.1.md` `FR-VCS-01..07/09..14/16/20/21`, `AC-O1-19/20/22`; `docs/product/ROADMAP.md` §8. Implementační kroky jsou ve společném plánu workspace/Git.

## Kontrakt

- Po otevření projektu backend rozpozná Git worktree i tehdy, když projekt leží v jeho podadresáři. U relace zachytí výchozí commit, branch a stav; pracovní rozsah projektu se odlišuje od kořene worktree. Non-Git režim zachová obsahové snapshoty, změnu, ověření a návrat. Uživatelské předchozí změny zůstávají odlišené od agentních.
- Jedna Git služba dodává čerstvý čtecí snapshot pro panel i preflight stavových operací. Panel ukazuje branch, upstream, HEAD, dostupný ahead/behind, staged/unstaged/new/deleted/renamed/conflict položky a odpovídající diff indexu/pracovního stromu. Stránkovaná historie ukáže hash, zprávu, autora, čas, rodiče, reference a detail změněných souborů.
- Stage a unstage pracují s celým vybraným souborem. Před operací backend znovu načte stav a při odlišné identitě snapshotu ji odmítne. Přepnutí branche a každá lokální operace měnící worktree kontroluje necommitnuté i aktivní agentní změny a riziko ztráty zastaví; bez automatického stash/reset/clean.
- Návrh commit message vychází pouze z aktuálního staged diffu a povolených projektových konvencí, je označený jako návrh a upravitelný. Commit vznikne jen po samostatné uživatelské akci nad znovu ověřeným neprázdným staged snapshotem. Externí změna indexu/HEAD/branche mezi náhledem a akcí znamená `stale` a nový preflight.
- Stavové Git akce se serializují podle kanonického worktree či reference a zapisují bezpečný audit. Zámek nenahrazuje kontrolu externích změn. Git CLI se volá s polem argumentů, přesným pracovním adresářem, timeoutem a omezeným výstupem; renderer nemá přímý Git ani Node přístup. Detached HEAD, konflikt a nedostupný Git mají vysvětlený omezený stav.
- `fetch`, `pull`, `push` a jejich autentizace jsou S/O1; tento lokální kontrakt je neimplementuje a nezapočítává je do povinného dokončení R4.

## Důkazy a hranice

- Git fixture pro projekt v podadresáři worktree, status/diff/historii, stage/unstage, branch a commit, včetně externí změny indexu a konfliktního stavu.
- `AC-O1-19/20/22`: integrační a E2E test panelu, návrhu/commitu, auditní log a souběh dvou stavových operací.
- Regrese Git i non-Git safe return a ochrany před přepsáním novějších ručních změn.
