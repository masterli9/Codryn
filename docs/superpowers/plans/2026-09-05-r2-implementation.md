# R2 – navigace implementačního plánu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Delegaci zvolit jen při autorizovaném způsobu provedení.

**Goal:** Dodat bezpečný headless cyklus s fake i prvním skutečným modelem.
**Architecture:** Rozšířit existující core služby a verzované kontrakty. Čtyři dílčí plány oddělují zápis, návrat, procesy a finální integraci.
**Tech Stack:** Stávající npm workspaces, TypeScript, Zod, SQLite/WAL, Windows 11 a Vitest.
**Spec:** [Schválený návrh](../specs/2026-09-05-r2-change-lifecycle-design.md)

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-05-r2-change-lifecycle-design.md` (schváleno autorem v této relaci).
- Windows 11; současný repository runtime: Node `24.19.0`, npm `>=11 <12`, TypeScript `6.0.3`. Před instalací ověřit `node --version` a `npm.cmd --version`; neobcházet runtime gate.
- `RunAgentLoop` zůstává jedinou agentní smyčkou.
- R2 neslibuje izolaci libovolného shellu od souborů nebo sítě.
- Backend je zdroj pravdy; bez produktového UI, cloudu, vzdáleného Gitu a subagentních produktových funkcí.
- Migrace 0–3 a jejich checksumy se nemění. Produkční kód neimportuje `tests/support`.
- Jeden patch mění jeden existující textový soubor; UTF-8 s volitelným BOM, původní konce řádků, nejvýše 1 MiB před i po změně.
- Model ani CLI nesmí zadat vlastní runId, projectId nebo obnovený obsah pro privilegovanou operaci. Tyto identity doplní backend.
- Dokončovací důkaz vychází ze skutečných výsledků, ne z textu modelu. Fake a live brána jsou oddělené.
- Každý úkol končí testem, kontrolou diffu a samostatným commitem pouze jeho souborů. Push/PR vyžadují explicitní zadání.
- Nezasahovat do `Dokumentace příklady/`. Fixture a uživatelská data držet mimo skutečný uživatelův projekt.
- Všechny uvedené příkazy běží z kořene Codrynu. Na Windows používat `npm.cmd`; test runner má limit 15 s, host testy explicitně 30 s, celé gate procesy nejvýše 10 minut.
- Příkazy v tomto dokumentu jsou budoucí kroky implementace; při psaní plánu se nespouštěly.


## Pořadí a stav

Původní dokument vznikl jako plán, ale implementace nyní probíhá na pracovní
větvi `docs/r2-change-lifecycle`. Lokální části W1–W5, D1–D3, P1–P5 a M1–M3
jsou implementované; M4/M5 mají offline kontrakty, bounded runner, local
verify a packaged smoke přípravu. Živý provider a čistý packaged důkaz jsou
stále otevřené acceptance brány. Podrobná checkbox historie níže zůstává
implementačním checklistem; aktuální pravdivý stav je v `docs/r2-acceptance.md`.
Před další změnou ověřit aktuální stav branche a diff. Historický výchozí
commit aplikace je `ae6cb49`; návrhový commit je `e17ed8f`.

| Plán | Úkoly | Vstup | Výstup |
| --- | --- | --- | --- |
| [R2.1 – zápis](2026-09-05-r2-1-safe-write.md) | W1–W5 | Integrované R1 | Hashový patch, záměr, recovery, zápisový tool |
| [R2.2 – návrat](2026-09-05-r2-2-diff-return.md) | D1–D3 | W1–W5 | Git baseline, vlastní diff a vratné operace |
| [R2.3 – procesy](2026-09-05-r2-3-permission-verification.md) | P1–P5 | W1–W5; P1 lze provést první | Oprávnění, proces, revize, verification |
| [R2.4 – integrace/model](2026-09-05-r2-4-model-acceptance.md) | M1–M5 | D1–D3 a P1–P5 | Úplná fake sada, eval, live 4/5, handoff |

W1 a P1 jsou experimentální brány s přesným protokolem a výsledkem pass/fail.
Žádný pozdější úkol nesmí předpokládat jejich úspěch. Zápisové a procesní
backendy se implementují až po doložení jejich mechanismu; neúspěch znamená
technickou revizi, nikoli vypuštění ochrany. Volba modelu vzniká v M3/M4,
nikoli dosazením historického názvu. Klíč a povolený nákladový strop se řeší
až před živým spuštěním, ne před implementací lokálních částí.

## Zjištěné integrační body R1

- `backend/core/src/agent/run-agent-loop.ts` vytváří request jen s
  `previousToolResults`; M1 doplní pořadovou historii a odliší R1/R2 výsledek.
- `backend/core/src/agent/model-response-collector.ts` odmítá kombinaci textu
  a tool callů. M1 doplní společnou odpověď s komentářem bez spuštění
  neukončeného streamu.
- `backend/core/src/tools/tool-registry.ts` zná pouze `read_project` a
  handler bez identity běhu. W5 zavede backendový execution context.
- `backend/core/src/tools/tool-execution-harness.ts` persistuje argumenty
  před validací. W5 přesune bezpečnou projekci před první zápis.
- `shared/src/r1-agent.ts` připouští jen výsledek `not_applicable`.
  P5/M1 přidají samostatný verzovaný R2 výstup; R1 kontrakt zůstane čitelný.
- Migrace 2 omezuje chyby a permission result pomocí SQL CHECK. W3/P2
  rozšíří data novými migracemi a otestují zachování R0/R1.
- `vitest.config.ts` má sériový projekt `host-integration`. Nové testy
  skutečných Windows procesů a Git fixture se musí přidat právě tam.

## Společné kontrakty mezi plány

Typy jsou návrh nového kódu, nikoli tvrzení o existujícím exportu.
Serializované vstupy mají striktní Zod schémata a UUID přes existující
`uuidSchema`. Níže `string` u ID znamená validované UUID.

```ts
// backend/core/src/changes/ports.ts — vlastní W2/W3/W4
export interface ChangeActor {
  projectId: string; runId: string; callId: string;
}
export interface PatchInput {
  path: string; expectedHash: string;
  edits: readonly { oldText: string; newText: string }[];
}
export interface ChangeEntry extends ChangeActor {
  id: string; setId: string; sequence: number; path: string;
  beforeHash: string; afterHash: string;
  beforeBlob: string; afterBlob: string;
  kind: 'patch' | 'revert'; reversesId: string | null;
}
export type MutationResult =
  | { status: 'applied'; entry: ChangeEntry; revision: number }
  | { status: 'rejected'; code: string }
  | { status: 'recovery_required'; operationId: string };

export interface WriteIntent {
  operationId: string; entry: ChangeEntry;
  state: 'prepared' | 'applied' | 'not_applied' | 'conflicted';
}
export interface MutationJournal {
  prepare(intent: WriteIntent): Promise<void>;
  confirm(operationId: string): Promise<number>;
  resolve(operationId: string, state: 'not_applied' | 'conflicted'): Promise<void>;
  pending(projectId: string): Promise<readonly WriteIntent[]>;
  entries(setId: string): Promise<readonly ChangeEntry[]>;
}
export interface BlobStore {
  put(bytes: Uint8Array): Promise<string>;
  get(hash: string): Promise<Uint8Array>;
}
export interface GuardedFile {
  readonly bytes: Uint8Array;
  publish(bytes: Uint8Array): Promise<void>;
  close(): Promise<void>;
}
export interface GuardedWriter {
  open(path: string, expectedHash: string, signal: AbortSignal): Promise<GuardedFile>;
}
export interface FileHashReader {
  readHash(path: string, signal: AbortSignal): Promise<string | null>;
}
```

`GuardedWriter` je svázán s kanonickým kořenem při konstrukci. W1 musí
prokázat, že životnost guardu chrání identitu a obsah při publikování.
`publish` po nejistém výsledku vyvolá recovery, nikoli další zápis.
`BlobStore` přijímá jen obsah validovaného necitlivého cíle.

```ts
// backend/core/src/workspace/ports.ts — W3 a P4
export interface WorkspaceObservation {
  fingerprint: string;
  gitIdentity: string | null;
  complete: boolean;
}
export interface WorkspaceSnapshot extends WorkspaceObservation {
  revision: number;
}
export interface WorkspaceObserver {
  inspect(signal: AbortSignal): Promise<WorkspaceObservation>;
}
export interface WorkspaceStore {
  observe(projectId: string, observation: WorkspaceObservation): Promise<WorkspaceSnapshot>;
  current(projectId: string): Promise<WorkspaceSnapshot>;
}
export interface Lease {
  key: string; owner: string; fence: number; expiresAt: number;
}
export interface LeaseStore {
  acquire(key: string, owner: string, now: number): Promise<Lease | null>;
  renew(lease: Lease, now: number): Promise<Lease | null>;
  release(lease: Lease): Promise<boolean>;
  markEffect(lease: Lease, active: boolean): Promise<boolean>;
}
```

Lease má délku 30 s a obnovu po 5 s. `fence` je monotónní token vlastnictví;
starý vlastník jej nesmí použít k potvrzení nové operace. Expirace sama
neopravňuje převzetí stále působícího externího procesu. Automatické
převzetí používá jen zdroj s prokázaným koncem předchozího účinku.

## Společný testovací a commit postup

Každý úkol obsahuje minimální červený test (očekávané selhání před změnou),
implementační jádro a další povinné scénáře. Testové ukázky používají Vitest
`test`, `expect`; importovat je z `vitest`. Pomocné funkce mají definici
nebo přesný kontrakt v úkolu, který je vytváří. Při přesunu exportu aktualizovat
příslušné `src/index.ts` a všechny jeho čtenáře v témže commitu.

Po každém dílčím plánu:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run check:deps
npm.cmd test
git -c safe.directory=E:/kodovani/projekty/Codryn diff --check
```

Staging: přesné cesty uvedené v úkolu; žádné `git add .`. Před commitem:
`git diff --cached --name-only` a `git diff --cached --check`.
Úspěch jedné části neopravňuje označit R2 za hotové.

## Pokrytí schválené specifikace

| Spec | Úkoly | Důkaz |
| --- | --- | --- |
| §1–3 hranice, společné jádro | W5, M1, M2 | CLI boundary + R1 regrese |
| §4 hash/atomické publikování | W1, W2, W4 | soutěž externích editorů, stale a text matrix |
| §5 recovery a data | W3, W4, D3, M2 | fault injection, restart, migrační fixture |
| §6 Git/diff/return | D1–D3 | index beze změny, vlastní diff, konfliktní návrat |
| §7 revize a ověření | W3, P4, P5 | external/ABA/overflow invalidace |
| §8 oprávnění a procesy | W5, P1–P3 | deny/no-spawn, replay, kill-tree, redakce |
| §9 provider | M1, M3, M4 | kontrakt, eval, skutečné 4/5 |
| §10–11 gate a autor | M2, M5 | 10/10 obou režimů, balení, traceability, checklist |

AC-O1-11 je v R2 pouze backendový podklad; skutečný restart rendereru patří
R3. R2 nedokládá UI kritéria ani celé AC-O1-27 pro TypeScript/repo mapu.
Povinné ochrany kontextu před prvním live odesláním popisuje M3.

## Kontrola plánu před předáním

- [x] W1–W5, D1–D3, P1–P5 a M1–M5 mají soubory, kontrakty, testy a commit hranici.
- [x] Nové názvy mezi dokumenty odpovídají společným kontraktům.
- [x] Všechny experimentální brány definují i negativní výsledek a zakázaný fallback.
- [x] Lokální dokumentační odkazy existují, nové implementační cesty jsou označeny.
- [x] Návrh je označen schváleným a implementační evidence je vedena odděleně v acceptance dokumentu.
- [x] Dokumentační diff prošel kontrolou; staging je omezen na plánovací dokumenty.

Kontrola při sepsání: 5 dokumentů, 18 úkolů, 90 kroků, 44 syntakticky
validních TS/JS bloků a 13 existujících lokálních odkazů. Pět SQL bloků
prošlo syntaktickým spuštěním v paměťové SQLite nad schématem R0/R1
s vypnutými foreign keys pro tento syntaktický experiment. Není to
ověření migračního postupu, referenční integrity, TypeScript typů ani
runtime chování navržené implementace; tyto kontroly patří do úkolů plánu.
