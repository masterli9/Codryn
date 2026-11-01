# R3 – minimální Electron pracovní plocha Implementation Plan

> **Aktuální stav — 1. listopadu 2026:** Historický plán níže zachovává původní zadání a checkboxy. Implementace A1–E2 již má skutečné důkazy bodů 1–5; závěrečné ověření je agregát fází po opravách, nikoli jeden zelený příkaz `verify:r3`. E3 dokumentace a předání jsou připravené v [akceptaci](../../r3-acceptance.md) a [handoff záznamu](2026-11-01-r3-step6-handoff.md). Čerstvý [live GUI protokol](../../evals/r3-desktop-2026-11-01.md) poslední série dosáhl 4/5 při zachování dvou předchozích 0/5; osobní přijetí a vypsané vizuální/streamové mezery zůstávají otevřené; R3 ani celé O1 tím nejsou uzavřené. Pozdější schválené pokračování a skutečné výsledky sledujte v [progress](2026-10-11-r3-progress.md); historická formulace níže o neuděleném souhlasu nepřebíjí následné zadání autora.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Způsob provedení zvolí autor; tento dokument sám nespouští implementaci ani delegaci.

**Goal:** Dodat použitelnou Windows pracovní plochu nad stejným R2 jádrem, s trvalými chaty, chráněným API klíčem, průběžnou aktivitou, oprávněními, diffem a obnovou rozhraní.

**Architecture:** React renderer používá pouze validovaný preload. Backend vlastní zprávy, běhy, oprávnění a platnost ověření; existující RunAgentLoop a Windows runner se rozšíří o pozorovatelný průběh. SQLite udržuje obnovitelný záměr spuštění a souvislou projekci pro snapshot/reconnect; Electron adaptér chrání klíč systémovým šifrováním.

**Tech Stack:** npm workspaces, Node 24.19.0, npm >=11 <12, TypeScript 6.0.3, Zod, SQLite/WAL, Electron 43.4.0, Forge/Webpack, React, Vitest, Windows 11.

**Spec:** [R3 návrh](../specs/2026-10-11-r3-electron-workspace-design.md). Autor 11. října 2026 po jeho porovnání s PRD zadal sepsání tohoto plánu; nejde o souhlas s provedením implementace.

Renderer je část aplikace vykreslující okno. IPC je omezené volání z okna
do privilegované části; port je backendové rozhraní, za kterým lze vyměnit
konkrétní adaptér. Snapshot je úplný pohled na stav v jednom okamžiku,
projekce jeho uložená čtecí podoba a kurzor pořadové číslo změny.
Stream posílá výstup průběžně. Idempotentní přijetí znamená, že opakovaný
stejný požadavek nemá druhý účinek. Gate označuje povinné dokončovací
kontroly. DPAPI je systémové šifrování Windows svázané s uživatelským účtem.

## Podklady a vyřešené návaznosti

| Dokument | Dopad na plán |
| --- | --- |
| [AGENTS](../../../AGENTS.md), [PROJECT_CONTEXT](../../../PROJECT_CONTEXT.md) | Hranice vrstev, práce na feature branchi, backendový zdroj pravdy a přijaté R3 volby |
| [PRD v1.1](../../../PRD_v1.1.md), [registr v1.1](../../../REGISTR_ROZHODNUTI_v1.1.md) | Produktový kontrakt, jednorázová oprávnění, ověření, bezpečnost klíčů a potvrzený provider |
| [ROADMAP §7–8](../../product/ROADMAP.md), [etapizace v1.0](../../product/ETAPIZACE_v1.0.md) | R3 pracovní plocha; R4 strukturované otázky, TypeScript profil, repo mapa a Git pracovní tok |
| [R0 hranice](../../architecture/r0-boundaries.md), [R1 smyčka](../../architecture/r1-agent-loop.md) | Forge/SQLite/omezený preload a jediná agentní smyčka |
| [R2 lifecycle](../../architecture/r2-change-lifecycle.md), [identita projektu](../../architecture/r2-project-identity.md), [provider kontrakt](../../architecture/r2-provider-contract.md) | Zachování expected-hash/revision, bezpečného návratu a normalizovaných modelových událostí |
| [ADR 0003](../../decisions/0003-generic-sessions.md), [0005](../../decisions/0005-r2-guarded-write.md), [0006](../../decisions/0006-r2-process-ownership.md), [0007](../../decisions/0007-r2-provider-selection.md) | Migrace, Windows zápis/procesní vlastnictví a GPT-6 Luna bez nového výběrového evalu |
| [R2 acceptance](../../r2-acceptance.md), [autorský checklist](../../r2-author-checklist.md), současné verify-r2 a packaged testy | Zachovat reálné regrese, doplnit nové UI důkazy a nezaškrtávat zkušenost za autora |
| [R3 specifikace](../specs/2026-10-11-r3-electron-workspace-design.md) | Konkrétní pracovní tok, klíče, obnova, čtyři vizuální varianty a akceptační oblasti |

Historické dokumenty určují návaznosti; při rozporu platí současné PRD
a kontext. Integrační body byly porovnány také se skutečnými src/test
soubory na main de470b6, nikoli jen s původními R2 plány.

Revize po preventivní kontrole: [audit vůči PRD v1.1](2026-10-11-r3-plan-review.md).
Obsahuje nálezy, jejich opravy v A1–E3 a úplné zařazení M/O1 požadavků.
Odkaz na úkol znamená plánované pokrytí, nikoli splnění požadavku.

## Global Constraints

- Autority: PROJECT_CONTEXT.md, PRD_v1.1.md, REGISTR_ROZHODNUTI_v1.1.md, ROADMAP §7–8 a R3 specifikace; historické R2 plány nejsou popisem aktuálního kódu.
- Větev feat/r3-electron-workspace z main de470b6; zachovat existující změny dokumentů. Žádný reset, push ani PR bez zadání.
- Backend je jediným zdrojem pravdy; renderer bez Node API, SQL, filesystemu a přímého spouštění příkazů. Produkční kód neimportuje tests/support.
- RunAgentLoop zůstává jedinou smyčkou. R1/R2 veřejné výsledky, existující audit a migrace 0–9 včetně checksumů se zachovají.
- Kompatibilita R2 nesmí zachovat falešné ověření: B1 výslovně zpřesní pokrytí referenční kontrolou a B2 odstraní nechráněnou perzistenci textu. Formát veřejného R2 výsledku zůstane stejný.
- Jeden aktivní produktový běh nad kanonickým projektem; nezamykat nezávislé externí editace a nezastavovat cizí dev servery.
- Trvalé OS chráněné klíče, test/nahrazení/odstranění už v R3; žádný plaintext fallback, klíč v SQLite, logu, argv nebo cloudu.
- gpt-6-luna / OpenAI Responses a explicitní offline demo; není nový provider eval, druhý adaptér ani tvrzení o vítězství nad Gemini.
- Existující textové patche a referenční sum.test.mjs; relevantní obecné TypeScript kontroly, @ reference, strukturované otázky, repo mapa a Git panel navážou v R4.
- Instrument Sans lokálně s licencí, bez Lucide; světlá/tmavá varianta, limetkový/lesní akcent k vizuálnímu posouzení před implementací vzhledu.
- Všechny příkazy níže běží z E:\kodovani\projekty\Codryn; používat npm.cmd, shell:false a windowsHide pro pomocníky. Testy 15 s, hostní testy 60 s; celý dílčí gate nejvýše 10 minut na podproces.
- Nezasahovat do Dokumentace příklady/. Skutečné klíče ani soukromý projekt neslouží automatickým testům.
- Checkboxy jsou budoucí práce, žádný implementační krok ani test aplikace nebyl při psaní tohoto plánu proveden.

## Review Focus

1. Dvojí odeslání a pád mezi přijetím úkolu a startem: jeden záměr a jedna zpráva, žádné automatické spuštění po pádu; testy A2/B1.
2. Zastaralé ID projektu, chatu nebo schválení po přepnutí UI: kontrola vlastnictví před každou akcí; testy A1/C4/D3.
3. UTF-8 a tajemství rozdělené mezi výstupní bloky: správné dekódování a redakce před perzistencí i odesláním do UI; testy B2/B3/C2.
4. Odpojený pomalý renderer a větší historie: souvislý kurzor, omezená fronta/paginace a nový snapshot bez zablokování procesu; testy A3/C4/D1.
5. Selhání uložení klíče či zrušení procesu: starý klíč zůstane použitelný, zastavení není potvrzeno před skutečným koncem; testy C1/C2/B4/E2.

## Pořadí, kontrolní body a části

| Část | Úkoly | Výstup a závislosti |
| --- | --- | --- |
| [R3.1 – data a projekce](2026-10-11-r3-1-data-projections.md) | A1–A3 | Ověřené kontrakty, trvalé chaty, obnovitelný záměr a souvislý snapshot |
| [R3.2 – běhy a výstupy](2026-10-11-r3-2-runs-streams.md) | B1–B4 | Jedna správa běhů, model/proces streaming a bezpečný lifecycle; po A1–A3 |
| [R3.3 – klíče a desktop](2026-10-11-r3-3-secrets-ipc.md) | C1–C4 | Windows klíčový důkaz, trvalé klíče, provider služby a ověřené IPC; C1 lze ověřit po A1 |
| [R3.4 – pracovní plocha](2026-10-11-r3-4-renderer.md) | D1–D4 | React pracovní tok, návrhové varianty, čitelné stavy a nastavení; po B/C, návrhy D2 lze připravit dříve |
| [R3.5 – dokončení](2026-10-11-r3-5-acceptance.md) | E1–E3 | Skutečné CLI/UI E2E, packaged Windows gate a autorský handoff |

Celkem 18 úkolů. C1 je technická brána pro skutečnou ochranu Windows,
D2 je vizuální posouzení čtyř variant. Neúspěšná brána má vlastní důvod
a nápravu; bezpečnost se nevypouští, schválení vzhledu se nepředstírá.
Každá část je samostatně testovatelná; implementace je postupná podle
závislostí, nikoli pět paralelních zásahů do sdílených souborů.

## Mapa aktuálního kódu

- apps/desktop/src/composition-root.ts skládá jen RunR0Diagnostics; preload vystavuje pouze runR0Diagnostics. Produktové R3 služby ani React zatím nejsou připojené.
- createR2Infrastructure přijímá model, permissionResponder a trustedVerificationExecutable; vrací agentLoop, changes, permissions, recover a eventStore. Každý běh potřebuje vlastní adapter state; infrastructure se nesmí zavřít během starého běhu.
- RunAgentLoop.executeR2 generuje runId a zakládá agentní session; zachovat tento zdroj ID. R3 záměr je přijat dříve a později se naváže přes requestId, bez druhého orchestrátoru.
- collectModelResponse drží text do dokončení. RunAgentLoop zatím neukládá usage do pohledu chatu a zjednodušuje modelové chyby na R1_MODEL_ADAPTER_FAILED.
- ToolExecutionHarness vyčká na PermissionResponder a poté sám zavolá PermissionService.decide/claim. UI nemá rozhodovat podruhé; B4 použije tento bod.
- R2CommandRunner zpracovává jednu výslednou JSON řádku a C# sbírá stdout/stderr do bufferů. B3 změní worker protokol i čtení více řádků; původní Run overload zůstane kompatibilní.
- SqliteAgentRunStore, tool store a permission store zapisují události samostatně přes insertEvent; nestačí sledovat pouze EventStore.append. A3 zahrne všechny zápisy pomocí transakční SQLite projekce.
- Migrace končí verzí 9; A2 doplní 10 a A3 doplní 11 bez změny starých SQL.
- Vitest má serializovaný host-integration projekt (60 s). Skutečné Git/process/OS testy se zařadí právě sem; renderer dostane samostatný DOM projekt.

## Společné nové kontrakty a limity

Následující názvy jsou **budoucí** rozhraní, ne existující exporty. Typy
v shared vzniknou v A1, porty v core v A1–A3; exportovat je přes existující
src/index.ts. ID jsou validované Uuid, čas IsoTimestamp.

```ts
// shared/src/r3-chat.ts — A1
type R3Mode = 'demo' | 'openai';
type R3JobState = 'queued' | 'running' | 'stopping' | 'finished' | 'interrupted';
interface R3SubmitInput {
  requestId: Uuid; chatId: Uuid; task: string; maxSteps: number; mode: R3Mode;
  retryOfRequestId?: Uuid;
}
interface R3Accepted { requestId: Uuid; messageId: Uuid; jobId: Uuid; duplicate: boolean }
interface R3Chat { id: Uuid; projectId: Uuid; title: string; archived: boolean; createdAt: IsoTimestamp }
interface R3Message {
  id: Uuid; chatId: Uuid; requestId: Uuid; runId: Uuid | null;
  retryOfRequestId: Uuid | null;
  role: 'user' | 'assistant'; text: string; sequence: number;
  state: 'streaming' | 'complete' | 'interrupted'; createdAt: IsoTimestamp;
}
interface R3RunView {
  jobId: Uuid; requestId: Uuid; runId: Uuid | null; state: R3JobState;
  phase: 'idle' | 'preparing_context' | 'waiting_for_model' | 'waiting_for_user_input'
    | 'waiting_for_approval' | 'executing_tool' | 'verifying' | 'completed' | 'cancelled' | 'failed' | null;
  mode: R3Mode; model: ModelDescriptor; maxSteps: number;
  result: Omit<R2RunResult, 'finalText'> | null;
  failure: { code: AgentRunFailureCode | R3ErrorCode; message: string } | null;
  stepCount: number; startedAt: IsoTimestamp | null;
  endedAt: IsoTimestamp | null; usage: { inputTokens: number; outputTokens: number } | null;
  providerError: { category: 'auth' | 'rate_limit' | 'timeout' | 'interrupted' | 'invalid_tool_call' | 'provider'; retryAfterMs: number | null } | null;
}
```

```ts
// shared/src/r3-project.ts / r3-stream.ts — A1
interface R3Project { id: Uuid; displayName: string; available: boolean; mode: 'git' | 'non-git' | 'git-unavailable';
  limitations: readonly {code:'detached_head'|'git_conflict'|'git_unavailable'|'project_unavailable'|'runtime_unavailable';message:string}[] }
interface R3Snapshot {
  project: R3Project; chat: R3Chat; cursor: number; messages: readonly R3Message[];
  beforeMessageSequence: number | null; run: R3RunView | null;
  permissions: readonly PermissionView[]; activity: readonly R3ActivityView[];
  changes: R3ChangeSummary | null; commands: readonly R3CommandView[];
  verification: R3VerificationView | null;
  beforeActivitySequence: number | null;
}
interface R3RunDetail {
  chatId: Uuid; run: R3RunView; cursor: number;
  changes: R3ChangeSummary | null; verification: R3VerificationView | null;
  commands: readonly R3CommandView[]; activity: readonly R3ActivityView[];
  beforeActivitySequence: number | null;
}
interface R3VerificationView {
  status: 'verified' | 'partially_verified' | 'unverified' | 'stale'; reason: string;
  freshness: 'current' | 'unavailable'; observedAt: IsoTimestamp | null;
  checks: readonly { record: VerificationRecord; coveredPaths: readonly string[];
    durationMs: number | null }[];
  uncoveredPaths: readonly string[]; missingChecks: readonly string[];
}
type R3Update =
  | { kind: 'refresh'; chatId: Uuid; cursor: number }
  | { kind: 'message'; chatId: Uuid; cursor: number; message: R3Message }
  | { kind: 'command_output'; chatId: Uuid; cursor: number; callId: Uuid; stream: 'stdout' | 'stderr'; text: string; truncated: boolean }
  | { kind: 'resync_required'; chatId: Uuid; cursor: number };
// Podrobný diff/output se čte konkrétní operací; refresh nenese celý diff.
// shared/src/r3-changes.ts — A1; pouze metadata, žádné obnovovací blobs.
interface R3RevertInput { requestId: Uuid; chatId: Uuid; setId: Uuid; entryId?: Uuid;
  expectedSetSequence: number; expectedWorkspaceRevision: number }
interface R3RevertResult { status: 'reverted' | 'conflicted' | 'recovery_required';
  revertedIds: readonly Uuid[]; blockedIds: readonly Uuid[] }
interface R3ChangeSummary { setId: Uuid; entryCount: number; recoveryRequired: boolean }
interface R3ChangeView {
  summary: R3ChangeSummary;
  observedSetSequence: number; workspaceRevision: number;
  entries: readonly { id: Uuid; path: string; sequence: number; kind: 'patch' | 'revert'; reversesId: Uuid | null }[];
  diffs: readonly FileDiff[];
  baseline: { mode: 'non-git'; reason: 'not_repository' | 'git_unavailable' }
    | { mode: 'git'; head: string | null; branch: string | null;
        status: readonly { path: string; xy: string }[]; conflicts: readonly string[] };
}
interface R3CommandView {
  callId: Uuid; executable: string; args: readonly string[]; cwd: string;
  status: 'running' | 'succeeded' | 'failed' | 'timed_out' | 'cancelled' | 'termination_failed';
  exitCode: number | null; durationMs: number | null; treeStopped: boolean | null;
  stdoutTail: string; stderrTail: string; truncated: boolean; outputAvailable: boolean;
}
interface R3OutputPage { callId: Uuid; afterSequence: number | null;
  chunks: readonly { sequence: number; stream: 'stdout' | 'stderr'; text: string }[];
  truncated: boolean }
interface R3ActivityView { eventId: Uuid; sequence: number; runId: Uuid; type: string; occurredAt: IsoTimestamp;
  callId: Uuid | null; summary: string;
  details: readonly { label: string; value: string }[]; detailsTruncated: boolean }
```

```ts
// backend/core/src/desktop/ports.ts — A1/A2/A3
interface ChatStore {
  create(projectId: Uuid, title: string): Promise<R3Chat>;
  list(projectId: Uuid, archived: boolean): Promise<readonly R3Chat[]>;
  get(chatId: Uuid): Promise<R3Chat | null>;
  rename(chatId: Uuid, title: string): Promise<void>;
  archive(chatId: Uuid): Promise<void>;
}
interface DesktopRequestStore {
  getByRequestId(requestId: Uuid): Promise<{input: R3SubmitInput; projectId: Uuid; accepted: R3Accepted; view: R3RunView} | null>;
  get(jobId: Uuid): Promise<R3RunView | null>;
  accept(input: R3SubmitInput, projectId: Uuid, model: ModelDescriptor): Promise<R3Accepted>;
  attachRun(requestId: Uuid, runId: Uuid): Promise<void>;
  setState(jobId: Uuid, state: R3JobState): Promise<void>;
  finish(jobId: Uuid, result: R2RunResult): Promise<void>;
  interruptUnfinished(projectId: Uuid): Promise<void>;
}
interface DesktopActionStore {
  get(requestId: Uuid): Promise<{digest:string; state:'started'|'finished'|'interrupted'; result:R3RevertResult|null} | null>;
  begin(input: R3RevertInput, digest: string): Promise<void>;
  finish(requestId: Uuid, result: R3RevertResult): Promise<void>;
}
interface DesktopProjectionStore {
  snapshot(chatId: Uuid): Promise<R3Snapshot>;
  inspectRun(chatId: Uuid, targetRequestId: Uuid): Promise<R3RunDetail>;
  activity(chatId: Uuid, targetRequestId: Uuid, beforeSequence: number | null):
    Promise<{items: readonly R3ActivityView[]; beforeSequence: number | null}>;
  messages(chatId: Uuid, beforeSequence: number | null): Promise<readonly R3Message[]>;
  appendAssistant(requestId: Uuid, step: number, sequence: number, text: string): Promise<void>;
  sealAssistant(requestId: Uuid, step: number, state: 'complete' | 'interrupted'): Promise<void>;
  setUsage(requestId: Uuid, usage: { inputTokens: number; outputTokens: number }): Promise<void>;
  setProviderError(requestId: Uuid, error: R3RunView['providerError']): Promise<void>;
  appendOutput(requestId: Uuid, callId: Uuid, stream: 'stdout' | 'stderr', text: string, truncated: boolean): Promise<void>;
  output(chatId: Uuid, callId: Uuid, afterSequence: number | null): Promise<R3OutputPage>;
  updates(chatId: Uuid, afterCursor: number, limit: number): Promise<readonly R3Update[]>;
}
```

`R3ProjectService.open(root:string,signal:AbortSignal):Promise<R3Project>`,
`get(id):Promise<R3Project|null>`, `list():Promise<readonly R3Project[]>`
a `root(id):Promise<string>` jsou backendové metody B1; open nikdy není
v preloadu s parametrem root. Veřejná IPC project.open použije OS dialog.
R3ChangeView vynechá indexHash/worktreeIdentity i blob identifikátory;
baseline je zachycený výchozí stav, ne aktuální výsledek ověření.
R3CommandView je serializovaný a redigovaný pohled, nemá obecný executable
vstup ani import core CommandResult do rendereru.

`phase` se čte z kanonického AgentRun, `state` popisuje pouze desktopový
záměr a zastavování. UI z auditních textů neodvozuje vlastní stavový automat.
`waiting_for_user_input` je kompatibilní hodnota pro R4, v R3 ji bez otázkového
workflow nelze vytvořit. Metadata modelu se uloží při přijetí běhu a historie
se nikdy nepřepíše aktuálním nastavením. Capabilities typu `unknown` nejsou
podporovanou schopností. `R3ErrorCode` je uzavřený enum A1.

Snapshot ukazuje aktivní, jinak poslední běh chatu. Starší zpráva vede přes
své requestId na `run.inspect`; tím lze otevřít její vlastní aktivitu,
kontroly a sadu změn, aniž by se přepnul nebo zastavil nynější běh.
`run.activity` stránkuje úplnou bezpečnou historii konkrétního běhu po 100
událostech. Výběr historického detailu nemění cíl globálního Stop.

R3VerificationView je backendový pohled, ne změna R2RunResult schema.
`partially_verified` vyžaduje úspěšný aktuální relevantní důkaz pro vymezenou
podmnožinu změn a výčet nepokrytého zbytku; v R2 výsledku odpovídá
`unverified`, nikdy `verified`. Neznámý profil nebo nerelevantní exit 0
nedává ani částečné ověření. B1 určí pokrytí, A3 uloží jeho vazbu k recordId;
C4 při čtení obnoví platnost. Nedostupná složka zachová historické records,
ale status=unverified a freshness=unavailable; historický úspěch zůstane
v checks a UI nesmí tvrdit jeho aktuální platnost.

Limity A1: task 1–16 384 znaků po trim, title 1–120; maxSteps 1–32,
výchozí 16. Posledních 100 zpráv a 100 auditních událostí ve snapshotu,
stránka historie 100. Snapshot nejvýše 1 MiB serializovaných dat;
posledních 20 command views, celkem 64 KiB output tails, zbytek po stránkách
command.output nejvýše 64 KiB. Při větší historii zachovat aktivní stav,
vrátit méně celých zpráv s beforeMessageSequence. Historie má stejný byte
limit a vždy alespoň jednu zprávu; jednotlivá zpráva nepřekračuje modelový
limit 64 KiB. Auditní view detaily nejvýše 4 KiB na položku,
bez plných souborů/raw event payloadů; ořez má detailsTruncated=true.
Run detail a stránka auditu mají také limit 1 MiB. Pokud už zprávy/detail
nevejdou do limitu, stránkovat; nikdy nevynechat aktivní permission, důvod
recovery nebo stav zastavování. Permission vstup se nezkracuje tak, aby
uživatel schválil jiný než skutečný příkaz.
R3 před vytvořením permission odmítne command vstup nad 64 KiB
serializovaného UTF-8 (včetně reason/impact); neusekne jej do jiné akce.
Každá IPC request zpráva má celkový limit 128 KiB. Limity a jejich chyby
se testují i na ne-ASCII textu, nestačí počítání JavaScript znaků.
Stream queue nejvýše 256 událostí nebo 1 MiB;
jedna dávka textu nejvýše 4 KiB, flush po 50 ms nebo před změnou stavu.
Modelový limit 64 KiB na tah z R2 zůstává; 1 MiB textových odpovědí
na desktopový běh, pak řízená chyba bez dokončení. Command output zachová
256 KiB dohromady pro stdout/stderr, řádka worker protokolu nejvýše
384 KiB kvůli výslednému base64, parser buffer nejvýše 512 KiB.
Kurzor je monotónní integer per chat; záznamy tvoří čtecí projekci,
ne novou workspaceRevision. Ukládat posledních 1 024 updatů per chat,
starší historii lze vždy číst ze zpráv/auditu. UI pouze potvrzené dávky,
žádný další nezajištěný živý kanál se samostatným pořadím.

## Mapování souborů a odpovědností

| Část | Nové cesty a jejich úloha; existující integrační soubory |
| --- | --- |
| A | shared/src/r3-{chat,project,stream,ipc,settings,changes,verification}.ts; backend/core/src/desktop/{ports,chat-service}.ts; backend/infrastructure/src/persistence/{r3-chat-migration,r3-projection-migration,sqlite-chat-store,sqlite-desktop-request-store,sqlite-desktop-projection-store}.ts; upravit migrations.ts |
| B | backend/core/src/desktop/{run-manager,project-service,permission-broker,stream-batcher}.ts; backend/core/src/verification/reference-verification-policy.ts; backend/infrastructure/src/create-r3-infrastructure.ts; process/{r2-command-protocol,owned-command-recovery}.ts; upravit loop, collector, process runner/worker/job a create-r2-infrastructure.ts |
| C | core/src/secrets/{ports,provider-settings-service}.ts; infrastructure/src/secrets/encrypted-secret-store.ts; desktop/src/secrets/electron-secret-protector.ts; desktop/src/ipc/{r3-handler,register-r3-handlers,r3-subscriptions}.ts; desktop/src/runtime/node-runtime.ts; upravit main, preload, composition-root |
| D | desktop/src/renderer/{app.tsx,api.ts,state,components,styles,assets}; návrhové varianty v docs/design/r3; upravit TSX/Webpack/Forge/CSP a DOM test project |
| E | tests/desktop, tests/packaged/r3-smoke.test.ts, desktop/src/smoke/run-r3-smoke.ts; scripts/verify-{r3,packaged-r3}.mjs; docs/r3-{acceptance,author-checklist}.md, docs/architecture/r3-desktop.md |

Složené zápisy v tabulce jsou mapa; přesné jednotlivé cesty jsou v úkolech.
Sdílené exports, dependency pravidla a test config se mění v úkolu,
který jejich změnu potřebuje, nikoli v samostatném netestovatelném scaffoldu.

## Testovací a commit postup

Každý úkol: červený test → potvrdit jeho smysluplné selhání → nejmenší
implementace → zelený cílený test → zkontrolovat diff a přesně stageovat.
Ukázky assertů určují očekávané chování, ne zavedení helperů s neznámým
obsahem. Test sestaví produkční službu z Interfaces úkolu nad reálnou
dočasnou SQLite/Git fixture; model double je dovolen pouze na modelové hranici.

Po každé části: npm.cmd run typecheck, npm.cmd run lint,
npm.cmd run check:deps, npm.cmd test a git -c
safe.directory=E:/kodovani/projekty/Codryn diff --check. Před commitem
git diff --cached --name-only a git diff --cached --check; žádné git add .
Budoucí commit hranice uvedené v úkolech nejsou žádostí o nynější commit.

## Pokrytí specifikace

| Spec / PRD | Úkoly |
| --- | --- |
| §1–2 rozsah, model, limity a historie; FR-CHAT | A1/A2/B1/C3/D1/D3 |
| §3 izolace a stávající jádro; FR-DESK-02 | B1/C4/E1 |
| §4 atomicita, stream, kurzory, procesní výstup; §12.2, FR-TERM-01 | A2/A3/B2/B3/C4/D1 |
| §5 oprávnění, jeden běh, zrušení a obnova; AC-O1-11/16 | B1/B4/C4/D3/E1/E2 |
| §6 trvalé klíče; FR-LLM-06/07/09/13 a lokální AC-SF-07 | C1/C2/C3/D4/E2 |
| §7 diff, verifikace, všechny stavy, klávesnice, vzhled; AC-O1-15/24 | C4/D2/D3/D4/E1/E3 |
| §8–10 důkazy, autor, návaznost R4 | E1/E2/E3 |

## Kontrola při sepsání

Všechny A1–E3 jsou plánované, nikoli provedené. Kontrola při sepsání zahrnuje
existující integrační cesty, odkazy mezi díly, shodu podpisů, návaznost
migrací, smysl testů a úplnost návrhových rozhodnutí.
Konkrétní nové runtime mechanismy dokazují až jejich implementační testy.

Původní kontrola při sepsání ověřovala strukturu a odkazy; nebyla důkazem
věcné úplnosti. Preventivní revize doplnila konkrétní chybějící kontrakty,
bezpečnostní kroky a regresní scénáře. Její rozsah a skutečně provedené
kontroly jsou v [auditním záznamu](2026-10-11-r3-plan-review.md).
Všech 18 úkolů / 90 kroků zůstává budoucí prací. Žádné tvrzení o správné
implementaci R3 neplyne z kontroly Markdownu ani ze zelených kontrol R2.
