# R4 — ověření návaznosti chatu

Implementace dodává `FR-CHAT-06` dříve a pokrývá výběr historie z `FR-CTX-01/02`.

- Jednotkové testy ověřují pořadí zpráv a rolí, strop osmi dvojic, 32 KiB UTF-8 a důvod při vynechání nadlimitní poslední dvojice.
- Testy nad skutečnou SQLite ověřují izolaci chatu, aktuální zprávu jako hranici výběru, přerušenou odpověď, neúspěšný běh, nový úspěšný pokus a chybějící koncovou odpověď.
- Dva integrační průchody s testovacím modelem v projektu s Gitem i bez něj ověřují druhý požadavek ve stejném chatu. Model dostane dokončenou výměnu se zredigovanou chráněnou hodnotou a při novém čtení získá změněný obsah souboru. Aktivita ukáže dvě použité zprávy.
- Test adaptéru zachytí požadavek pro OpenAI a ověří pořadí položek, role, poučení o starém obsahu, zachování vazby na nástroje aktuálního běhu a `store:false`.

Živý průchod s OpenAI zůstává samostatným důkazem. TypeScript ověřování a zbývající akceptační kroky repo mapy a Gitu se posuzují podle jejich plánů.

## Ověřování změn v TypeScriptu

Offline scénář pro `FR-TERM-04/05/06` a část rozpoznání z `FR-TS-01` proběhl přes desktopový backend v projektu s Gitem i bez něj. Testovací model dostal přesné návrhy a požádal jednotlivě o povolení všech pěti kontrol. Po chybném testu opravil zdroj. Změna dalšího zdrojového souboru mezi kontrolami zneplatnila předchozí kontrolu a nový běh kontroly obnovil stav ověření. Úprava poznámky mimo rozsah stav zachovala. Vrácení změny obnovilo původní hash měněného souboru.

Strukturní dotazy `FR-TS-02..08` a jejich eval `AC-O1-13` mají vlastní plán. Plná matice invalidace pracovního prostoru podle `AC-O1-24` a oddělený placený průchod zůstávají otevřené.

## Strukturní dotazy TypeScriptu

Úlohy `FR-TS-02..08` pokrývají jednotkové a integrační testy nástroje, omezeného hostu a běhu agenta. Testy ověřily dostupnost běžného čtení a hledání po selhání pracovního vlákna, stav `stale` po souběžné úpravě, syntaktický režim po rozbité konfiguraci a odmítnutí ignorovaných cest.

Pro `AC-O1-13` vznikla pevná sada 20 dotazů v commitu `185337d`, před měřením. Ze sady se přesně shodlo 19 výsledků z 20. U `refs-alias` vrátil TypeScript navíc skutečný alias reexportu `doubled` na `src/index.ts:1:23`, který ruční očekávání vynechalo. Očekávání bylo pro vyhodnocení zachováno. Úplné hodnoty, všechna porovnání a identitu měření obsahuje [protokol](evals/r4-ts-queries-report.json).

Samostatně evidovaný průchod během souběžných kontrol skončil 17/20. Dva dotazy na definici překročily pětisekundový limit pracovního vlákna a vrátily omezený výsledek. Třetí neshodou byl stejný reexport. Limit zůstal zachován. [Protokol souběžného průchodu](evals/r4-ts-queries-report-concurrent.json)

Cílená sada kontraktů, hostu, workeru a runtime prošla 19/19. Dva testy vyhodnocovače prošly 2/2. Úplná sada před opravou čtení archivu pouze v ověřovacím režimu prošla se 754 úspěšnými a dvěma přeskočenými testy. Obsahovala ověření zabalených R0 a R2.
