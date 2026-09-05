# R2 – bezpečný životní cyklus změny a první skutečný model

| Položka | Hodnota |
| --- | --- |
| Stav | Návrh k revizi; rozdělení fáze a skutečný model v R2 schváleny autorem |
| Datum | 5. září 2026 |
| Autorita | PRD v1.0, PROJECT_CONTEXT.md a rozhodnutí autora o pořadí R2/R4 |
| Výchozí stav | `ae6cb49`, integrované R1, vyplněný autorský checklist |
| Výstup | Návrhová specifikace; není to provedená implementace ani test report |

## 1. Cíl a hranice

R2 rozšíří existující headless jádro o cestu analýza → změna → ověření →
diff/výsledek → bezpečný návrat. Headless znamená bez produktového grafického
rozhraní. Stejnou cestu projde deterministická náhrada modelu i první skutečný
model. CLI zůstává interním vstupem do služeb budoucího Electron UI.

Autor schválil přesun výběru poskytovatele a prvního skutečného adaptéru z R4
do R2. Nemění se produktová etapa O1 ani význam jejích akceptačních kritérií.
PRD v1.0 zůstává neměnným snapshotem; mění se pořadí implementace uvnitř O1.
OD-04 není tímto uzavřeno: konkrétní poskytovatel se vybere až podle měření.

Mimo R2 zůstává produktové UI, úplná Git pracovní plocha, vzdálený Git,
více souběžných uživatelských relací, subagenti, Auto režim, cloud, strukturální
TypeScript nástroje, repo mapa, produktová paměť a vizuální ověřování.
R2 neslibuje izolaci libovolného shellu od souborů nebo sítě.

## 2. Rozdělení a závislosti

| Část | Samostatně ověřitelný výstup | Závislost |
| --- | --- | --- |
| R2.1 | Cílený zápis s obnovovacím obsahem, revizí a auditní stopou | R1 |
| R2.2 | Agentní diff a bezpečný návrat v Git i non-Git projektu | R2.1 |
| R2.3 | Trvalé schválení, omezený proces a platnost ověření | R2.1; procesní experiment před zpřístupněním shellu |
| R2.4 | Obnova po pádu, úplná fake sada, provider eval a živý průchod | R2.1–3 |

Procesní experiment je první riziková technická práce R2.3 a může předcházet
implementaci zápisů. Návrh recovery, tedy obnovy po přerušení, patří už do
R2.1; R2.4 ověřuje jeho propojení, nedoplňuje jej zpětně.

Alternativami jsou jeden velký implementační plán nebo živý model před
bezpečným zápisem. Doporučené čtyři části umožňují samostatně prověřit obnovu
a procesy a měřit model nad již ověřenými nástroji. První adaptér přesto musí
být hotový před uzavřením R2.

## 3. Architektura a konkrétní průchod

`RunAgentLoop` zůstává jedinou agentní smyčkou. `ToolExecutionHarness` nadále
validuje nástroje, rozhoduje o oprávnění a vlastní audit spuštění. Registry
obsahuje verzované definice; model ani CLI nespouští infrastrukturu přímo.

| Hranice | Odpovědnost |
| --- | --- |
| `backend/core` | Životní cyklus změny, oprávnění, revize, platnost ověření, recovery pravidla |
| `backend/infrastructure` | Souborové operace, Git pozorování, SQLite, procesy, provider API |
| `shared` | Validované přenositelné příkazy, výsledky a události |
| `apps/cli` | Vstup, zobrazení žádosti, předání rozhodnutí, strukturovaný výsledek |
| `tests/support` | Izolované projekty a řízené chyby; žádná produkční závislost |

Příklad: uživatel požádá o opravu funkce součtu. Model vyhledá a přečte
soubor, dostane jeho hash a navrhne cílenou náhradu. Backend uloží obnovovací
obsah a po nové kontrole zapíše změnu. Model požádá o test. CLI zobrazí přesný
příkaz, adresář, důvod a dopad; uživatel jej jednorázově povolí. Backend
spustí proces, uloží výsledek s testovanou revizí a vrátí agentní diff.
Samostatná uživatelská akce potom vrátí změnu, pokud se její obsah nezměnil.

## 4. Zápis, obsahové otisky a souběh

R2 zavede cílenou editaci existujícího textového souboru. Jedno volání mění
jeden soubor; více editací uvnitř něj se připraví a ověří před publikováním
celého nového obsahu. Vytváření, mazání, přejmenování a binární editace nejsou
součástí prvního nástroje; registry je nesmí předstírat jako podporované.
Vícesouborový change set je skupina auditovaných operací, nikoli příslib
atomické transakce nad celým souborovým systémem.

Vstup nese relativní cestu, očekávaný hash a přesnou náhradu původního textu.
Nejednoznačná náhrada nebo nesoulad hashe končí bez zápisu. Agent musí načíst
a znovu analyzovat aktuální obsah; automatické přebazování patche není R2.
Zachovává se kódování a konce řádků podporovaného textu; nepodporovaný obsah
se odmítne. Limity vstupu, velikosti souboru a výstupu budou explicitní
kontrakty v plánu R2.1, navazující na stávající omezené čtení R1.

Kontrola kořene a citlivých cest zahrnuje kanonický cíl, junction/symlink,
alternativní Windows cesty a opětovnou kontrolu před publikováním. Hash se
ověřuje nad skutečnými bajty. Samotný watcher není oprávnění k zápisu.

Implementace musí doložit ochranu mezery mezi poslední kontrolou a zápisem
pro podporované Windows operace. Pouhé `read → hash → rename` není důkaz,
že souběžný externí editor nemůže být přepsán. R2.1 má před implementací
publikování ověřit mechanismus souborových handle a sdílení přístupu na
Windows; pokud ochranu nelze zaručit, zápis se nesmí vydávat za bezpečný.
Konkrétní mechanismus a jeho omezení uzavře technické ADR s konfliktními testy.

## 5. Obnovovací data a pád mezi souborem a databází

Před zápisem vznikne lokální obnovovací kopie skutečného obsahu, také v Git
projektu. HEAD nenahrazuje necommitnutý výchozí obsah. Obnovovací data jsou
mimo procházený projekt a nejsou součástí modelového kontextu ani event logu.

Zápis používá trvalý záznam záměru s ID operace, cestou, hashem před/po,
odkazem na obnovovací obsah a proveniencí běhu a tool callu. Po zajištění
obnovovacích dat a záměru lze publikovat soubor; poté se v jedné SQLite
transakci potvrdí výsledek, audit a zvýšení revize. Selhání potvrzení znamená
`recovery_required`, nikoli úspěšně dokončený tool call.

Po restartu se nedokončený záměr porovná se skutečným souborem:

- Hash před změnou: změna není potvrzena jako použitá; neprovádí se automaticky znovu.
- Hash po změně: backend může idempotentně doplnit chybějící evidenci; nezapisuje soubor znovu.
- Jiný hash nebo chybějící soubor: konflikt vyžadující řešení, žádné slepé přepsání.

Migrace zachovají R0/R1 relace a eventy, proběhnou se zálohou a kontrolou
integrity. Obnovovací data aktivních a nerozhodnutých operací nesmí odstranit
retence. Přesná SQL schémata vzniknou v dílčím plánu s migračními testy.

## 6. Diff a bezpečný návrat

Backend zachytí Git identitu, branch, HEAD a výchozí stav indexu a worktree.
Agentní diff porovnává vlastní zaznamenané změny; běžný Git diff proti HEAD
sám o sobě neoddělí ruční práci. R2 nemění index, branch ani commity.
Nedostupný Git, detached HEAD a konflikty mají explicitní omezený stav;
konfliktní cílový soubor se needituje, non-Git obsahová obnova zůstává možná.

Návrat konkrétní změny ověří, že současný obsah odpovídá jejímu výsledku.
Při neshodě skončí konfliktem a soubor zachová, i když by se některé změny
daly sloučit. Automatické slučování není nutné pro bezpečný R2 návrat.
Návrat celé relace provádí vlastní změny v opačném pořadí a eviduje jednotlivé
výsledky; po konfliktu nepředstírá úplný návrat. Novější navazující změna se
musí vrátit před starší změnou stejného souboru. Návrat sám má trvalý záměr,
hashové kontroly a recovery stejně jako běžný zápis.

## 7. Workspace a ověření

`workspaceRevision` je monotónní číslo pozorovaných relevantních změn.
Zvyšuje se při vlastním zápisu/návratu, rozpoznané externí změně, změně Git
identity a dokončení serializované stavové operace. Samotná zpráva jej nemění.
Úzký časově omezený zámek (resource lease) eviduje vlastníka a konkrétní zdroj;
není globálním zámkem všech souborů. Expirace neznamená, že původní proces
přestal působit; recovery nejprve ověří vlastnictví a skutečný stav.

Verification record obsahuje druh kontroly, přesný bezpečný příkaz, rozsah,
běh, čas, exit code, výsledek a pozorovanou revizi. Relevantní změna ponechá
historický výsledek, ale označí jej jako zastaralý. Pro R2 se při neznámém
rozsahu konzervativně invaliduje celý projektový výsledek.

Před a po testu se znovu posoudí relevantní stav. Změna během testu, timeout,
zrušení nebo neúplné sledování nedovolují označení aktuálního výsledku jako
ověřeného. Úspěšný exit code není sám důkaz relevance testu k zadání.
Syntetický scénář má známou relevantní kontrolu; u živého běhu se eviduje
rozsah a známá omezení. Volný text modelu nepřebíjí tento stav.

## 8. Oprávnění a procesy

Politika R1 se rozšíří o čekající rozhodnutí. Permission request trvale váže
ID nástroje/verzi, normalizovaný vstup, cwd, důvod a dopad ke konkrétnímu
spuštění. Jen shodné jednorázové povolení dovolí přechod do běhu. Zamítnutí,
zrušení, opakovaná odpověď nebo změněný vstup nesmí spustit příkaz podruhé.
Po schválení se znovu ověří podmínky; změněný účinek vyžaduje nový požadavek.
Neinteraktivní CLI bez dodaného rozhodnutí nikdy implicitně nepovoluje shell.

R2 shell/test je omezený neinteraktivní proces s explicitním cwd, timeoutem,
limitem výstupu, stdout/stderr, exit code a zrušením. Bezpečný zápisový nástroj
není sandbox pro shell: příkaz může měnit soubory, a proto schválení musí
uvést tento dopad. R2 demonstrační příkaz nepíše projektový zdrojový obsah;
neočekávané účinky se zachytí jako změna stavu a nesmějí se automaticky vracet
jako hashově evidovaný patch agenta.

Před zpřístupněním se ověří Windows Job Object nebo ekvivalent pro životní
cyklus podporovaného stromu. Test zahrne potomka, předčasný konec rodiče,
timeout, zrušení, limit výstupu a pád hostitele. Neúspěšné ukončení má viditelný
stav a blokuje tvrzení o čistém dokončení. ADR 0002 samo tuto bránu nesplňuje.
Silnější omezení souborů a sítě zůstává samostatným experimentem dle PRD.

Argumenty shellu a provider chyby se nesmějí slepě ukládat přes současný R1
záznam argumentů. Bezpečná projekce musí vzniknout před prvním perzistentním
zápisem; tajemství se neukládají ani do stdout reportu či diagnostiky.
Příkazy nesmějí dědit API klíč použitý adaptérem.

## 9. První skutečný model v R2

Adaptér zůstává za existujícím `ModelAdapter` portem. Podporuje text,
streamování, strukturovaná volání nástrojů, capability deklaraci, zrušení,
usage a normalizované chyby dle FR-LLM-08. Neúplný stream ani nevalidní
argumenty nesmí vyvolat nástroj. Opakování požadavku po síťové chybě nesmí
opakovat již provedené externí účinky. Přerušený běh nepokračuje automaticky
z odhadnuté historie; podporovaná obnova nejprve rekonstruuje potvrzené stavy.

Výběr proběhne na stejné malé syntetické fixture pro dostupné kandidáty
uvedené v PRD. Jejich názvy v PRD nejsou důkazem aktuální API dostupnosti.
Před evalem se ověří oficiální API dokumentace, dostupnost modelu, podmínky
zpracování dat a datovaný ceník. Nedostupný kandidát se eviduje a náhrada se
zdůvodní v rozhodnutí OD-04. Tento dokument nevybírá konkrétní SDK ani model.

Eval zaznamená platnost tool callů, dokončení a opravu po chybě, latenci,
tokeny včetně dostupných reasoning údajů a cenu celého úkolu. Chybějící usage
se uvede jako neznámé, nikoli nula. Porovnání oddělí chybu modelu od chyby
adaptéru. Pro kandidáty stačí omezené eval adaptéry; druhý plný produktový
adaptér není dodatečnou podmínkou R2.

Živé testy jsou zvláštní opt-in příkaz mimo výchozí testy. Mají pevné limity
requestů a kroků, předem uvedený nákladový strop a syntetický obsah. Klíč se
předá pouze pro relaci mimo argumenty příkazové řádky a historii; zůstává
v paměti adaptéru. Před prvním síťovým odesláním musí být známý poskytovatel,
rozsah obsahu a datové podmínky; režim dle FR-LLM-13 vyžaduje potvrzení.
Změna poskytovatele nesmí tiše přeposlat obsah jiné službě.

R2 live brána vyžaduje alespoň 4 úspěchy z 5 dostupných API pokusů podle
AC-O1-04; hodnotí změnu, relevantní test, diff a bezpečný návrat. Nedostupné
API se uvede jako neověřená live brána, nikoli splnění pomocí fake výsledku.
R4 naváže širšími úlohami a regresí již vybraného adaptéru.

## 10. Testovací a dokončovací brány

| Oblast | Povinný důkaz | Vazba na PRD |
| --- | --- | --- |
| Patch | Správný vstup, stale hash, nejednoznačný text, souběžná editace, únik cesty | FR-TOOL-09, FR-COORD-08 |
| Obnova | Pád před/po publikování a před/po SQLite potvrzení; žádný duplicitní zápis | FR-CHG-01/03, §12.2 |
| Návrat | Git i non-Git, předchozí ruční změna, novější konflikt, více změn souboru | FR-CHG-04 až 06, FR-VCS-01 až 07 |
| Oprávnění | Allow, deny, zrušení, restart, duplicitní odpověď, změněný vstup | FR-PERM-02/03/07, §11.5 |
| Proces | Potomci, timeout, zrušení, výstup, pád hostitele, neúspěšné ukončení | FR-TOOL-05/06/10 |
| Ověření | Pass, fail, změna během/po testu, pravdivý neověřený výsledek | FR-CHG-08, FR-COORD-14 |
| Revize a lease | Externí editace, Git identita, expirace se stále běžícím vlastníkem | FR-COORD-01/02/09/10 |
| Model | Společný kontrakt fake/live, chybové streamy, usage, redakce, eval | FR-LLM-01/02/03/08/11/12/13 |
| Celý tok | Dvě čtení/hledání, patch, relevantní test, diff, návrat; 10/10 v obou režimech | AC-O1-02/03 |

Deset opakování nevyžaduje ruční reset: runner vytváří izolované fixture
a kontroluje návrat k jejich původnímu obsahu. Report musí odlišit úklid
testovacího prostředí od prokázaného návratu nástrojem Codrynu.

Každá dílčí implementace zachová R1 regresi, projde přiměřenými testy,
typecheckem, lintem a kontrolou závislostí. Integrační brána R2 doplní Windows
balení a packaged smoke pro nové nativní části. Live brána zůstává oddělená.
R2 není dokončeno, dokud existuje nevyřešená bezpečnostní brána zápisu,
procesů, obnovy nebo chybí důkaz prvního skutečného adaptéru.

## 11. Navazující plán a autorský důkaz

Po revizi tohoto návrhu vzniknou čtyři dílčí implementační plány s přesnými
kontrakty, soubory, migračními kroky a spustitelnými testy. Technické volby
Windows zápisu a procesů musí být nejprve doloženy experimentem a ADR;
plán nesmí předem označit neověřený mechanismus za vyhovující.

Dokumentační výstup R2 zahrne architekturu, traceability matici, test report,
provider eval a rozhodnutí OD-04, omezení obnovy a autorský checklist.
Autor vysvětlí rozdíl mezi hashem a revizí, Gitem a obnovovací kopií,
schválením a spuštěním, historickým a aktuálním ověřením a proč po pádu
nelze neznámý shellový účinek automaticky zopakovat.
