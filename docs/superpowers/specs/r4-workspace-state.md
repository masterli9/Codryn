# R4 bezpečnostní stav workspace

**Stav:** oblastní technická specifikace odvozená z `PRD_v1.1.md` a schváleného směru R4; před produkční implementací ověřit rozhraní proti aktuálnímu kódu.

**Autorita:** `PRD_v1.1.md` `FR-COORD-01/02/08..10/14`, `AC-O1-22/23/24`; `docs/product/ROADMAP.md` §8. Implementační kroky jsou ve společném plánu workspace/Git.

## Kontrakt

- Backend ukládá pro otevřený workspace monotónní `workspaceRevision`, čas pozorování, Git identitu a zdroj relevantní změny. Revize roste při úspěšném zápisu, zjištěné ruční změně, změně HEAD/branche a dokončené serializované stavové operaci; chatová zpráva bez změny projektu ji nezvýší. Pozorování může být neúplné a takový stav není důkazem čerstvosti.
- Každý patch nese očekávaný hash či revizi konkrétního podkladu. Guarded writer znovu ověřuje kanonickou cestu a obsah těsně před zápisem. Neshoda zastaví operaci před změnou souboru, zachová novější obsah, zapíše audit a vrátí agentovi důvod pro opětovné načtení. Totéž platí pro revert a další zapisující aktéry.
- Stavové Git operace nad stejným worktree/ref, změny téhož lockfilu/balíčkovací operace a migrace stejné projektové DB mají úzký zámek podle resource key. Preflight se opakuje po získání zámku, protože externí proces zámek nesdílí. Editace různých souborů zůstávají paralelní. Dev servery se centrálně neserializují a kolize portu neopravňuje ukončit cizí proces.
- Verification record obsahuje druh kontroly, příkaz či nástroj, deklarovaný rozsah vstupů, výsledek, čas, zdrojovou relaci a workspace revizi. Před zobrazením jako aktuální se porovnají relevantní vstupy a jejich hash/config/tool identita. Změna mimo rozsah sama důkaz nezneplatní; změna uvnitř, chybějící vstup nebo neúplné pozorování ano. Starý record bez potřebných metadat je `unknown`, nikoli `verified`.
- Audit změn a zamítnutí ukládá identity, revize, zdroj a důvod, nikoli tajný obsah. Backend je zdroj pravdy pro projekce UI.

## Důkazy a hranice

- Concurrency fixture pro dva konfliktní resource keys, paralelní nezávislé soubory, stale patch, externí změnu během čekání a restart.
- Integrační důkaz `AC-O1-22/23/24` zahrne odmítnutí před zápisem, zachování novějšího obsahu a přesnou invalidaci ověření.
- Produktová koordinace relací a subagenti zůstávají S/O1; bezpečnostní jádro platí pro každého zapisujícího aktéra i bez jejich UI.
