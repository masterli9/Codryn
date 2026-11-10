# R3.3 – trvalé klíče a desktopové API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trvale chránit API klíč a zpřístupnit R3 služby přes ověřené desktopové operace.

**Architecture:** Core vlastní pravidla nastavení, desktop adaptér systémové šifrování a infrastruktura atomický ciphertext soubor. IPC validuje vstup i důvěryhodný sender a neposkytuje obecné privilegované API.

**Tech Stack:** Electron safeStorage, Windows DPAPI, SQLite metadata, existující provider transport, Vitest.

**Spec:** [R3 specifikace](../specs/2026-10-11-r3-electron-workspace-design.md), §3/5/6 a §10.

## Global Constraints

Platí [R3 index](2026-10-11-r3-implementation.md). C1 může předběhnout B,
C3/C4 potřebují B. Skutečný klíč není vstup automatických testů. Uložená
hodnota se nikdy nevrací rendereru; nelze slibovat izolaci před programem
pod stejným Windows uživatelem.

## Review Focus

OS ochrana nedostupná (C1), restart a poškozený ciphertext (C2), replace
během aktivního transportu (C2/C3), cizí frame a záměna subscription ID
(C4), uložení nebo test klíče zaměněný za souhlas s projektovým přenosem (C3).

## C1: Windows safeStorage brána a atomický chráněný soubor

**Create:** scripts/spikes/r3-secret-probe.cjs,
scripts/spikes/r3-secret-probe.mjs,
apps/desktop/src/secrets/electron-secret-protector.ts,
docs/decisions/0008-r3-secret-storage.md.
**Modify:** backend/core/src/secrets/ports.ts (port už založený v A1).
**Test:** apps/desktop/test/r3-secret-probe.test.ts; host-integration ve vitest.config.ts.

**Interfaces:** `SecretProtector {available():Promise<boolean>; encrypt(value:string):Promise<Uint8Array>; decrypt(bytes:Uint8Array):Promise<{value:string;shouldReEncrypt:boolean}>}`.
`ElectronSecretProtector` constructor používá úzký injectovaný safeStorage
facade; produkční facade pouze main po app.ready, asynchronní API
isAsyncEncryptionAvailable/encryptStringAsync/decryptStringAsync.
Async decrypt vrací objekt `{result,shouldReEncrypt}`, nikoli string;
adaptér explicitně mapuje result → value. Obálka souboru od první verze
nese i keyVersion, aby C1 nevytvořilo nekompatibilní formát vůči C2.
Probe report v1 `{platform:'win32'; encryption:boolean; restartDecrypt:boolean;
replacePreserved:boolean; deniedPlaintextFallback:boolean; passed:boolean}`;
obsah klíče se neexportuje. Záznam uložen v dočasném profile pod daným rootem.

- [ ] **1. Napsat test skutečné OS zkoušky.** Spustit Electron probe dvakrát nad stejným temp profile: uložit syntetický klíč a decrypt po novém procesu. Chyba uložení před replace zachová původní ciphertext; poškozený blob selže. Test prohledá report/stdout/disk kromě očekávaného šifrovaného souboru a klíč nenajde. Neplatný/nečekaný report neznamená passed.
- [ ] **2. Červená brána.** `npm.cmd exec -- vitest run --project host-integration apps/desktop/test/r3-secret-probe.test.ts`; neexistující probe je očekávané počáteční selhání.
- [ ] **3. Implementovat probe a protector.** Ověřit lokální Electron 43.4.0 typy/runtime bez upgrade; návrhový zdroj safeStorage je v §6 spec. DPAPI encrypted bytes do versioned JSON envelope `{version:1,provider:'openai',keyVersion:number,ciphertext:base64}`. Žádný plaintext backup nebo fallback. Atomické temp-write/fsync/replace, vlastník a ACL ověřené pro aktuální Windows účet; bez world-readable nového souboru. Odmítnout reparse/junction cíl a cestu mimo kanonický userData/secrets. Probe launcher má explicitní cwd, 30 s timeout a windowsHide; mazat jen předem ověřený vlastní temp root. ADR uvádí naměřené důkazy, omezení a požadavek na packaged opakování v E2.
- [ ] **4. Zelená brána.** Stejný test a `node scripts/spikes/r3-secret-probe.mjs`; passed=true pouze ze skutečné Windows ochrany. Nedostupný systém, špatné oprávnění nebo selhání restart decrypt blokují C2 jako ready, neřešit plaintextem. Do reportu skutečný exit a fáze, ne klíč nebo absolutní osobní cesta.
- [ ] **5. Commit hranice.** Přesné C1 cesty; `feat(r3): verify Windows protected secret storage`.

Testy C1/1/4 zahrnou odlišný návratový typ async decrypt, výjimku a
shouldReEncrypt. C2 při požadavku na nové šifrování provede atomické
encrypt+replace při zachování stejného logického klíče/keyVersion; při
chybě zachová původní čitelný ciphertext a nenastaví falešný úspěch.
Návratový tvar byl při této revizi porovnán s lokálními Electron 43.4.0
typy a [oficiální safeStorage dokumentací](https://www.electronjs.org/docs/latest/api/safe-storage).
Toto ověření API není náhradou Windows probe ani packaged gate.

## C2: Secret store, metadata a safe replace/remove

**Create:** backend/infrastructure/src/secrets/encrypted-secret-store.ts,
backend/core/src/secrets/provider-settings-service.ts,
backend/infrastructure/src/persistence/sqlite-provider-settings-store.ts,
backend/infrastructure/src/persistence/r3-provider-settings-migration.ts.
**Modify:** backend/infrastructure/src/persistence/migrations.ts (nová 12),
backend/core/src/index.ts, backend/infrastructure/src/index.ts,
backend/core/src/secrets/ports.ts, backend/core/src/desktop/run-manager.ts,
backend/infrastructure/src/create-r3-infrastructure.ts.
**Test:** backend/infrastructure/test/r3-secret-store.test.ts,
backend/core/test/provider-settings-service.test.ts.

**Interfaces:** `SecretStore {state(provider:'openai'):Promise<'missing'|'stored'|'unavailable'>; read(provider):Promise<string>; save(provider,value:string):Promise<void>; remove(provider):Promise<void>}` za SecretProtector.
`ProviderSettingsStore {get():Promise<R3ProviderSettings>; select(mode:R3Mode,maxSteps:number):Promise<void>; recordKeyVersion(version:number):Promise<void>; recordTest(version:number,result:'passed'|'failed',at:IsoTimestamp):Promise<void>; recordConsent(version:string):Promise<void>}`.
`ProviderSettingsService({secrets,settings,access:ProviderAccessGate,assertIdle:()=>Promise<void>,clock})`
má `get():Promise<R3ProviderSettings>`, `saveKey(value:string):Promise<void>`,
`removeKey():Promise<void>`, `select(mode,maxSteps):Promise<void>`,
`confirmDataPolicy(version:string):Promise<void>`; testKey doplní C3.

Pouhé assertIdle nestačí proti závodu s novým submit. Core port
`ProviderAccessGate` založený A1 v secrets/ports.ts má
`acquireRunLease():Promise<()=>void>` a
`withSettingsLease<T>(effect:()=>Promise<T>):Promise<T>`.
Výhradní settings lease zahrnuje kontrolu všech aktivních/queued běhů
všech projektů i file+metadata změnu. Run lease se rezervuje při přijímání
každého záměru (včetně demo) před případným čtením klíče a drží se do dispose transportu; při chybě
accept se uvolní. B1/C3 používají stejnou instanci brány. Test připojení
má read/run lease po celou dobu HTTP požadavku; remove nesmí ponechat
rozběhnutý test se starým klíčem. Souběžný settings zápis vrací busy,
nevyvolává skryté čekání či automatické zastavení běhu.

- [ ] **1. Napsat testy trvalého souboru.** Reálné temp file store + systémová ochrana z C1 v host smoke; běžné fault cases nad SecretProtector portem. Save/reopen/read stejná hodnota; remove/reopen chybí. Selhání fsync/rename/SQLite metadata zachová starý klíč nebo jasný unavailable, nikdy metadata tested nového neuloženého klíče. Replace resetuje testedAt a zvyšuje keyVersion. Busy odmítne remove před zápisem, UI si zastavení vyžádá odděleně.
- [ ] **2. Červené testy.** `npm.cmd exec -- vitest run --project parallel backend/infrastructure/test/r3-secret-store.test.ts backend/core/test/provider-settings-service.test.ts`; OS restart nezaměnit za tento port test.
- [ ] **3. Implementovat store/service.** Serializovat save/remove/read/start lease; klíč se přečte jen pro transport SessionSecret a redaktor, žádný sdílený export s value. File + metadata nejsou jedna transakce: versioned envelope nese keyVersion, reopen ověří shodu a resetuje neplatný test výsledek. Neuvádět hashe plaintext klíče do DB. Migrace 12 provider_settings ukládá jen model/režim/maxSteps/test/version/consent. Default demo, maxSteps16, missing, not_tested. Delete ověří kanonickou file cestu, po odstranění release SessionSecret.clear a nulové nové transport references. Deletion není příslib přepsání SSD fyzických sektorů. Export a log safe bez vstupu saveKey; generic command logger tuto IPC operaci neserializuje.
- [ ] **4. Zelené ověření.** Stejné testy, migrace 0–12/reopen/regrese. Synthetic marker se neobjeví v SQLite, logu, odpovědi get ani metadatech; klíčový encrypted soubor není součást procházení projektu. Test symlink/reparse parentu, souběžné save/save a špatně zformované JSON/base64/oversize envelope (nejvýše 32 KiB).
- [ ] **5. Commit hranice.** Přesné C2 soubory; `feat(r3): persist protected provider keys with safe replacement`.

Povinné závodové testy C2/1/4 použijí bariéry mezi kontrolou a zápisem:
save/remove proti queued startu v jiném projektu, testKey proti remove,
a chyba metadata zápisu po replace. Právě jedna operace získá příslušnou
lease; po úspěšném remove žádný nový request nepoužije starou hodnotu.
Poškozený profil/SQLite dostane konkrétní bezpečnou chybu, nikoli vytvoření
prázdné náhradní databáze a zdánlivou ztrátu historie.

## C3: Provider volba, explicitní test a Node runtime

**Create:** apps/desktop/src/runtime/node-runtime.ts,
backend/infrastructure/src/model/r3-provider-factory.ts,
backend/infrastructure/src/model/provider-connection-test.ts.
**Modify:** backend/core/src/secrets/provider-settings-service.ts,
backend/infrastructure/src/model/openai-responses-adapter.ts (volitelné maxOutputTokens),
backend/infrastructure/src/create-r3-infrastructure.ts,
apps/desktop/src/composition-root.ts.
**Test:** backend/infrastructure/test/r3-provider-factory.test.ts,
apps/desktop/test/node-runtime.test.ts,
backend/core/test/provider-settings-service.test.ts.

**Interfaces:** `createR3Provider({mode:R3Mode,secrets:SecretStore,ids:IdGenerator,
projectRoot:string}):Promise<{model:ModelAdapter;dispose():void}>` vytváří
čerstvý adapter; demo scénář pouze podporovaná referenční fixture.
`testProviderConnection(secret:string,signal:AbortSignal):Promise<{passed:boolean;category:R3RunView['providerError'];at:IsoTimestamp}>`.
`resolveNodeRuntime(signal:AbortSignal):Promise<{available:boolean;executable:string|null;version:string|null;reason:string|null}>`.
SettingsService přidá `testKey(signal):Promise<R3ProviderSettings>` a
`ensureProjectTransmissionAllowed():Promise<void>`; C3 composition doplní
core porty z C2, nepřipustí Electron import do core.

Data policy je backendový katalog, nikoli rendererem zadaný příznak:
confirmDataPolicy přijme jen právě platnou verzi. Test povinně nastaví
requiresConfirmation=true a prokáže nula provider requestů bez shodného
potvrzení; změna verze staré potvrzení zneplatní. Nastavení ukáže provider,
model, všechny capability supported/unsupported/unknown a textové omezení
referenčního ověření před submit. Datové upozornění není odvozené z toho,
že klíč byl uložen nebo test uspěl; skutečný text podmínek se v C3 ověří
z aktuálních primárních podkladů, bez nového srovnávacího evalu.

- [ ] **1. Napsat kontraktní test provideru.** Volba demo nečte secret ani netransportuje síť. OpenAI konfigurace používá pouze gpt-6-luna, SessionSecret a existující adapter/transport. Test připojení nemá project context/tools/historii, počet requestů1, timeout10s, maxOutputTokens32 a retry0; auth/rate limit není passed. Otevření projektu nebo saveKey má nula requestů. Prázdná/poškozená klíčová ochrana blokuje live start, nikoli demo.
- [ ] **2. Červené testy.** `npm.cmd exec -- vitest run --project parallel backend/infrastructure/test/r3-provider-factory.test.ts apps/desktop/test/node-runtime.test.ts backend/core/test/provider-settings-service.test.ts`.
- [ ] **3. Implementovat factory/test/runtime.** Test má pevný syntetický task bez souborů, limit výstupu adapterem do OpenAI requestu; UI předem označí síť/náklad. Není to eval a neprokazuje AC-O1-04. Před implementací request-detailu ověřit aktuální oficiální OpenAI dokumentaci podle openai-docs, zachovat store:false a neměnit provider kontrakt. Factory před reálným startem kontroluje keyVersion/consent/model capabilities, snapshot klíče v paměti a dispose po runu. DataPolicyVersion je explicitní datum/verze upozornění; FR-LLM-13 u skutečně označeného dotčeného režimu vyžaduje matching consent. Node runtime pouze backendem zjištěný systémový node.exe (where.exe bez shell, realpath, --version timeout5s, podporovaný repository runtime); renderer nezadává executable. V Electronu nepoužívat process.execPath jako Node test runner. Bez podporovaného Node vysvětlit nedostupnost referenční kontroly, zachovat chat. Předváděcí supported installation zahrnuje tento prerequisite; případné bundlování Node není skryté rozšíření R3.
- [ ] **4. Zelené ověření.** Testy kroku2 + existing provider-contract/context/transport. Výběr jiné mode během běhu je busy, test s jinou keyVersion neaktualizuje nový klíč; po odstranění staré SessionSecret references žádný nový live request. Metadata usage unknown nemají zůstatek kreditu. V testu runtime `process.execPath` Electronu není automatické available.
- [ ] **5. Commit hranice.** C3 cesty; `feat(r3): expose explicit provider setup and trusted verification runtime`.

Node runtime regresní test: otevření běžné složky bez sum.mjs a bez Node
nepadá; historie a read-only live chat fungují a kontrola je nedostupná.
Demo se spouští jen nad výslovně rozpoznanou referenční fixture, odmítnutí
jiného projektu nesmí zahájit patch. Zjištění node.exe nespustí kandidáta
z otevřeného projektu ani z cwd; použije důvěryhodný systémový cwd,
vyřadí relativní/prázdné PATH položky a kandidáty uvnitř projektového rootu.
Chybějící runtime není tichý fallback na process.execPath Electronu.

## C4: Validované IPC, odběr a desktopový lifecycle

**Create:** apps/desktop/src/ipc/r3-handler.ts,
apps/desktop/src/ipc/register-r3-handlers.ts,
apps/desktop/src/ipc/r3-subscriptions.ts,
apps/desktop/src/lifecycle/close-controller.ts.
**Modify:** apps/desktop/src/main.ts, apps/desktop/src/preload.ts,
apps/desktop/src/composition-root.ts, dependency-cruiser.config.mjs.
**Test:** apps/desktop/test/r3-handler.test.ts,
apps/desktop/test/r3-subscriptions.test.ts,
apps/desktop/test/close-controller.test.ts.

**Interfaces:** `createR3Handler({services,assertSender,chooseDirectory})`
vrátí `(event:IpcMainInvokeEvent,input:unknown)=>Promise<R3IpcResponse>`;
`registerR3Handlers(ipcMain, services, mainWindow):()=>void` vrací dispose.
Preload: `window.codryn.r3.invoke(request:R3IpcRequest):Promise<R3IpcResponse>`,
`onUpdate(listener:(update:R3Update)=>void):()=>void`. Message payloady
validovat na obou stranách; channel r3:request a r3:update. Stream attach
vrátí `{subscriptionId,snapshot}` a bound sender. close controller
`requestClose():Promise<'stay'|'closed'|'failed'>` volá manager.shutdown
a DB close teprve při stopped=true; UI confirm používá systémový dialog.
Changes.diff před GetChangeDiff.execute ověří setId vlastníka/chatu a
obnoví workspace observation; revert použije RevertChanges.execute,
samostatný requestId a backend preflight. Snapshot refresh znovu posoudí
aktuální VerificationRecord, ne pouze zkopíruje historický R2RunResult.

Revert používá `R3RevertInput` s expectedSetSequence a
expectedWorkspaceRevision z právě potvrzeného R3ChangeView. Backend
serializuje své run-start/revert operace nad daným projektem; při aktivním
běhu vrátí busy s možností nejprve jej explicitně zastavit. Zámek neblokuje
externí editor a nenahrazuje R2 očekávané hashe. Po novém pozorování ověří
obě preconditions před návratem; nesoulad dává R3_STALE_VIEW a UI načte
nový diff, nikdy nerozšíří odsouhlasený rozsah o mezitím přidané změny.
DesktopActionStore A3 uloží intent před R2 návratem a výsledek po něm.
Stejné requestId/digest vrací hotový výsledek nebo čeká na tentýž živý
požadavek; jiný obsah se odmítne. Po pádu s nejasným výsledkem proběhne
recovery a zobrazí se skutečný diff, návrat se automaticky neopakuje.
Test C4/1/4: nový patch po zobrazení potvrzení → stale bez změny souboru;
dvojí klik/IPC retry → jeden návrat; pád po zápisu před uložením odpovědi
→ žádný druhý účinek. D4 tento rozdíl viditelně vysvětlí.

`services.inspectRun(chatId,targetRequestId,signal):Promise<R3RunDetail>`
a `services.activity(chatId,targetRequestId,beforeSequence)` používají
porty A3, se stejnou kontrolou vlastnictví jako diff/output. Nelze zaměnit
requestId této IPC operace s targetRequestId prohlíženého historického běhu.
Periodic refresh je nejvýše jeden rozpracovaný scan na projekt, další tick
se sloučí; má timeout a nevytváří neomezené fronty při pomalém disku.
Nedostupný projekt vrátí historii s available=false a freshness=unavailable;
diff/revert/file tools se odmítnou, historická obrazovka se nesmí zablokovat.
Aktuální Git omezení (detached HEAD, konfliktní cesta, nedostupný Git) mají
bezpečný důvod ve view a nesmějí se odvozovat jen ze staré baseline.

- [ ] **1. Napsat boundary testy.** Cizí BrowserWindow, iframe, jiné URL, destroyed sender a neplatný DTO rejected před službou. Chat/set/permission z jiného projektu rejected, log neobsahuje raw key. Při attach jsou události zachyceny i před resolve invoke; cizí sender nemůže použít subscriptionId. Cancel systémového folder dialogu má explicitní cancelled bez project záznamu.
- [ ] **2. Červený test.** `npm.cmd exec -- vitest run --project parallel apps/desktop/test/r3-handler.test.ts apps/desktop/test/r3-subscriptions.test.ts apps/desktop/test/close-controller.test.ts`.
- [ ] **3. Implementovat dispatch a lifecycle.** Assert sender.id, senderFrame===mainFrame a přesný povolený origin/entry v dev i packaged. Pouze enum operace, schema allowlist, safe error map; žádné obecné SQL/exec/read. Systémový dialog vrací root mainu, pak createR3Infrastructure.projects.open. Subscribe nejprve registruje bound receiver, preload naslouchá před invoke; při overflow/resync načte klient snapshot. Destroy renderer odpojí jeho odběry, nezavře runtime/permission. Periodické ověření otevřeného workspace po 1s a před privilegovanou akcí; fresh snapshot musí zobrazit stale. App single-instance lock odmítne druhého hostitele nad týmž userData, nezavede globální file lock nad projektem. close dialog Zůstat / Zastavit a ukončit; timeout10s s řízeným failed, žádný force quit označený jako safe. R0 diagnostiku a smoke entrypoints zachovat.
- [ ] **4. Zelený test a boundary check.** Krok2, `npm.cmd run typecheck`, `npm.cmd run check:deps`. Aktualizovat depcruise zákaz renderer importu Node/electron i infrastructure; preload jen whitelist. Opakovaný reload nevytváří rostoucí listenery, close waiting approval nic nespustí, external edit → stale ve fresh snapshotu. Hostní chování ověří později E1/E2, mock IPC test je jen validační hranice.
- [ ] **5. Commit hranice.** C4 cesty; `feat(r3): wire validated desktop operations and safe window lifecycle`.

Povinné testy C4/1/4: starý run detail během nového aktivního běhu, smazaný
root po restartu, detached HEAD, konfliktní Git soubor a chybějící Git
program. Po selhání startup migrace/recovery UI ukáže konkrétní chybu bez
automatického resetu dat. Single-instance lock získat před migrací/recovery;
uzavírání hostu nejprve atomicky zablokuje nové submit/testKey/settings
operace a teprve pak čeká na všechny vlastní běhy, aby mezi kontrolou idle
a DB close nevznikl nový. Opakované close/before-quit nesmí otevřít dva
dialogy; při failed se služby ani DB nezavřou a retry close je dostupný.
