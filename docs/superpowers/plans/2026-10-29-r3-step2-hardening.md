# R3 — zabezpečení chybného startu a testovacích profilů

Datum: 29. října 2026. Základ změny: `cde2cea`, větev
`feat/r3-electron-workspace`. Rozsah: bod 2
[předání R3](2026-10-11-r3-progress.md). Node `24.19.0`, npm `11.17.0`, Windows.

## Opravené vady

1. Při selhání otevření nebo obnovy databáze původní `r3:invoke` odpovídal
   bez ověření odesílatele a vstupu. Okno nyní i bez služeb registruje stejný
   handler jako při běžném startu. Ten nejprve kontroluje okno, hlavní frame,
   URL a striktní schéma požadavku; až platnému požadavku vrací bezpečnou chybu
   `R3_RECOVERY_REQUIRED`. Žádná služba ani nový univerzální IPC kanál nevzniká.
2. Testovací profil byl omezen jen textovým porovnáním cesty. Nová společná
   infrastrukturní kontrola vyžaduje existující podadresář artefaktů, porovnává
   skutečné cesty a kontroluje každý adresář pomocí `lstat`. Odmítá symlink
   nebo junction kořene, cíle i mezilehlých adresářů, také pokud odkaz míří
   zpět dovnitř artefaktů. Electron test/smoke startup ověřuje profil před
   `app.setPath`; testovací launcher jej ověřuje před spuštěním Electronu.
3. Chyba sestavení běhu dříve zanechala `interrupted` s prázdným důvodem.
   Backend nyní transakčně ukládá povolený kód a pevný bezpečný text do
   existujícího `failure_json`. Neznámá chyba dostane `R3_INTERNAL`, známá
   např. `R3_SECRET_UNAVAILABLE`. Zastavení během sestavování je
   `R1_CANCELLED`, nikoli selhání. Bez vytvořeného agentního běhu projekce
   odvozuje fázi `failed` nebo `cancelled` z uloženého důvodu. Stav zůstane
   čitelný po restartu bez automatického spuštění; zámek projektu se uvolní.

Přibyla jen vazba test-support na již existující interní workspace
`@codryn/infrastructure`, včetně stejné změny lockfile. Žádná externí
závislost ani nová migrace nebyla přidána. Renderer nedostal přístup k Node,
souborům, procesům ani databázi.

## Důkaz

Regresní testy byly nejprve spuštěny nad původním produkčním kódem:
startup vracel `R3_RECOVERY_REQUIRED` cizímu odesílateli, junction v profilu
došel až ke spuštění launcheru a factory chyba měla `failure: null`.
Poté stejné regrese s opravami prošly. Při tvorbě náhrad Electronu byly
opraveny i dvě testovací chyby (chybějící `app.once` a omylem vrácený mock
z `beforeEach`); jejich selhání nejsou vydávána za vady produktu.

| Kontrola | Výsledek |
| --- | --- |
| Cílená sada handler/startup/launcher/profile boundary/run manager/SQLite | 24/24 před doplněním posledního smoke boundary testu |
| Úplná sada včetně posledního testu | exit 0, 90 souborů prošlo / 2 přeskočeny; 612 testů prošlo / 3 přeskočeny; 215,05 s |
| `npm.cmd run typecheck` | exit 0, všechny workspace |
| `npm.cmd run lint` | exit 0 |
| `npm.cmd run check:deps` | exit 0, 300 modulů / 911 vazeb, bez porušení hranic |
| `npm.cmd ls @codryn/infrastructure --workspace @codryn/test-support --depth=0` | exit 0, lokální workspace vazba |

Úplná sada běžela na hostitelských Windows bez souběžných statických kontrol
přes existující `runGate` s limitem 600 s. Volání `npm.cmd test` dostalo
reportery `default`, `json` a
`--outputFile=.r3-artifacts/2026-10-29-step2/full-tests.json`.
JSON (`success: true`, nula selhání) a `full-tests.log` jsou lokální
ignorované artefakty v této složce. Sada obsahovala i R2/R3 Git/non-Git
průchody a ochranu rozpracovaného Git indexu.

Nové testy jsou v `apps/desktop/test/r3-startup.test.ts`,
`backend/infrastructure/test/r3-profile-boundary.test.ts`,
`tests/support/test/r3-desktop.test.ts`; scénáře trvalých chyb a zrušení
rozšiřují `backend/infrastructure/test/r3-run-manager.test.ts`.
Samostatný read-only code review nenašel důležitou chybu vyžadující opravu.

Přeskočené testy zůstávají dva opt-in packaged smoke R0/R2 a souborový
symlink podmíněný oprávněním Windows. Nové junction testy se skutečně provedly.
Startup testy používají náhradu Electron API; úspěch těchto testů není
spuštěním nového distribučního buildu ani důkazem packaged DPAPI ochrany.
Neřeší se nepřátelská souběžná manipulace jiným programem téhož OS uživatele.

## Pokračování

Bod 2 je dokončený. Navazuje bod 3: zpřístupnit R0 diagnostiku, umožnit
návrat z vytížených nastavení k běhu a upravit opakování úkolu přes
editovatelný text; ověřit stránkování aktivit a rozhraní na 900/1280/1440 px.
Package, skutečné Electron UI E2E, problémové scénáře bodu 4, živé API
a autorské přijetí zůstávají samostatné. Celé R3 není tímto uzavřené.
