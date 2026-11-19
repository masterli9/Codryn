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

Po opravě čtení archivu prošly kontrola typů, lint i kontrola hranic závislostí. Na stejném finálním balíčku prošel přímý ověřovací scénář strukturního workeru, všech osm fází R3 a oba cílené testy zabaleného R2 a R4. Worker v zabalené aplikaci našel deklaraci funkce `duplicate` na `src/math.ts:1:17`. Lokální protokoly jsou v `.r3-artifacts/r4-ts-worker-GnALeD/r4-typescript-worker-smoke.json` a `.r3-artifacts/packaged-iKpzMc/r3-report.json`. Binární balíček zůstal lokální.

Otisky SHA-256 finálního balíčku

- Zdroj `91e5ed6999e80804cdc3bf7566c921a38b1739bdde0c02cb7fea3cf6f95b8e69`
- Archiv ASAR `58b599a1251bc4bd09397e9021a2287f70e407e4aea8851302c275da4d5d2279`
- Worker `9830cdd07335b07f314f311bc946990e17834fc68f981beec6ffa4ca0a810d19`

## Revize pracovního prostoru a lokální Git

Implementace je v commitech `2d8c168` a `e5782eb`. Cílené kontroly proběhly offline nad dočasnými projekty.

- `npx.cmd vitest run --project host-integration backend/infrastructure/test/git-workflow.test.ts` prošel 4/4. Testy ověřily hranice projektu v podadresáři většího pracovního stromu, rozlišení změn v indexu a na disku, přidání a odebrání souboru z indexu, zobrazení historie a přepnutí čisté lokální větve. Desktopový backend s testovacím modelem dostal jen změny z indexu. Test doložil zachování původního commitu po externí změně indexu, samostatné potvrzení upravené zprávy a odmítnutí repozitáře s externím Git filtrem.
- Testy revize pracovního prostoru a zámku prošly 2/2. Ověřily původ změny, odmítnutí staré revize, opakování stejné mutace po novém otevření úložiště, souběh různých klíčů a uvolnění fronty po zrušení nebo chybě. Testy klasifikace a aktuálnosti ověření prošly 5/5. Změna nebo doplnění souboru s testovacími daty v pozorovaném rozsahu zneplatní dřívější výsledek bez ohledu na příponu.
- Samostatný test panelu prošel 1/1. Test zabalené aplikace `tests/desktop/r4-git.test.ts` prošel 1/1 na finálním balíčku. Ověřil přidání do indexu, náhled změn a místní commit až po výslovném potvrzení.

V původním balíčku opakovaně selhal chráněný zápis ve scénáři R3 s Gitem. Zápis skončil chybou `R2_GUARD_OPERATION_FAILED` ještě před vytvořením záznamu o připravované změně a scénář nedošel ke schválení příkazu. Oprava `5ef7d18` vrátila sdílenou koordinaci zápisu a pozorování disku. Po ní znovu platí, že desktop provádí chráněné zápisy v témže projektu postupně. Test výchozího Git stavu v `94ac652` ověřuje rozpoznání nadřazeného pracovního stromu i omezení zobrazených změn na otevřený podadresář.

Finální kontrola typů, lint a kontrola hranic závislostí prošly. Graf závislostí měl 379 modulů a 1 263 hran. Úplná sada měla 760 úspěšných a dva přeskočené testy, včetně scénářů R0 a R2 s čerstvě sestavenou aplikací. Na témže balíčku prošlo všech osm ověřovacích scénářů R3 a ověření strukturního dotazu TypeScriptu. Lokální záznamy jsou v `.r3-artifacts/packaged-EQClVN/r3-report.json` a `.r3-artifacts/r4-ts-worker-Lf7gFs/r4-typescript-worker-smoke.json`.

Otisky SHA-256 ověřeného balíčku

- Zdroj `ee457ff6c52a3d481b472991435ebd431212f1a69b2c1bc65d7a7ac1fdc8a401`
- Archiv ASAR `25fe75bfb9ba8d0d9318062578da05934e2f547f8bbb4fc1e51cd08f960eb0d8`

Přepnutí větve používá ochrany Gitu při zápisu do pracovního stromu. Vyžaduje znovu potvrzený čistý stav celého stromu a existující podporovanou lokální větev. Souběžný externí proces přesto může posunout referenci nebo upravit pracovní strom mezi poslední kontrolou a příkazem. Commit používá zámek indexu a porovnání očekávaného hashe reference přímo při zápisu. [Kontrakt lokálního Gitu](superpowers/specs/r4-local-git.md)

Tento původní průchod serializoval zápisy v témže projektu a ještě neměl samostatný migrační a balíčkovací důkaz. Pozdější doplnění níže tyto mezery řeší. Obecný test může číst i vstupy mimo pozorované cesty; důkaz platnosti se vztahuje k pozorovaným vstupům. Desktop při aktivním běhu nadále blokuje lokální Git mutace globálně.

## Trvalé otázky a vestavěné postupy

Přírůstek z 18. listopadu 2026 ukládá otázku a čekající krok atomicky, uvolňuje runtime během čekání a po odpovědi pokračuje se stejným runId, počtem kroků a sadou změn. Restart v nejistém bodě po přijetí odpovědi vyžaduje bezpečnou obnovu. Před pokračováním se sestaví aktuální kontext a dřívější data nástrojů označí jako zastaralá. [Rozhodnutí o checkpointu](decisions/0008-r4-question-checkpoints.md)

- `backend/infrastructure/test/question-runtime.test.ts` prošel 5/5. Pokrývá opakovanou odpověď, restart desktopu, dřívější patch bez replay, odmítnutí otázky, následné samostatné oprávnění příkazu, zrušení a uvolnění projektu po přerušení v nejistém bodě.
- Testy schema/persistence prošly 2/2 a test otázkové karty 1/1. Kontrakt adaptéru má regresi obnovení původních identit již dokončených function callů do nového adaptéru.
- Registry manifestů a katalog prošly dvěma kontraktními testy. `builtin-workflows.test.ts` prošel 4/4 v Git i non-Git projektu. Plánování má čtecí nástroje, ověřování používá skutečný příkaz až po samostatném schválení.
- `tests/desktop/r4-questions.test.ts` prošel 1/1 v sestavené aplikaci. Ověřil obnovu rendereru i desktopu při čekající otázce a nové samostatné povolení příkazu po odpovědi.

Na finálním balíčku prošlo osm scénářů R3 a strukturní dotaz TypeScriptu. Místní protokoly jsou v `.r3-artifacts/packaged-V7v7KO/r3-report.json` a `.r3-artifacts/r4-ts-worker-1hV4gL/r4-typescript-worker-smoke.json`. Závěrečná kontrola typů, lint a hranice závislostí prošly pro 394 modulů a 1 320 hran.

Otisky SHA-256 tohoto balíčku

- Zdroj `a41de13fc3d40ba74175b3f0198ccde9f9c636438e010f1e33d39eb470fe0014`
- Archiv ASAR `8e58fd6cd51bc9d0c20c4a9ee72944d46ca9609cf59d733eecfbdd3f2cce63e1`

První úplná regrese měla 772 úspěšných, dva přeskočené a tři neúspěšné testy. Dvě selhání byla v testových kontrolách po přidání ovládacích prvků a projekce čekajícího příkazu. Jejich úzká oprava prošla 9/9. Třetí případ narazil na obsazený dočasný adresář při úklidu procesního testu. Izolované opakování souboru prošlo 4/4. Závěrečná úplná regrese na aktuálním balíčku měla 775 úspěšných a dva přeskočené testy.

Zafixovaný offline eval prošel 9/9 a má vlastní [protokol](r4-eval-report.md). Rozšířený živý eval a skutečný uživatelský průchod čekají schválený rozpočet. [Úplná matice 108 M/O1 požadavků a 31 AC](r4-requirement-matrix.md) zachovává otevřené brány včetně dřívějších mezer R3. Celé R4 zůstává otevřené.

## Kontext dalších modelových tahů

Doplnění z 18. listopadu 2026 nově sestavuje omezený kontext před každým dalším tahem produkčního R2/desktopového běhu. Změněná nebo znovu zakázaná reference se vynechá s důvodem. Jednorázová výjimka se při dalším sestavení znovu nespotřebuje. Dřívější souborové výřezy, hledání a TS výsledky projdou kontrolou aktuálního pozorovaného obsahu a politiky. Při chybějícím důkazu se odesílá pouze označení zastaralého výsledku. Role a call ID zůstávají spárované a hotové nástroje se neopakují.

Testy `model-turn-context.test.ts` a `model-turn-freshness.test.ts` prošly 5/5. Ověřily čtyři navazující tahy po změně pravidel bez znovuobjevení starého obsahu, změnu po vlastním patchi, ruční změnu a původní i následné použití jednorázově povoleného výřezu. Sedm cílených regresí otázky a skutečného Git/non-Git cyklu schválení, kontroly a návratu prošlo. Audit zachycuje skutečný kontext každého tahu a projekce ukazuje nejnovější sestavení.

Kontrola typů všech workspace prošla. Nová konsolidovaná regrese a identita balíčku po tomto doplnění se doloží po dokončení koordinace a ověřovacího rozsahu. Ochrana posuzuje stav před odesláním požadavku. Externí změna během již probíhajícího vzdáleného požadavku zůstává samostatnou hranicí.

## Koordinace skutečných prostředků

Sdílená mutační fáze dovoluje různé soubory v témže projektu zapisovat souběžně. Kanonický zámek konkrétního souboru trvá po celou životnost guardu a vztahuje se i na návrat změn. Úplné pozorování drží výhradní fázi a čekající pozorovatel zabrání předbíhání novými mutacemi. Indexová kontrola konfliktu používá doslovný pathspec bez úplného čtení pracovního stromu.

- `resource-barrier.test.ts` prošel 2/2 pro férovost, omezené fronty, zrušení a chybu.
- `native-independent-writes.test.ts` prošel 2/2: skutečné souběžné guardy sourozeneckých souborů a dva R2 aktéři, jejichž zápisy oddálí úplný observer. Původní `guarded-writer.test.ts` prošel 13/13 včetně ochran rodičovského přejmenování, junction a oplock.
- `database-coordination.test.ts` prošel 1/1: dva procesy migrují starší schéma a dva openy v jednom procesu koordinují zálohu podle kanonické DB cesty. Jediná záloha napříč procesy se neprohlašuje.
- `scripts/native-resource-lock.test.mjs` prošel 1/1 pro dva balíčkovací procesy a uvolnění po chybě. Zámek omezený časem chrání skutečný package-r3 vstup až po finální metadata. Pomocník předpokládá jeden běh CLI na proces.

Po změně koordinace prošly oba původní skutečné R3 Git/non-Git průchody (2/2, ostatních devět testů příkazu bylo vynecháno filtrem).

Tato evidence používá místní Windows fixtures. Konsolidovaný nový balíček a úplná sada zatím čekají; celý obecný koordinační a víceagentní produkt tím není uzavřený.

## Přesný pozorovaný rozsah kontrol

Nový důkaz vyžaduje přesný marker `bounded-project-inputs-v3` v aktuálním i uloženém rozsahu. Starší záznam neztrácí původní běh ani výsledek, ale je označen jako zastaralý. Uživatelsky ignorovaný běžný vstup, kolize názvu souboru s metadaty, alias, binární či nadlimitní vstup neumožní úplnou klasifikaci. Úspěšná zpráva uvádí stejné pozorované vstupy projektu.

Scope/classifier/store regrese prošly 9/9. Skutečný `r4-ts-workflow.test.ts` non-Git scénář prošel 1/1 (druhá varianta vynechána filtrem), včetně schválení skutečných příkazů, původního selhání, opravy, invalidace při změně a doplnění dat bez zdrojové přípony a návratu. Vnější změna zachová důkaz jen pro nezměněné pozorované vstupy. Pevně chráněné adresáře, tajné soubory, libovolné externí vstupy a závislosti obecného shell příkazu se tím neprokazují. Obecné sledování běhového I/O není implementováno; úplná `AC-O1-24` zůstává otevřená.

První nové packaged pokusy `.r3-artifacts/packaged-gO4gpk` a `packaged-y0GxDU` zůstávají neúspěšné. Druhý bezpečný protokol určil `workflow-git / revert / TimeoutError`: sdílených 25 sekund vypršelo po dokončeném a ověřeném pětikrokovém běhu, před auditním voláním samotného návratu. Fixture vznikla v 14:47:31 UTC, běh skončil v 14:47:49.605 a timeout v 14:47:56. Skutečný zdrojový TS cyklus včetně návratu prošel za 35,85 s. Po přidání opakované validace kontextu má pouze testovací workflow limit 60 s a nadřazený proces 70 s; ostatní fáze mají původních 25/30 s. Příkazová oprávnění, produktové a worker limity se nemění. Bezpečný trace dalších pevných kroků zůstává dostupný; úspěch nového balíčku zatím není doložen.

Nová úplná sada měla 785 úspěšných, dva přeskočené a dva neúspěšné testy. Konfliktový test ještě mockoval původní úplné Git inspect místo indexové kontroly; nyní vytváří skutečný unmerged index ve fixture. Druhá regrese zbytečně nahrazovala bezpečný prázdný důvod pádu TS workeru stavem stale. Oprava zachová jen validovaný omezený diagnostický výsledek bez položek, obsahu a hashů. Výsledek s cílovým hashem se dál odstraní. Cílené regrese prošly 4/4 (18 vynecháno filtrem), včetně původního runtime po pádu workeru a změny politiky bez návratu starého obsahu. Nová úplná sada a packaged průchod čekají.
