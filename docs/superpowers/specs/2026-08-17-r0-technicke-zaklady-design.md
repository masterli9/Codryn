# R0 – technické základy: návrhová specifikace

| Položka | Hodnota |
| --- | --- |
| Stav | Návrh schválený v konverzaci, čeká na revizi souboru |
| Datum | 17. srpna 2026 |
| Implementační krok | `R0 – ověření technických základů` |
| Produktová autorita | `PRD_v0.3.md` |
| Pořadí implementace | `ROADMAP.md` |
| Rozsah a rizika | `ETAPIZACE_v0.3.md`, F0 |
| Rozhodnutí | `REGISTR_ROZHODNUTI_v0.3.md`, zejména DR-05, DR-06, DR-10, DR-16 a DR-21 |

## 1. Cíl

R0 založí spustitelný a testovatelný technický základ Codrynu pro Windows 11. Výsledkem bude minimální Electron diagnostická aplikace a stejná backendová diagnostická služba volatelná bez rendereru. Společně ověří hranice frontend/backend, validované IPC, SQLite/WAL, verzované migrace, procesní runner, lokální Git fixture a reprodukovatelný Windows build.

R0 neimplementuje agentní smyčku. Definuje pouze její základní datové a stavové invarianty tak, aby na nich mohl R1 stavět bez změny hranic aplikace.

## 2. Pozorovatelný výsledek

Po spuštění aplikace uživatel uvidí jednoduchou diagnostickou stránku s akcí **Spustit kontrolu R0**. Kontrola vrátí samostatný stav pro:

1. otevření databáze;
2. aplikaci a opakovatelnost migrací;
3. WAL, cizí klíče a integritní kontrolu;
4. uložení a opětovné načtení testovací relace;
5. vytvoření a ověření zálohy;
6. zachycení stdout, stderr a exit code fixture procesu;
7. timeout a ukončení podporovaného stromu fixture procesu;
8. dostupnost Git CLI;
9. lokální Git repozitář a bare remote bez sítě;
10. zjištění typu nakonfigurovaného Git credential helperu bez čtení tajemství.

Každý krok skončí stavem `pass`, `fail` nebo `skipped`. Celkový výsledek je `passed` pouze tehdy, když všechny povinné kroky skončí `pass`.

Stejná diagnostická služba bude volatelná přímo z integračního testu bez Electron rendereru. Zabalená aplikace bude mít interní `--r0-smoke` režim, který provede tutéž kontrolu, uloží redigovaný JSON report do datového adresáře aplikace a skončí odpovídajícím exit codem.

## 3. Vědomě nezahrnutý rozsah

- produktový chat, React renderer, finální layout a design system;
- modelový adapter, tool registry a skutečná agentní smyčka;
- editace projektu, shellový tool, oprávnění uživatele a návrat změn;
- účet, cloud, synchronizace, MCP, skills a pluginy;
- vzdálené Git operace přes síť;
- produktové schválení Windows Job Object strategie pro O1;
- obecná diagnostická konzole nebo IPC pro spuštění libovolného příkazu.

## 4. Technologická rozhodnutí R0

### 4.1 Základ

- package manager: npm workspaces;
- vývojový runtime: Node.js 24.19.0 LTS; Electron runtime obsahuje Node.js 24.18.1;
- desktop: Electron 43.4.0;
- build a distribuce: Electron Forge 7.11.2 se stabilní Webpack + TypeScript šablonou;
- TypeScript: 6.0.3 pro kompatibilitu s JavaScript compiler API používaným současným Webpack toolchainem; přechod na TypeScript 7 je samostatná pozdější změna;
- runtime validace hranic: Zod 4.4.3;
- databáze: vestavěné `node:sqlite`, bez ORM;
- testy: Vitest 4.1.7 v Node prostředí, bez browser mode a bez síťového test UI;
- kontrola závislostí: dependency-cruiser 18.1.0;
- cílová platforma R0: Windows 11 x64.

Závislosti se zapisují do lockfilu a CI i lokální ověření používají `npm ci`. Automatické nekontrolované upgrady major nebo minor verzí nejsou součástí R0.

### 4.2 Proč `node:sqlite`

Electron 43 obsahuje Node 24 se SQLite modulem. Použití vestavěného modulu odstraňuje Electron ABI rebuild a balení externího nativního `.node` souboru. Protože Node 24 označuje API jako release candidate, veškerý přístup bude uzavřený za vlastním backendovým rozhraním a ověřený jak v Node testu, tak v zabaleném Electron buildu.

## 5. Struktura repozitáře

Adresáře používají terminologii blízkou webovým aplikacím:

```text
apps/
  desktop/                   # Electron frontend, preload a main composition root
backend/
  core/                      # pravidla, stavové přechody a aplikační rozhraní
  infrastructure/            # SQLite, procesy a Git CLI
shared/                      # společné serializovatelné typy a validační schémata
tests/
  support/                   # fixture a testovací pomocné funkce
```

Každý uvedený adresář je privátní npm workspace:

| Cesta | Název workspace | Odpovědnost |
| --- | --- | --- |
| `apps/desktop` | `@codryn/desktop` | Electron main, preload, diagnostický renderer a composition root |
| `backend/core` | `@codryn/core` | doménová pravidla, aplikační služby a porty |
| `backend/infrastructure` | `@codryn/infrastructure` | konkrétní implementace SQLite, Windows procesu a Git CLI |
| `shared` | `@codryn/shared` | serializovatelné typy, schémata, ID a event envelope |
| `tests/support` | `@codryn/test-support` | dočasné adresáře, fixture procesy, databáze a Git repozitáře |

Všechny workspace mají `"private": true`; R0 nic nepublikuje do npm registru.

### 5.1 Povolené směry závislostí

- `shared` nesmí záviset na jiném produkčním workspace;
- `backend/core` smí záviset na `shared`;
- `backend/infrastructure` smí záviset na `backend/core` a `shared`;
- Electron main smí skládat `backend/core`, `backend/infrastructure` a `shared`;
- preload a renderer smějí používat pouze bezpečnou část `shared`;
- produkční kód nesmí záviset na `tests/support`;
- cyklická závislost je chyba buildu.

`dependency-cruiser` kontroluje i importy existující pouze před TypeScript kompilací. Nestačí tedy obejít hranici type-only nebo relativním importem.

## 6. Společná data a IPC

### 6.1 Identifikátory a čas

Produkční ID vznikají přes `crypto.randomUUID()`. Core dostává generátor ID a hodiny jako závislosti, aby testy mohly použít deterministické hodnoty. Časy na hranicích jsou UTC ISO-8601 řetězce; databáze je neinterpretuje jako lokální čas.

### 6.2 Event envelope v1

Každá kanonická událost R0 obsahuje:

- `eventId`;
- `eventType`;
- `eventVersion` s hodnotou `1`;
- `correlationId`;
- `occurredAt`;
- `source` z uzavřené množiny komponent;
- volitelné `sessionId`;
- serializovatelný objekt `payload`.

Zod schéma odmítne neznámou verzi, neplatné UUID, neplatný čas, neznámý zdroj a payload, který nelze bezpečně serializovat do JSON.

### 6.3 IPC kanál R0

R0 vystaví jedinou doménovou operaci `r0:diagnostics:run`. Renderer nemůže předat executable, SQL, cestu k souboru ani obecný název IPC kanálu.

Požadavek obsahuje pouze `requestId` a `requestedAt`. Preload jej validuje před odesláním a main proces jej validuje znovu před voláním backendu. Odpověď se validuje v main procesu i v preloadu před předáním rendereru.

BrowserWindow používá:

- `contextIsolation: true`;
- `nodeIntegration: false`;
- `sandbox: true`;
- jediné explicitní API vystavené přes `contextBridge`.

Neplatný vstup vrátí bezpečnou chybu `R0_IPC_INVALID_INPUT` a backendovou diagnostiku nespustí.

## 7. Backendová diagnostická služba

Core definuje `RunR0Diagnostics`, který dostane následující porty:

- repository testovací relace;
- append-oriented event store;
- databázovou health/backup službu;
- process runner;
- Git probe;
- hodiny a generátor ID.

Služba neimportuje Electron, `node:sqlite`, `child_process` ani Git implementaci. Spouští nezávislé skupiny kontrol i po selhání jiné skupiny. Kontrolu závislou na neúspěšném předpokladu označí `skipped`, nikoli `fail` ani `pass`.

### 7.1 Výsledek kontroly

Každý `R0CheckResult` obsahuje:

- stabilní `checkId`;
- `status`: `pass | fail | skipped`;
- bezpečný `code`;
- srozumitelný `message`;
- `startedAt`, `finishedAt` a `durationMs`;
- volitelnou redigovanou `evidence` s přesně definovaným tvarem.

Celý `R0DiagnosticReport` obsahuje `runId`, začátek, konec, celkový stav a seřazený seznam kontrol. Stack trace, celé prostředí procesu, SQL obsah uživatelských dat a hodnoty credential helperu se do reportu neposílají.

## 8. SQLite a migrace

### 8.1 Vlastnictví a umístění

Obecný SQLite přístup vlastní pouze `backend/infrastructure`. Desktop main mu v produkčním běhu předá cestu odvozenou z Electron `app.getPath('userData')`; integrační testy vždy používají unikátní dočasný adresář.

Při otevření databáze se nastaví a ověří:

- WAL journal mode;
- foreign keys;
- defensive mode;
- zakázané loadable extensions;
- busy timeout 5 000 ms;
- `synchronous=NORMAL` pro WAL;
- `PRAGMA quick_check` pro běžný start R0 diagnostiky.

Integrační test první migrace a test obnovené zálohy navíc použijí plný `PRAGMA integrity_check`. Úspěšné otevření souboru samo o sobě není důkaz integrity.

### 8.2 První migrace

První migrace vytvoří minimálně:

- `schema_migrations` s verzí, jménem, checksumem a časem aplikace;
- `diagnostic_sessions` s ID, stavem a časovými údaji;
- `events` s monotónní lokální sekvencí, unikátním event ID, envelope metadaty, JSON payloadem a volitelným cizím klíčem na relaci.

Tabulky použijí `STRICT`, kontroly povolených stavů a `json_valid` tam, kde to SQLite podporuje. Migrace běží v transakci. Dříve aplikovaná migrace se stejnou verzí a jiným checksumem je tvrdá chyba; již aplikovaná shodná migrace je no-op.

### 8.3 Záloha

Počáteční migrace prázdné databáze zálohu nepotřebuje. R0 ale povinně ověří mechanismus budoucí zálohy: naplní databázi fixture daty, použije SQLite backup API, otevře kopii a porovná identitu relace a eventu. Záloha se nepovažuje za úspěšnou jen podle existence souboru.

WAL není náhrada zálohy. Kopírování pouze hlavního `.sqlite` souboru za běhu není podporovaný zálohovací postup.

## 9. Stavové automaty a invarianty

R0 implementuje stavové přechody jako čisté funkce bez IO. Neimplementuje orchestration loop ani vedlejší účinky.

- `AgentRun` respektuje tok z PRD a terminální stavy `completed`, `cancelled`, `failed` nemají odchozí přechod;
- `ToolCall` respektuje `received → schema_validated → permission_decided → queued → running → terminal`; `denied` nikdy nepřejde do `running`;
- `PermissionRequest` může z `pending` přejít pouze do jednoho z `allowed_once`, `allowed_by_rule`, `denied`, `expired`, `cancelled`;
- `ChangeSet` eviduje otevření, uzavření a návrat; stav bez povinné provenance nebo základní revize nelze označit za konzistentní;
- `GitOperation` respektuje `prepared → preconditions_checked → waiting_for_lock → running → terminal`; bez nového preflightu nelze přejít do `running`.

Každý odmítnutý přechod vrací strukturovaný důvod a původní stav nemění. Přesné rozšíření stavů potřebné pro R1 musí zachovat tyto invarianty nebo vyvolat aktualizaci rozhodnutí.

## 10. Procesní runner

### 10.1 Vstup

Core port přijímá explicitní executable, pole argumentů, absolutní pracovní adresář, timeout, limit výstupu a explicitní prostředí. Nepřijímá jeden shellový řetězec.

Infrastrukturní implementace používá `child_process.spawn` s `shell: false`, `windowsHide: true` a oddělenými stdout/stderr streamy. Vrátí skutečný exit code, signál pokud existuje, dobu běhu, informaci o timeoutu, truncation a oddělený omezený výstup.

Překročení limitu výstupu ukončí proces jako chybu; runner nesmí neomezeně akumulovat data v paměti.

### 10.2 Timeout a strom procesu

R0 použije pro Windows spike vestavěný `taskkill.exe /PID <pid> /T /F` spuštěný bez shellu a ověří na fixture, že po timeoutu nezůstal podporovaný potomek. Jde o přesně vymezený mechanismus R0, nikoli tvrzení, že proces běží v bezpečnostním sandboxu.

R0 report zaznamená výsledek a omezení tohoto ověření. Před zpřístupněním obecného shell toolu v R2 se samostatně rozhodne, zda pro povinný O1 runner postačuje ověřený ekvivalent, nebo se doplní Windows Job Object helper. Toto pozdější rozhodnutí nesmí měnit core port.

## 11. Git spike

Git probe používá stejný process runner. R0 ověří:

- `git --version` bez shellu;
- vytvoření dočasného lokálního repozitáře;
- lokální commit s identitou nastavenou pouze ve fixture;
- vytvoření lokálního bare remote;
- přidání remote a lokální fetch bez sítě;
- pouze konfigurační zjištění credential helperu.

Credential probe nevolá `git credential fill`, nevyvolá interaktivní prompt a nečte uložené credential. Do reportu vrací pouze kategorii `system`, `custom`, `plaintext_store`, `none` nebo `unknown`. `plaintext_store` je viditelné bezpečnostní varování, nikoli doporučený mechanismus.

## 12. Electron diagnostická aplikace

### 12.1 Main a composition root

Electron main proces je jediné místo, které skládá konkrétní SQLite, process a Git implementace s `RunR0Diagnostics`. Nevlastní pravidla jednotlivých kontrol a neobsahuje duplicitní implementaci pro IPC a smoke režim.

### 12.2 Preload a renderer

Preload vystaví jedinou metodu pro spuštění R0 diagnostiky. Renderer je statická TypeScript/HTML stránka bez Reactu a bez Node API. Zobrazuje průběh, výsledný stav každé kontroly, bezpečnou zprávu a celkový výsledek.

### 12.3 Interní smoke režim

Přepínač `--r0-smoke` nespouští renderer. Zavolá stejnou službu, uloží `diagnostics/r0-report.json` pod aktuálním `userData` a ukončí aplikaci. Test zabaleného buildu použije jednorázový dočasný `userData` adresář, aby nečetl ani neměnil skutečná uživatelská data.

## 13. Chyby, logování a redakce

R0 používá stabilní bezpečné chybové kódy minimálně pro neplatné IPC, databázi, migraci, integritu, zálohu, spawn, timeout, zbylý proces, limit výstupu, nedostupný Git, Git fixture a interní neočekávanou chybu.

Neočekávaná chyba:

1. ukončí pouze dotčenou kontrolu;
2. zaznamená interní redigovaný log;
3. do IPC a JSON reportu vrátí bezpečný kód a zprávu;
4. nesmí způsobit celkový `passed` stav.

Log a report nesmí obsahovat hodnoty API klíčů, hesla, credential, celé prostředí procesu ani obsah souborů mimo explicitní testovací fixture. Absolutní osobní cesty se v přenosném reportu nahrazují kategorií nebo relativní testovací cestou.

### 13.1 Strukturovaný lokální log

Backend zapisuje JSON Lines záznamy s časem, úrovní, komponentou, correlation ID, bezpečným kódem, zprávou a redigovanými metadaty. Produkční cesta je pod `userData/logs`; testy vždy používají dočasný adresář. R0 udržuje aktivní soubor nejvýše 2 MiB a jednu předchozí rotovanou kopii, aby diagnostika nemohla neomezeně plnit disk.

Zápis logu prochází jedním backendovým logger portem. Renderer nikdy nezapisuje přímo do souboru a citlivá data se odstraňují před serializací, nikoli až při exportu.

### 13.2 Rozhodovací záznamy

R0 zavede `docs/decisions/` a krátkou ADR šablonu se stavem, kontextem, rozhodnutím, alternativami, důsledky a zdroji. Implementace vytvoří ADR minimálně pro volbu `node:sqlite` a pro výsledek Windows process-tree spike. ADR nesmí měnit produktovou autoritu PRD nebo registru rozhodnutí; pouze dokládá konkrétní implementační volbu a její ověření.

## 14. Testovací strategie R0

### 14.1 Unit testy

- všechny povolené a vybrané zakázané stavové přechody;
- terminální stavy bez odchozích přechodů;
- deterministické ID a časy přes injektované závislosti;
- validní a nevalidní event envelope;
- validní a nevalidní IPC request/response;
- agregace `pass`, `fail`, `skipped` do pravdivého celkového stavu;
- redakce neočekávané chyby.

### 14.2 Integrační testy

- migrace prázdné databáze a její druhé spuštění jako no-op;
- odmítnutí změněného checksumu již aplikované migrace;
- WAL, foreign keys, defensive mode a quick check;
- zápis relace a append eventu v transakčně konzistentní podobě;
- zavření a opětovné otevření databáze;
- obsahově ověřená záloha;
- oddělený stdout/stderr a nenulový exit code;
- timeout, truncation a ukončení podporovaného potomka;
- lokální Git fixture a bare remote;
- Git credential probe bez interaktivního volání.

### 14.3 Architektonické testy

- `shared` bez produkčních interních závislostí;
- `backend/core` bez Electronu, SQLite, `child_process` a Git implementace;
- renderer a preload bez importu backend infrastruktury;
- produkční kód bez importu `tests/support`;
- žádné cykly, neznámé nebo nedeklarované npm závislosti.

### 14.4 Desktop a packaged smoke

- produkčně blízký Forge build na Windows 11;
- spuštění diagnostického okna;
- odmítnutí neplatného IPC bez volání backendu;
- úspěšné validované IPC nad stejnou backend službou;
- `--r0-smoke` nad zabaleným executable v dočasném profilu;
- existence, schema validita a úspěšný obsah JSON reportu;
- exit code odpovídající reportu.

## 15. Vývojové a ověřovací příkazy

Kořen repozitáře poskytne jednotné příkazy:

- `npm run typecheck`;
- `npm run lint`;
- `npm run check:deps`;
- `npm test`;
- `npm run make --workspace @codryn/desktop`;
- `npm run verify:r0`.

`verify:r0` spustí statické kontroly, unit a integrační testy, Forge build a smoke zabalené aplikace. Při první chybě nesmaže diagnostické důkazy potřebné pro analýzu.

## 16. Dokončovací brána

R0 je dokončené pouze tehdy, když na podporovaném Windows 11:

1. `npm ci` z čistého checkoutu použije committed lockfile;
2. typová kontrola, lint a dependency pravidla projdou;
3. všechny unit a integrační testy projdou;
4. Electron Forge vytvoří produkčně blízký build;
5. zabalený `--r0-smoke` skončí úspěchem a vytvoří validní report;
6. diagnostické okno zobrazí stejné výsledky přes validované IPC;
7. databáze se znovu otevře se zachovanou testovací relací;
8. timeout fixture nezanechá podporovaného potomka;
9. doménový a aplikační kód lze testovat bez Electron rendereru;
10. vznikne uložený JSON report, krátký diagram závislostí a vysvětlení omezení procesní izolace.

Selhání jedné povinné položky znamená, že R0 není dokončené. Další produktové funkce nesmějí tuto bránu obcházet.

## 17. Porozumění autora

Před uzavřením R0 autor vlastními slovy vysvětlí:

- rozdíl mezi Electron rendererem, preloadem a main procesem;
- proč frontend nedostává obecné Node nebo IPC API;
- rozdíl mezi `backend/core` a `backend/infrastructure`;
- proč je SQLite přístup uzavřený za backendovým rozhraním;
- co dělá WAL a proč není záloha;
- proč ukončení stromu procesu není totéž co bezpečnostní sandbox;
- proč úspěšné otevření okna nestačí jako důkaz dokončení R0.

## 18. Návaznost na R1

R1 přidá interní headless driver, fake model adapter, read-only nástroje a první skutečné použití `AgentRun` a `ToolCall`. Nový driver použije stejné `shared` typy, core služby, event store a infrastrukturní adaptéry. R1 nesmí přesunout orchestration pravidla do CLI ani Electron rendereru.
