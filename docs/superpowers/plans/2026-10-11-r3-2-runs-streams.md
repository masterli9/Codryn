# R3.2 – běhy a průběžné výstupy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ovládat jeden backendový běh, sledovat jeho průběh a bezpečně jej zastavit či znovu zobrazit.

**Architecture:** Správce lifecycle volá stávající RunAgentLoop; callbacks ukládají potvrzené projekce a permission broker pouze předá odpověď stávajícímu harnessu.

**Tech Stack:** Existující TypeScript, R2 infrastructure, SQLite, Windows Job Object a Vitest.

**Spec:** [R3 specifikace](../specs/2026-10-11-r3-electron-workspace-design.md), §3–5 a §7–8.

## Global Constraints

Platí [R3 index](2026-10-11-r3-implementation.md). Po A1–A3; žádný druhý
orchestrátor, nový provider-native audit nebo zrušení expected-hash ochrany.

## Review Focus

Úloha vzniklá dvakrát (B1), modelový text před neúplným tool callem (B2),
multibyte a tajemství na hranici bloků (B2/B3), ztráta protokolu při cancelu
(B3/B4), schválení po restartu UI či po pádu hostitele (B4).

## B1: Správa projektů a jednoho běhu

**Create:** backend/core/src/desktop/run-manager.ts,
backend/core/src/desktop/project-service.ts,
backend/infrastructure/src/create-r3-infrastructure.ts.
**Create navíc:** backend/core/src/verification/reference-verification-policy.ts,
backend/core/src/secrets/provider-access-gate.ts (InMemoryProviderAccessGate implementující port A1).
**Modify:** backend/infrastructure/src/create-r2-infrastructure.ts,
backend/core/src/agent/run-agent-loop.ts, backend/core/src/agent/ports.ts,
backend/core/src/state/agent-run.ts (pouze potřebné legální přechody),
backend/core/src/tools/tool-execution-harness.ts,
backend/core/src/verification/verify-command.ts,
backend/core/src/verification/verification-store.ts,
backend/infrastructure/src/persistence/sqlite-verification-store.ts,
backend/infrastructure/src/process/verifying-command-executor.ts,
backend/core/src/index.ts, backend/infrastructure/src/index.ts.
**Test:** backend/infrastructure/test/r3-run-manager.test.ts,
backend/core/test/run-agent-loop.test.ts,
backend/core/test/reference-verification-policy.test.ts; upravit vitest.config.ts pro nový host test.

**Interfaces:** `DesktopRunManager` constructor
`{requests:DesktopRequestStore; chats:ChatStore; projections:DesktopProjectionStore;
projects:R3ProjectService; createRun:DesktopRuntimeFactory; providerAccess:ProviderAccessGate}`.
Port `DesktopRuntimeFactory(input:{projectId:Uuid;request:R3SubmitInput;
signal:AbortSignal;onRunCreated:(runId:Uuid)=>Promise<void>}):Promise<{
execute():Promise<R2RunResult>;close():void}>` je v desktop/ports.ts;
closure uvnitř infrastructure zapojí R2 loop, model a B2/B3 sinks.
`R3ProjectService` má podpisy z indexu a constructor `{store,
openWorkspace,inspectGit,canonicalizeRoot}` s core porty pro tyto operace;
konkrétní SQLite/Git/filesystem typy se do core neimportují.
`store` má stejné metody remember/get/list/root jako A2;
`canonicalizeRoot(root:string,signal):Promise<{root:string;identity:string}>`,
`openWorkspace(identity:string,proposedId:Uuid):Promise<Uuid>` a
`inspectGit(root:string,signal):Promise<ProjectBaseline>` jsou důvěryhodné
adaptéry sestavené infrastructure. IDs dodá stávající IdGenerator.
Metody `submit(input:R3SubmitInput):Promise<R3Accepted>`,
`stop(projectId:Uuid,jobId:Uuid):Promise<'requested'|'already_terminal'>`,
`wait(jobId:Uuid):Promise<R3RunView>`, `active(projectId:Uuid):R3RunView|null`,
`shutdown(signal:AbortSignal):Promise<{stopped:boolean}>`.
`createR3Infrastructure({userDataPath, runtimeFactory, secretProtector?, clock?, ids?})`
vrátí projects/chats/requests/projections/manager/subscriptions/recover/close.
runtimeFactory je infrastructure builder z C3 s podpisem
`(resources:{database:DatabaseSync;projects:R3ProjectService;projections:DesktopProjectionStore;providerAccess:ProviderAccessGate})=>DesktopRuntimeFactory`.
Volá se až po migraci a vytvoření služeb; vrátí core factory s uzavřenými
DB/sinks a čerstvým modelem pro každý běh. DatabaseSync nikdy nevstupuje do core portu.
SecretProtector je core port z A1, implementovaný v C1; při absenci je live režim unavailable,
nikoli plaintext fallback. Tím lze první B1 testy spustit bez Electronu.
Výsledná funkce odpovídá portu DesktopRuntimeFactory; root vrací R3ProjectService,
nikoli samotný SqliteDesktopProjectStore. C4 services poskytuje manager,
ChatService, projects, subscriptions, settings z C2/C3 a validované
`snapshot(chatId,signal):Promise<R3Snapshot>`,
`diff(chatId,setId,signal):Promise<R3ChangeView>`,
`output(chatId,callId,afterSequence):Promise<R3OutputPage>` a
`revert(chatId,{setId,entryId?,requestId,expectedSetSequence,expectedWorkspaceRevision},signal)` se stejným výsledkem
jako RevertChanges.execute. Služby ověří vlastnictví před R2 delegací.
`R2ExecutionOptions` přidá volitelný `onRunCreated(runId:Uuid):Promise<void>`
a `allowReadOnlyCompletion?:boolean`; createR2Infrastructure je předá.
Default false zachová read-only dokončovací pravidlo R2/CLI; callback
není povinný pro staré volající. Opravy coverage a bezpečné perzistence
se nesmějí vynechat pod záminkou zachování chybného chování.

Run factory se skládá až po otevření společné DB; zavede se infrastructure
volba `database?:DatabaseSync` v createR2Infrastructure. Při injektované DB
se znovu nemigruje a close zavírá jen vlastní observer/proces/model, nikoli
sdílenou DB. Tu migruje openDesktopDatabase jednou před zpřístupněním služeb
a zavírá host až po shutdown. SQL transakce jsou synchronní a bez await;
core dostává jen porty. Test dvou různých projektů prokáže, že konec jednoho
nezavře DB druhému. Původní CLI bez injekce vlastní svoji DB jako dosud.

`R2ExecutionOptions` navíc předá harnessu callback
`onToolPhase(phase:'waiting_for_approval'|'executing_tool'|'verifying'):Promise<void>`
svázaný s aktuálním runem přes nový volitelný pátý parametr
`ToolExecutionHarness.execute(call,runId,signal,context,onToolPhase?)`.
RunAgentLoop zapíše legální přechod před čekáním
na odpověď nebo spuštěním kontroly. Callback nevytváří druhý stavový automat.
Bezcallbackové R1 volání zůstane kompatibilní. Test skutečného harnessu
prokáže waiting_for_approval po dobu čekání, verifying během command.run
a správný návrat do waiting_for_model; samotný job.state=running nestačí. Přechody
executing_tool → waiting_for_approval a verifying → executing_tool nebo
waiting_for_approval při dalším tool callu téhož modelového tahu musí být
výslovně legální; opakování stejné fáze je no-op. Test více tool callů
v jediném tahu nesmí zakrýt neplatný přechod pouze jednotoolovou fixture.

`ReferenceVerificationPolicy.assess(input:{changedPaths:readonly string[];
observedPaths:readonly string[];complete:boolean;manifestValid:boolean;commandTrusted:boolean})` vrací
`{profileId:'r2-sum-v1';coveredPaths:readonly string[];uncoveredPaths:readonly string[]}`.
Jediný známý ověřovaný produkční vstup profilu je sum.mjs; sum.test.mjs
musí mít existující připnutý hash, být povolený a součástí úplného pozorování.
Nerelevantní příkaz, chybějící runtime nebo neplatný manifest vrací prázdné
coveredPaths. Core bere changedPaths z aktuálního diffu sady, ne z textu
modelu ani ze všech historických patchů včetně vrácených. Před/po kontrole
se zaznamená pokrytí ke konkrétnímu recordId (A3); změna revize jej zneplatní.
Infrastrukturní append zapíše record i coverage v jedné transakci; chybějící
coverage nesmí být pro R3 completion považovaná za úplné pokrytí.
Completion celé změny vyžaduje úspěšný fresh record a úplné pokrytí všech
aktuálně změněných cest. Existující canComplete se neoslabí; neúplné pokrytí
vstupuje do něj jako unverified. R3 pohled může ukázat partially_verified
jen pro skutečně úspěšně zkontrolovanou podmnožinu, včetně chybějících cest.
To nezavádí obecné TypeScript profily, které zůstávají R4.

- [ ] **1. Napsat hostní test s createR2Project.** Submit duplicitního requestId vrátí stejné jobId a právě jeden agent_run. Druhý request nad stejným kanonickým rootem je R3_PROJECT_BUSY; druhý projekt funguje. Pád po queued před run.created označí po reopen job interrupted bez file edit/API volání. Pád po run.created před attachRun deterministicky najde run podle requestId, neprovádí ho znovu.
- [ ] **2. Červený test.** `npm.cmd exec -- vitest run --project host-integration backend/infrastructure/test/r3-run-manager.test.ts`; core rozšíření samostatně `npm.cmd exec -- vitest run --project parallel backend/core/test/run-agent-loop.test.ts backend/core/test/reference-verification-policy.test.ts`.
- [ ] **3. Implementovat manager a composition.** Submit nejprve validuje schema/vlastnictví a načte getByRequestId: stejný digest vrátí původní accepted i během vlastního aktivního běhu, odlišný odmítne. Teprve nový request validuje archivaci, dostupnost kořene, modelové nastavení a nedokončené recovery před accept; atomický accept odmítne aktivní projekt. Po accept manager naplánuje jediný start a ihned vrátí R3Accepted. Loop vytvoří runId dosavadním způsobem, onRunCreated provede attachRun před prvním kontextem/nástrojem. Fail attachRun ukončí běh před účinkem. Fresh model + infrastructure per run; DB/projekce společné v userData, disposal teprve po konci. OpenProject realpath → SqliteWorkspaceStore.open → ProjectGitState.inspect → remember, bez čtení sum.mjs nebo sítě. Recovery při otevření hostitele jde před povolením nového startu, nikdy při pouhém reload UI. allowReadOnlyCompletion umožní explicitně R3 konverzační konec bez patchů/pending/recovery a s dokončeným modelem; unverified reason R3_READ_ONLY_RESULT. Jakmile existuje patch, platí beze změny canComplete R2; žádné verified pro pouhý text. Nezavádět automatické předání starého chatu modelu.
- [ ] **4. Zelené ověření.** Příkazy kroku 2 a R2 completion/regression suite; test obsahující patch bez platného testu musí dál skončit failed/unverified. Přepnutí chatu nic neruší; shutdown waiting run zavře až po výsledku. Lookup root z DB znovu ověří kanonickou identitu; přesunutá složka je unavailable, ne automatické reassignment.
- [ ] **5. Commit hranice.** Přesné B1 cesty; `feat(r3): manage desktop runs with durable request identity`.

Povinné regrese B1/1/4: změna pouze other.ts + úspěšný sum.test.mjs není
verified ani partially_verified; změna sum.mjs a other.ts + úspěšný relevantní
test je v backendovém pohledu částečně ověřená a R2 výsledek unverified.
Pouze sum.mjs + čerstvý relevantní úspěch smí být verified. Read-only výsledek
bez patchů je completed/unverified, ale nesmí skrýt failed tool, recovery,
pending approval nebo nejisté ukončení procesu. Na ověřené sadě znovu
pozorovat relevantní externí editaci, nezávislou změnu i změnu pravidel kontextu.
Aktuální R2 má rozsah celého projektu; do zavedení užšího důkazu je invalidace
konzervativní a UI vysvětlí tento rozsah, neslibuje zachování platnosti.

## B2: Modelový stream, usage a kategorie chyb

**Create:** backend/core/src/desktop/stream-batcher.ts,
backend/infrastructure/src/logging/stream-redactor.ts.
**Modify:** backend/core/src/agent/model-response-collector.ts,
backend/core/src/agent/run-agent-loop.ts, backend/core/src/agent/ports.ts,
backend/infrastructure/src/create-r2-infrastructure.ts,
backend/infrastructure/src/model/provider-transport.ts,
backend/infrastructure/src/model/provider-errors.ts,
backend/infrastructure/src/model/openai-responses-adapter.ts,
backend/infrastructure/src/persistence/sqlite-agent-run-store.ts (bezpečná persistovaná data),
backend/core/src/tools/tool-execution-harness.ts,
backend/core/src/tools/safe-tool-audit.ts (bezpečné odmítnutí tajemství před uložením argumentů).
**Test:** backend/core/test/r3-model-stream.test.ts,
backend/infrastructure/test/stream-redactor.test.ts,
backend/infrastructure/test/provider-transport.test.ts.

**Interfaces:** Collector options přidá
`onValidatedEvent?: (event:ModelStreamEvent)=>Promise<void>`; nepřeskočí
stávající validaci, timeout, 64 KiB a zákaz spouštění neúplného tool callu.
Loop options `onModelEvent?: (input:{runId:Uuid;step:number;event:ModelStreamEvent})=>Promise<void>`
volá stejný collector. `StreamBatcher` má
`push(text:string):Promise<void>`, `flush():Promise<void>`,
`close(state:'complete'|'interrupted'):Promise<void>` a constructor
`{flushBytes:4096;flushMs:50;write:(sequence:number,text:string)=>Promise<void>}`.
`StreamRedactor({secrets:readonly string[]})` má
`push(stream:'stdout'|'stderr'|'model',text:string):string`,
`finish(stream):string`; drží omezený bezpečnostní konec nezveřejněný.
Známý klíč žije jen v transport closure a redaktoru, ne v shared kontraktu.

Core `RunAgentLoopDependencies` dostane port
`safeModelText?:(text:string)=>string`, nastavený R3 composition před prvním
voláním. Použije se před saveR2Detail i návratem finalText; stream a uložená
zpráva musí mít stejný bezpečný obsah. Žádný desktop snapshot nepředává
raw R2 finalText. Před accept se známý klíč nebo známý credential assignment
v uživatelském tasku odmítne bezpečnou chybou, nikoli uloží do chat_messages,
desktop_jobs nebo agent_runs. Tool argument s takovým tajemstvím se odmítne
před auditem/spuštěním; nikdy se potichu nezmění význam schvalovaného příkazu.
Diff, permission, command result i diagnostické chyby procházejí stejnou
politikou bezpečného výstupu. Interní obnovovací blobs se nepředávají do UI.

Provider metadata se zachytí v infrastructure wrapperu ModelAdapter.stream
ještě před tím, než collector normalizuje výjimku na R1_MODEL_ADAPTER_FAILED.
Wrapper zavolá `setProviderError(requestId,{category,retryAfterMs})` pouze
s validovanými poli a původní výjimku dál normalizuje stávající collector;
raw message/body/headers se neukládají. Tím zůstane kompatibilní R1 chyba
a R3 neztratí auth/429/timeout. Usage je součet jen při známých údajích všech
tahů běhu; jakmile jeden chybí, celková usage=null, nikoli zdánlivě přesný
součet zbytku. Podrobná spotřeba a kreditní dashboard zůstávají mimo R3.

- [ ] **1. Napsat testy s deterministickým ModelAdapter double.** Po prvním text_delta a před completed je zpráva vidět v DB; 50 ms/4 KiB flush respektuje UTF-8. Tool call se nespustí před validated kompletním modelem. `expect(view.usage).toEqual({inputTokens:4,outputTokens:2})`, chybějící usage null; více tahů se sčítá. Rozdělené syntetické tajemství se nikdy neobjeví v uložených dávkách. Přerušený stream uchová bezpečný prefix a state interrupted.
- [ ] **2. Červený test.** `npm.cmd exec -- vitest run --project parallel backend/core/test/r3-model-stream.test.ts backend/infrastructure/test/stream-redactor.test.ts`.
- [ ] **3. Implementovat callbacks a batcher.** Core předává validovaný typ, ne raw SSE. Redaktor ponechá nejméně délku nejdelšího známého klíče minus 1 a nedokončené známé credential assignment do 4 KiB; buffer flush až po bezpečné klasifikaci. Limit 1 MiB na běh řídí backend. Zapečetit zprávu před terminal eventem, na callback/persistence failure zastavit bez verified. Uchovat safe provider kategorii a retryAfterMs bez těla chybové odpovědi: doplnit ProviderHttpError o validovaný volitelný retry údaj, ProviderAdapterError o tuto metadata, namapovat provider_error → provider. R1 failureCode zůstane stabilní; category je samostatný R3 detail. FetchProviderTransport zachová nejvýše 4 retry a celkový 120 s timeout, nový request nevznikne kvůli internímu retry.
- [ ] **4. Zelené ověření.** Krok 2 + `npm.cmd exec -- vitest run --project parallel backend/infrastructure/test/provider-transport.test.ts backend/core/test/model-response-collector.test.ts`. Ověřit auth, 429 s/bez validního Retry-After, timeout, duplicitní completed, cancel při flush, selhání zápisu a stejnou requestId vazbu všech dávek. Spy síť je jen kontraktní provider test; skutečné lifecycle DB testy mají reálnou SQLite.
- [ ] **5. Commit hranice.** B2 soubory; `feat(r3): persist bounded model stream and provider telemetry`.

Povinné testy B2/1/4 rozšíří secret scan na agent_run_details.result_json,
chat_messages, desktop_jobs, SQLite/WAL, eventy, snapshot/run.inspect,
command terminal output, logy a IPC odpovědi. Model syntetický klíč vrátí
jak po blocích, tak celý ve finální odpovědi; žádná vedlejší persistující
cesta jej nesmí uchovat. Prázdný či přes limit rostoucí nedokončený credential
assignment se nesmí na konci zveřejnit bez redakce. Timer flush zachytí chybu
write, zruší běh a nevyvolá unhandled rejection; terminální výsledek čeká na
dokončení všech bezpečných zápisů. Přidat usage z jednoho známého a jednoho
neznámého tahu a skutečně vyhozený ProviderAdapterError přes collector až do DB.

## B3: Skutečný průběžný výstup Windows příkazů

**Create:** backend/infrastructure/src/process/r2-command-protocol.ts,
tests/support/fixtures/process/r3-stream-output.ps1.
**Modify:** backend/core/src/process/ports.ts,
backend/infrastructure/src/process/r2-command-runner.ts,
backend/infrastructure/src/process/r2-command-worker.ps1,
backend/infrastructure/src/process/r2-command-job.cs,
backend/infrastructure/src/process/verifying-command-executor.ts,
backend/infrastructure/src/create-r2-infrastructure.ts.
**Test:** backend/infrastructure/test/r3-command-stream.test.ts,
backend/infrastructure/test/r2-command-runner.test.ts;
vitest.config.ts zařadí nový test do host-integration.

**Interfaces:** `CommandOutput {stream:'stdout'|'stderr';sequence:number;bytes:Uint8Array}`
je core interní ne-IPC typ. `CommandRunner.run(spec,signal,onOutput?:(output:CommandOutput)=>void)`
ponechá původní dvě povinné args a CommandResult. VerifyingCommandExecutor
sváže stream s ChangeActor.callId a requestId přes backendový sink
`onOutput?: (actor:ChangeActor, output:CommandOutput)=>void`.
Worker protocol v1: `output {stream,sequence,data:base64}` a jedno terminal
`result` se starými poli; type error je fail-closed. C# nový overload
`Run(..., Action<string,byte[]> onOutput)` a původní overload volá null sink.

- [ ] **1. Napsat host test s reálnou fixture.** Skript vypíše stdout a stderr, čeká 500 ms a skončí. Ověřit output callback před dokončením Promise; multibyte znak rozdělit přes byte bloky, výsledný text shodný. Smíchané/rozdělené JSON řádky, dvě terminal řádky a neplatný base64 musejí dát řízenou chybu. Tajemství přes bloky se neobjeví v DB ani subscriberu.
- [ ] **2. Červený test.** `npm.cmd exec -- vitest run --project host-integration backend/infrastructure/test/r3-command-stream.test.ts`.
- [ ] **3. Implementovat protokol a reader.** C# synchronizuje frame zápisy obou reader threads (žádné PowerShell scriptblock callbacks na cizím threadu); serializace output frame je v C# nebo thread-safe .NET sinku. Každý frame flush. Output cap 256 KiB dohromady; po cap zachovat stávající stop mechanismus. Node parser cyklem zpracuje všechny úplné řádky, ponechá jen neúplný tail; maximum řádky/bufferu z indexu. StringDecoder per stream, zredigovat před bounded sinkem a přetrváním. Terminal obsah se nesmí emitovat podruhé jako živý output. Pomalé UI nemění čtení pipe; pump pouze do omezeného sinku. Síť/klíče nejsou env procesu. CommandResult validity a Job Object identita zůstanou stávající.
- [ ] **4. Zelené ověření.** Krok 2 + r2-command-runner.test.ts, r2-process-probe.test.ts a process-runner.test.ts v host-integration. Ověřit output overflow, timeout a parent/child cancel, orphan nepřítomen nezávislým OS dotazem. Neúplný worker stream nesmí vytvořit verified record ani potvrzený stop.
- [ ] **5. Commit hranice.** B3 přesné cesty; `feat(r3): stream bounded output from Windows command jobs`.

Upřesnění B3/1/3/4: void output callback používá jedinou omezenou sériovou
zapisovací frontu; selhání SQLite nebo její přetečení zruší vlastní proces
a zabrání verified. Terminal výsledek se nezveřejní před drain fronty.
Test vynutí chybu zápisu i pomalý disk, nikoli jen pomalý renderer. Skutečné
streamování se dokazuje bariérou: proces čeká na release fixture a test ji
uvolní až po pozorování stdout i stderr; samotných 500 ms není důkaz.

## B4: Permission broker a pravdivé zastavení/obnova

**Create:** backend/core/src/desktop/permission-broker.ts,
backend/infrastructure/src/persistence/sqlite-owned-command-store.ts,
backend/infrastructure/src/process/owned-command-recovery.ts.
**Modify:** backend/core/src/desktop/run-manager.ts,
backend/infrastructure/src/create-r3-infrastructure.ts,
backend/infrastructure/src/process/r2-command-runner.ts,
backend/infrastructure/src/process/r2-command-worker.ps1,
backend/infrastructure/src/process/r2-command-job.cs (potřebný cancel handshake),
backend/infrastructure/src/process/r2-command-protocol.ts,
backend/core/src/process/ports.ts,
backend/core/src/tools/tool-execution-harness.ts (abortable waiting),
backend/core/src/agent/recover-r2-run.ts (návaznost na potvrzený procesní recovery).
**Test:** backend/core/test/r3-permission-broker.test.ts,
backend/infrastructure/test/r3-lifecycle.test.ts; host-integration.

**Interfaces:** `PermissionBroker` constructor
`{permissions:PermissionService;owns:(projectId:Uuid,chatId:Uuid,callId:Uuid)=>Promise<boolean>}`;
`wait(view:PermissionView, signal:AbortSignal):Promise<'allow_once'|'deny'>`,
`answer(projectId:Uuid,chatId:Uuid,input:PermissionDecisionInput):Promise<'accepted'|'duplicate'|'rejected'>`,
`close():void`. Adapter PermissionResponder closure z B1 zavolá wait
se signal aktivního běhu. answer řeší pending resolver; decide/claim
provádí harness, ne broker navíc. Dokončenou odpověď ověřit ze store,
duplicitní příchozí zpráva nikdy nezaloží nový resolver/spuštění.

Procesní protokol B3 se rozšíří o frame `owned` a řídicí zprávy `start`
a `cancel`. Worker vytvoří jedinečně pojmenovaný Job Object a suspended
target; před ResumeThread odešle vlastnictví (run/call, jobName, worker a
target PID + creation time). Parent jej trvale uloží do
`desktop_command_owners` (migrace 11 A3) a teprve potom pošle start.
Worker hlídá EOF řídicí pipe i životnost původního hostitele od začátku,
včetně čekání na start. Při ztrátě hostitele ukončí Job a sám skončí;
control handle se nesmí zdědit do cílových procesů. Tyto zprávy nejsou
renderer API a nepřijímají libovolný kód.

Core port `OwnedCommandStore` má `recordOwned(evidence):Promise<void>`,
`markStopped(callId):Promise<void>` a `pending(projectId):Promise<readonly OwnedCommand[]>`;
`OwnedCommand` obsahuje callId/runId/projectId, jobName a dvojice
`{pid:number;creationTime:string}` pro worker/target. Windows adaptér
`confirmOwnedCommandStopped(command,signal):Promise<boolean>` při restartu
ověří vlastní named job a identity, nikoli pouze nepřítomnost parent PID.
Nejasná evidence blokuje nový změnový běh daného projektu a vyvolá
recovery_required; nesmí ukončit cizí proces s recyklovaným PID. Full
Process Registry a dev servery z FR-COORD-15 zůstávají ŠF.

- [ ] **1. Napsat testy brokeru a real fixture lifecycle.** Čekající permission → odpojení subscriberu → nové připojení → allow jednou = jeden spawn. Druhá odpověď duplicate/rejected, jiné chatId rejected; deny nevytvoří marker. Cancel waiting ukončí resolver a closePending(cancelled), pozdější allow nic nespustí. stop při aktivním parent/child zůstává stopping, dokud OS nepotvrdí zmizení obou.
- [ ] **2. Červený test.** `npm.cmd exec -- vitest run --project parallel backend/core/test/r3-permission-broker.test.ts` a `npm.cmd exec -- vitest run --project host-integration backend/infrastructure/test/r3-lifecycle.test.ts`.
- [ ] **3. Implementovat broker/cancel.** Validovat vlastnictví i digest proti živé žádosti, jednou resolve, registry per run; nepřipojený renderer nedává povolení. Zachovat audit accepted/denied v PermissionService. R2 cancellation dnes může vracet treeStopped=false: doplnit řízený worker cancel kanál (stdin řádka cancel), C# vlastní Job handle ukončí a potvrdí prázdný strom. Stdin přijímá jen validované start/cancel zprávy výše, ne obecné příkazy. Když handshake selže, termination_failed/treeStopped=false a manager.shutdown stopped=false; UI nesmí zavřít s hláškou úspěchu. Dead host recovery nejprve ověří vlastní procesní stromy podle OwnedCommandStore, teprve poté RecoverR2Run + interruptUnfinished a zrušení neobnovitelných čekajících žádostí. Otevřené hostní runy se nezavřou kvůli renderer reloadu.
- [ ] **4. Zelené ověření.** Oba příkazy + kompletní R2 permission/process regrese. Race answer/cancel, dva submit, timeout během odpojení a kill worker mají explicitní důkaz žádného druhého spawn. Žádné potvrzení treeStopped pouze podle signal.aborted nebo smrti parent PID.
- [ ] **5. Commit hranice.** B4 soubory; `feat(r3): preserve approvals across renderer reconnect and confirm cancellation`.

Povinné regrese B4/1/4: hard-kill pouze Electron hostitele (ne /T celý
strom) během běžící parent/child fixture. Vnější test pozoruje, že worker
i podporovaní potomci skončili nejpozději do 2 s a pozdější marker nevznikl.
Stejná kontrola platí před start ACK a po něm. Restart nad stejnými daty
nejprve ověří procesní vlastnictví, pak RecoverR2Run a přerušené zprávy/job;
nikdy automatický replay. Simulace recyklovaného PID nesmí zastavit cizí
proces. Samotné interruptUnfinished ani recovery souborů nejsou důkazem
ukončení OS procesů. Timeout referenčního příkazu se měří od nastaveného
limitu a musí splnit AC-O1-08 (nejvýše další 2 s), ne jen testTimeout=60 s.
