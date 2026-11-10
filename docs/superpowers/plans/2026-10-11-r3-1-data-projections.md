# R3.1 – data, chaty a projekce Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trvale uložit projekty, chaty a přijatá zadání a poskytovat obnovitelný pohled na jejich stav.

**Architecture:** Core validuje vlastnictví, infrastruktura provádí transakce SQLite; události R2 vstupují do R3 projekce při databázovém zápisu.

**Tech Stack:** Existující Zod, TypeScript a node:sqlite; Vitest a reálné dočasné databáze.

**Spec:** [R3 specifikace](../specs/2026-10-11-r3-electron-workspace-design.md), §2–4 a §10.

## Global Constraints

Platí všechny [společné podmínky, typy a limity](2026-10-11-r3-implementation.md).
Migrační čísla 10 a 11 jsou nová; 0–9 se nemění. Přijaté zadání se po
pádu samo nespouští. Čtecí projekce není nová agentní smyčka.

## Review Focus

Dvojí requestId s jiným obsahem (A2), cizí projekt/chat (A1/A2), audit
vložený jinou cestou než EventStore.append (A3), pád před linkem runId
(A2/A3), omezená historie se souvislým kurzorem (A3).

## A1: Striktní kontrakty a backendová správa chatů

**Create:** shared/src/r3-chat.ts, shared/src/r3-project.ts,
shared/src/r3-stream.ts, shared/src/r3-ipc.ts, shared/src/r3-settings.ts,
shared/src/r3-changes.ts, shared/src/r3-verification.ts,
backend/core/src/desktop/ports.ts, backend/core/src/desktop/chat-service.ts,
backend/core/src/secrets/ports.ts (SecretProtector a ProviderAccessGate podle C1/C2).
**Modify:** shared/src/index.ts, backend/core/src/index.ts.
**Test:** shared/test/r3-contracts.test.ts, backend/core/test/chat-service.test.ts.

**Interfaces:** Všechny R3 typy z indexu vzniknou zde. ChatService constructor
`{ chats: ChatStore; projects: { get(id: Uuid): Promise<R3Project | null> } }`;
metody `create(projectId, title)`, `list(projectId, archived)`,
`rename(projectId, chatId, title):Promise<R3Chat>` a
`archive(projectId, chatId):Promise<void>`. Rename po zápisu vrátí znovu
načtený chat; IPC archive mapuje void na `{archived:true}`.
Backend ověří existenci projektu a příslušnost chatu;
aktivitu při archivaci kontroluje B1. Shared nabídne `r3SubmitInputSchema`,
`r3SnapshotSchema`, `r3UpdateSchema`, `r3IpcRequestSchema` a
`r3ProviderSettingsSchema`. IPC je discriminated union `operation`:
project.open/list, chat.create/list/rename/archive/snapshot/history,
run.submit/stop, permission.answer, changes.diff/revert, command.output,
run.inspect/activity,
settings.get/saveKey/removeKey/testKey/select/consent a stream.attach/detach.
Project.open má jen requestId, žádnou rendererem zadanou absolutní cestu.
Každá odpověď je `{ok:true,value:T}` nebo `{ok:false,error:{code,message}}`.

Konkrétní payload/value kontrakty (`requestId` ve všech příkazech):

| Operace | Payload navíc / úspěšná value |
| --- | --- |
| project.open; project.list | žádný / `{cancelled:true}` nebo R3Project; žádný / R3Project[] |
| chat.create; chat.list | projectId,title / R3Chat; projectId,archived / R3Chat[] |
| chat.rename; chat.archive | projectId,chatId,title / R3Chat; projectId,chatId / `{archived:true}` |
| chat.snapshot; chat.history | chatId / R3Snapshot; chatId,beforeSequence / `{messages,beforeMessageSequence}` |
| run.submit; run.stop | R3SubmitInput / R3Accepted; projectId,chatId,jobId / `{status:'requested'\|'already_terminal'}` |
| run.inspect; run.activity | chatId,targetRequestId / R3RunDetail; chatId,targetRequestId,beforeSequence / `{items,beforeSequence}` |
| permission.answer | projectId,chatId,decision:PermissionDecisionInput / `{status:'accepted'\|'duplicate'\|'rejected'}` |
| changes.diff; changes.revert | chatId,setId / R3ChangeView; chatId,setId,entryId?,expectedSetSequence,expectedWorkspaceRevision / `{status:'reverted'\|'conflicted'\|'recovery_required',revertedIds,blockedIds}` |
| command.output | chatId,callId,afterSequence / R3OutputPage |
| settings.get; settings.saveKey; settings.removeKey; settings.testKey | žádný; key; žádný; žádný / vždy R3ProviderSettings |
| settings.select; settings.consent | mode,maxSteps; version / R3ProviderSettings |
| stream.attach; stream.detach | chatId,afterCursor / `{subscriptionId,snapshot}`; subscriptionId / `{detached:true}` |

`R3ResponseFor<Operation>` spojuje operaci s její value; žádné libovolné
`unknown` v produkčním klientu. Error code enum: R3_INPUT_INVALID,
R3_NOT_FOUND, R3_CHAT_PROJECT_MISMATCH, R3_PROJECT_BUSY,
R3_RECOVERY_REQUIRED, R3_SECRET_UNAVAILABLE, R3_CONSENT_REQUIRED,
R3_RUNTIME_UNAVAILABLE, R3_PROJECT_UNAVAILABLE, R3_STALE_VIEW, R3_REQUEST_MISMATCH, R3_SENDER_REJECTED,
R3_INTERNAL. Interní výjimky se mapují na bezpečný text bez stacku/klíče.

Povinné doplnění A1/1–4: `R3RunView.phase`, neměnné modelové metadata,
R3RunDetail/R3VerificationView a stránky aktivit z indexu mají strict schema.
Settings obsahují také `model:ModelDescriptor` a
`dataPolicy:{version:string;requiresConfirmation:boolean;notice:string;sourceUrls:readonly string[]}`;
modelId odpovídá model.modelId a dataPolicyVersion odpovídá dataPolicy.version.
Backend katalog nabízí pouze explicitní demo a OpenAI/gpt-6-luna; cizí
model ID/endpoint není povolený vstup. Test ověří unsupported/unknown
capability, odlišnou fázi a job state a odmítnutí cizího targetRequestId.

- [ ] **1. Napsat kontraktní testy.** Ověřit task `''` a 16 385 znaků, maxSteps 0/33, title 121, cizí klíče objektu, ne-UUID, NaN kurzor, extra projectRoot/argv v submit a neznámou operaci. Test chat service má projekt A a chat B: `await expect(service.rename(projectA, chatB, 'x')).rejects.toThrow('R3_CHAT_PROJECT_MISMATCH')` a úložiště zůstane nezměněné. `expect(r3SubmitInputSchema.safeParse({...valid,maxSteps:33}).success).toBe(false)`; všechny value v tabulce mají strict schema a secret key nesmí projít response schema.
- [ ] **2. Potvrdit červený test.** `npm.cmd exec -- vitest run --project parallel shared/test/r3-contracts.test.ts backend/core/test/chat-service.test.ts`; očekávat selhání chybějícího exportu, ne chybu runtime setupu.
- [ ] **3. Implementovat uvedené kontrakty a ChatService.** Striktní Zod, UTF-16 délka zadání shodná s R1; text trim, žádný NUL. r3-settings definuje `R3ProviderSettings {mode:R3Mode; modelId:string; model:ModelDescriptor; maxSteps:number; keyState:'missing'|'stored'|'unavailable'; keyVersion:number; testedAt:IsoTimestamp|null; testResult:'not_tested'|'passed'|'failed'; dataPolicyVersion:string; consentVersion:string|null; dataPolicy:{version:string;requiresConfirmation:boolean;notice:string;sourceUrls:readonly string[]}}`. Zapsat přesné payloady operací podle společných typů a pozdějších C3/C4 podpisů; key vstup 1–4 096 znaků se neposílá v žádné odpovědi. Stream.attach přijímá chatId/afterCursor; detach subscriptionId. Permission.answer nese projectId/chatId a existující PermissionDecisionInput. Changes operace nesou chatId/setId a revert volitelně entryId i nové requestId.
- [ ] **4. Zelený test a typecheck.** Stejný příkaz jako krok 2, potom `npm.cmd run typecheck`; očekávat všechny cílené testy prošlé a exit 0. Ověřit že schema serializace odmítne Buffer/AbortSignal/funkce.
- [ ] **5. Commit hranice.** Stage jen výše uvedené soubory a související exporty; ověřit staged diff; budoucí commit `feat(r3): define desktop contracts and chat ownership`.

## A2: Migrace 10, projekty, chaty a idempotentní přijetí

**Create:** backend/infrastructure/src/persistence/r3-chat-migration.ts,
backend/infrastructure/src/persistence/sqlite-chat-store.ts,
backend/infrastructure/src/persistence/sqlite-desktop-request-store.ts,
backend/infrastructure/src/persistence/sqlite-desktop-project-store.ts,
backend/infrastructure/src/persistence/open-desktop-database.ts.
**Modify:** backend/infrastructure/src/persistence/migrations.ts,
backend/infrastructure/src/index.ts.
**Test:** backend/infrastructure/test/r3-chat-persistence.test.ts.

**Interfaces:** `SqliteChatStore(database, clock, ids): ChatStore`;
`SqliteDesktopRequestStore(database, clock, ids): DesktopRequestStore`;
`SqliteDesktopProjectStore(database, clock)` má `remember(projectId, root,
displayName): Promise<R3Project>`, `get(id): Promise<R3Project|null>`,
`list(): Promise<readonly R3Project[]>`, `root(id): Promise<string>`.
`openDesktopDatabase(userDataPath): Promise<{database:DatabaseSync;close():void}>`
provede migraci a konzistentní zálohu existující DB před změnou schématu.
Podklad workspaces/root_identity z R2 je kanonická identita; R3 metadata
nepřiřazují legacy UUID-only historii podle podobnosti souborů.

- [ ] **1. Napsat reálné SQLite testy.** Vytvořit temp DB, migrace 0–9 a reprezentativní R0/R2 záznam. Po upgrade/reopen zachovat záznam, checksumy i PRAGMA foreign_key_check bez řádků. `accept(input, projectId, modelDescriptor)` dvakrát vrací stejné jobId/messageId, druhé duplicate=true a jedna zpráva; jiný task pod stejným requestId odmítnout. Fault injection uprostřed transakce musí zanechat buď oba user message/job, nebo nic.
- [ ] **2. Červený test.** `npm.cmd exec -- vitest run --project parallel backend/infrastructure/test/r3-chat-persistence.test.ts`; nejprve selže chybějící úložiště/migrace.
- [ ] **3. Implementovat migraci a úložiště.** Nové STRICT tabulky desktop_projects (FK workspaces, kanonická cesta mimo audit), chats (FK workspaces, title/archived/timestamps), chat_messages (role, requestId, retryOfRequestId, runId nullable, per-chat sequence, text/state), desktop_jobs (UUID, projectId FK workspaces, chatId, requestId UNIQUE, inputDigest, normalizovaný vstup, descriptor_json, retryOfRequestId, state, runId nullable, timestamps/result/provider_error/usage). accept v BEGIN IMMEDIATE vloží user zprávu a queued záměr; digest zahrnuje chat/task/maxSteps/mode/retryOfRequestId a projekt. getByRequestId/get čtou uloženou identitu, stejné UUID s jiným vstupem je R3_REQUEST_MISMATCH. Retry parent musí patřit témuž chatu; je jen vazbou, nikoli replay. attachRun ověří agent_runs.request_id; link i změna stavu ve stejné transakci. Nová infrastruktura pokračuje jen z přijatého záměru existující instance; interruptUnfinished označí queued/running/stopping po restartu jako interrupted, ne queued replay. Kontrolovat aktivní job před archivací i přímo v transakci. Konzistentní záloha využije SQLite backup mechanismus a ověření, ne kopii samotného .sqlite při aktivním WAL; selhání zálohy zabrání upgrade.
- [ ] **4. Zelené ověření.** Příkaz z kroku 2 a `npm.cmd exec -- vitest run --project parallel backend/infrastructure/test/sqlite.test.ts backend/infrastructure/test/r2-persistence.test.ts`; všechny cílené testy projdou. Přidat rollback zálohy/migrace, neznámé projectId a reopen archivovaného chatu.
- [ ] **5. Commit hranice.** Stage jen A2 cesty a exporty; `feat(r3): persist chats and recoverable request intents`.

Upřesnění A2/1/3/4: aktivní projekt vynutit i databázově (jedinečný index
desktop_jobs pro projectId ve stavech queued/running/stopping); dvě souběžná
accept nesmějí projít mezi kontrolou a zápisem. AttachRun naváže rovněž
již uložené user/assistant zprávy daného requestId. Metadata modelu/režimu
a limit jsou součástí přijatého záměru, jejich změna v nastavení nezmění
historii. Při obnově queued/running/stopping uzavřít neukončené assistant
zprávy jako interrupted v téže obnovovací transakci, zachovat potvrzený
prefix a emitovat změnu projekce. Test hard restartu nesmí nechat věčný
streaming/loading. Dostupnost projektu je aktuální pozorování, ne důvěra
v uložené available=true; nedostupnost nesmí znepřístupnit chatovou historii.

## A3: Migrace 11, trvalá projekce a snapshot bez mezery

**Create:** backend/infrastructure/src/persistence/r3-projection-migration.ts,
backend/infrastructure/src/persistence/sqlite-desktop-projection-store.ts,
backend/infrastructure/src/persistence/sqlite-desktop-action-store.ts,
backend/core/src/desktop/subscription-service.ts.
**Modify:** backend/infrastructure/src/persistence/migrations.ts,
backend/core/src/desktop/ports.ts, backend/core/src/index.ts,
backend/infrastructure/src/index.ts.
**Test:** backend/infrastructure/test/r3-projection-store.test.ts,
backend/core/test/subscription-service.test.ts.

**Interfaces:** `SqliteDesktopProjectionStore(database, clock, ids): DesktopProjectionStore`.
`SqliteDesktopActionStore(database):DesktopActionStore` implementuje port
z indexu nad desktop_actions, jedinečné requestId + digest cíle/rozsahu.
Při start recovery se nedokončené akce označí interrupted bez replaye.
`SubscriptionService(store: DesktopProjectionStore)` má
`attach(chatId:Uuid, afterCursor:number, send:(update:R3Update)=>void):Promise<{id:Uuid;snapshot:R3Snapshot}>`,
`detach(id:Uuid):void`, `drain():Promise<void>`, `close():void`.
Attach registruje subscriber před snapshotem a při drain respektuje
snapshot.cursor; C4 vystaví v IPC jeho vlastní session ID a sender binding.
Projekční refresh se načte stránkovaně, nikdy full event log na každém ticku.

Součástí migrace 11 jsou `desktop_command_owners` podle B4 a
`desktop_actions` pro idempotentní revert podle C4 a
`desktop_verification_coverage`, vazba recordId na
backendem určený profil a coveredPaths podle B1. Chybějící coverage starého
recordu se nesmí domyslet; zůstane historickým omezeným důkazem. Metody
inspectRun/activity z indexu vlastní autorizaci přes chat → job → run;
čtení historického detailu používá stejnou fresh kontrolu C4 jako snapshot.
Aktivita má stabilní event sequence; při převodu všech perzistentních událostí
nesmí vzniknout druhý významový audit ani se vynechat starší decision.
Události bez session_id (zejména permission) se v projekci svážou přes
tool call; jejich stránkovací pořadí je uložený per-run projekční integer,
ne časová známka ani neexistující session sequence zdrojového eventu.

- [ ] **1. Napsat testy všech vstupních cest.** Tool/store zapisující přes insertEvent ve vlastní transakci musí vytvořit refresh s vyšším per-chat kurzorem, i když EventStore.append nebyl volán. Rollback zdrojového eventu rollbackuje i projekci. Uložit 101 zpráv a vrátit posledních 100 s beforeMessageSequence; po 1 025 updatech starý kurzor vrátí resync_required. Attach s vloženým eventem mezi registrací a čtením snapshotu nepřijde o změnu ani ji neaplikuje dvakrát.
- [ ] **2. Červený test.** `npm.cmd exec -- vitest run --project parallel backend/infrastructure/test/r3-projection-store.test.ts backend/core/test/subscription-service.test.ts`.
- [ ] **3. Implementovat projekci.** Migrace 11 přidá chat_cursors, desktop_updates, command_outputs a coverage. Trigger INSERT events dohledá běh přes session_id, případně přes tool_calls.call_id=correlation_id, a teprve pro run.created před attachRun přes agent_runs.request_id/desktop_jobs.requestId. Permission události dnes mají correlation_id=callId a bez session_id; mutation/verification mají rovněž callId. Z nalezeného runu určit jednoznačný desktop job a v téže transakci zvýšit kurzor právě jednou. Samostatný revert request stále patří runu vlastnícímu sadu, nikoli novému chatu podle requestId. Řádky bez desktop jobu nic nepřidávají (R0/R1/R2 zůstávají samostatné). Zprávy/output/finish zvyšují stejný kurzor transakčně. Snapshot načte projekt/chat, poslední zprávy, job, skutečnou AgentRun fázi, pending permission, summary změn, command views a bezpečné R3ActivityView pod jedním DB read transaction. Převod audit → view je explicitní allowlist, nikoli předání payload_json rendereru. C4 obnoví pozorování a invalidaci před čtením snapshotu; filesystem I/O neprobíhá v otevřené DB transakci. Output je obnovitelný přes output(chatId,callId,afterSequence), s kontrolou příslušnosti a byte limitem z indexu. Ztracené linky job/run po pádu deterministicky sváže přes agent_runs.request_id, ale nespouští smyčku. appendAssistant je idempotentní per (requestId,step,sequence); duplicitní sekvence s jiným textem je chyba. Žádné mazání původních events při ořezu 1 024 updatů. Drain každých 50 ms; plná fronta vyšle resync a odpojí starou frontu. IDs získat z IdGenerator, dispose ruší timer; poll bez změny nic neposílá.
- [ ] **4. Zelené ověření.** Stejný příkaz a typecheck/lint/check:deps celé části. Ověřit cross-chat kurzory, neznámé chatId, opakovaný detach, rollback přidané dávky, nepřítomnost plných tool souborů/provider-native payloadů ve snapshotu. Test pomalého subscriberu: 257 čekajících událostí → resync, paměť pod společným limitem, backend pokračuje.
- [ ] **5. Commit hranice.** Přesné A3 soubory; `feat(r3): add durable desktop projections and reconnect cursors`.

Povinné regrese A3/1/4 používají skutečné SqlitePermissionStore,
SqliteMutationJournal a SqliteVerificationStore: permission.requested,
permission.decided, patch, verification i uživatelský revert s novým
requestId vytvoří update správného chatu právě jednou. Ručně vložený event
s uměle sjednocenou correlationId tento důkaz nenahrazuje. Dva dokončené
úkoly v jednom chatu musí zachovat oddělené run.inspect, checks a setId;
101 auditních položek lze projít ve dvou stránkách bez ztráty či duplicit.

Závěrečné kontrolní příkazy části jsou v indexu. E2E a packaged důkaz
zatím nejsou splněné úspěchem SQLite testů.
