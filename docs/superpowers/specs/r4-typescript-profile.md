# R4 TypeScript profil a relevantní ověřování

**Stav:** oblastní technická specifikace odvozená z `PRD_v1.1.md` a schváleného směru R4; před produkční implementací ověřit rozhraní proti aktuálnímu kódu.

**Autorita:** `PRD_v1.1.md` `FR-TS-01..08`, `FR-TERM-04..06`, `FR-ORCH-06/07`, `AC-O1-13/24/27`; `docs/product/ROADMAP.md` §8. Implementační kroky jsou ve dvou TypeScript plánech v `docs/superpowers/plans/`.

## Kontrakt

- Backend rozpozná malý TypeScript/Node.js, React a podporovaný Next.js projekt, načte povolenou konfiguraci a vrátí úroveň podpory `supported/limited/unsupported` s důvodem. Neplatný nebo nedostupný `tsconfig` se označí, nepředstírá plnou analýzu.
- Pro rozpoznaný projekt nabídne přesné relevantní kandidátní příkazy kontroly typů a testů bez instalace závislostí. Návrh příkazu nedává oprávnění ke spuštění; shellový příkaz vždy prochází stávajícím permission enginem a omezeným procesním runnerem. Skutečný příkaz, výsledek a rozsah se zapíší k běhu.
- `typescript.query@1` odpovídá na definici podle jména/umístění, reference, signaturu, exporty, typ, diagnostiku a import/export vazby. Vrací omezená strukturovaná data, nikoli AST nebo celý zdrojový text. Dotaz respektuje `tsconfig`; při chybě parseru je fallback výslovně omezený. Selhání strukturální služby nevyřadí `file.read` a `text.search`.
- Všechny projektové soubory čtené pro konfiguraci, strukturální dotaz nebo index musí projít kanonickým kořenem a aktuální sjednocenou politikou z `r4-context-security.md`. Ignorované deklarace v `node_modules` se automaticky nečtou ani pro interní rozlišení typu. Standardní knihovny přibaleného TypeScriptu nejsou projektový obsah. Nespolehlivý výsledek se označí `limited`.
- Strukturní odpověď nese revizi/hash použitých zdrojů a politiky. Relevantní změna souboru či konfigurace před vydáním nebo dalším použitím výsledek zneplatní. Ověřovací záznam nese druh, příkaz, rozsah vstupů, výsledek, čas, relaci a workspace revizi; pozdější změna deklarovaného vstupu jej zneplatní, nezávislá změna mimo rozsah sama nikoli.
- `verified` vyžaduje skutečně úspěšné relevantní kontroly nad aktuálními vstupy a pokrytí dotčených změn. Prázdná sada testů ani exit 0 z nesouvisejícího příkazu nejsou důkazem. Nedostupná, částečná či stale kontrola má viditelný důvod a nevede k falešnému dokončení.

## Důkazy a hranice

- Kontraktní a integrační testy pro rozpoznání, strukturu, ignore politiku, změnu během dotazu, neplatný config, fallback, relevantní příkazy a invalidaci ověření.
- Předem zafixovaných 20 ručně ověřených dotazů, nejméně 18 shod pro `AC-O1-13`; zveřejnit všechny neshody. Stejný build projde packaged worker smoke.
- Malý Git i non-Git TypeScript/React průchod s fake modelem: vlastní zadání, patch, dvě oprávněné kontroly, chybná kontrola a oprava, čitelný výsledek. Živý model patří do odděleného rozpočtovaného eval.

## Rozhraní první implementace ověřování

- Výchozí stav na `53dc666` používá Node 24.19.0 a npm 11.17.0. Nainstalované závislosti umožňují výchozí kontrolu typů. Poznámka v plánu o chybějících balíčcích popisuje starší kopii.
- Rozpoznání načte kořenový `tsconfig.json` a omezený řetězec relativních `extends` v projektu. Samostatné projektové reference a konfigurace z balíčků přesouvají profil do omezeného režimu. Kompilátor spouštěný se souhlasem uživatele může číst lokální deklarace závislostí. Omezený host budoucího strukturního nástroje takové deklarace při automatickém indexování nečte.
- Příkaz po schválení projde stejným procesním runnerem jako dosud. Profil přizná důvěryhodné pokrytí jen při přesné shodě s nabídkou a při novém ověření konfigurace, vstupů a neprázdného výstupu testu. Ruční schválený příkaz může běžet i bez důvěryhodného pokrytí.
- Ověřovací záznamy profilu TypeScript používají hash vstupů uložený v samostatné evidenci navázané na záznam kontroly. Stávající profil `r2-sum-v1` zachová kontrolu celého pracovního snímku. Platnost během příkazu vyžaduje úplný a nezměněný snímek. Platnost po skončení příkazu porovnává deklarované vstupy a úplnost nového pozorování.
- Zabalená aplikace dodá kopii TypeScriptu mimo ASAR, archiv souborů aplikace. Systémový Node spustí ověřenou kopii CLI z této složky. Strukturní dotazy, jejich worker a eval zůstávají součástí navazujícího plánu.
