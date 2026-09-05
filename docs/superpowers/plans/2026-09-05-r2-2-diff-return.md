# R2.2 – diff a bezpečný návrat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rozlišit vlastní změny a vrátit je bez přepsání novější práce v Git i non-Git projektu.
**Architecture:** Git pouze pozoruje stav. Obsahový diff a návrat vycházejí z journalu R2.1; návrat je nová auditovaná mutace.
**Tech Stack:** TypeScript, systémový Git CLI, SQLite, Vitest.
**Spec:** [R2 návrh](../specs/2026-09-05-r2-change-lifecycle-design.md), §6.
**Společné kontrakty:** [R2 index](2026-09-05-r2-implementation.md).

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


## D1: Zachytit Git/non-Git baseline bez změny indexu

**Files – vytvořit:** `backend/core/src/changes/project-baseline.ts`,
`backend/infrastructure/src/git/project-git-state.ts`,
`backend/infrastructure/src/persistence/r2-baseline-migration.ts`,
`backend/infrastructure/src/persistence/sqlite-project-baseline-store.ts`,
`backend/infrastructure/test/project-git-state.test.ts`,
`tests/support/src/r2-project.ts`.
**Upravit:** migrace registry (verze 5), exporty infrastructure/test support,
`vitest.config.ts`.
**Consumes:** W3 workspace ID, systémový Git.
**Produces:** níže uvedené kontrakty. Fixture helper:
`createR2Project(mode: 'git' | 'non-git'): Promise<{root: string;
userData: string; close(): Promise<void>}>`. Vytvoří izolovaný projekt,
volitelně lokální Git s testovou identitou a jedním commitem. Nedotkne se
globální Git konfigurace ani sítě.

```ts
export type ProjectBaseline =
  | { mode: 'non-git'; reason: 'not_repository' | 'git_unavailable' }
  | { mode: 'git'; head: string | null; branch: string | null;
      indexHash: string; status: readonly { path: string; xy: string }[];
      conflicts: readonly string[]; worktreeIdentity: string };
export interface ProjectGitState {
  inspect(signal: AbortSignal): Promise<ProjectBaseline>;
}
export interface ProjectBaselineStore {
  saveOnce(setId: string, baseline: ProjectBaseline): Promise<void>;
  get(setId: string): Promise<ProjectBaseline>;
}
```

- [ ] **1. Přidat červený test neporušeného indexu.**

```ts
import { createR2Project } from '@codryn/test-support';
import { ProjectGitState } from '../src/git/project-git-state.js';
test('observing a dirty repository does not modify its index', async () => {
  const f = await createR2Project('git');
  try {
    const git = new ProjectGitState(f.root);
    const first = await git.inspect(new AbortController().signal);
    const next = await git.inspect(new AbortController().signal);
    expect(first.mode).toBe('git');
    expect(next).toEqual(first);
  } finally { await f.close(); }
});
```

  Rozšířit tentýž test o staged a unstaged editaci stejného souboru;
  obsah indexu porovnat bajtově před i po, nespoléhat jen na object equality.
- [ ] **2. Spustit** `npm.cmd test -- backend/infrastructure/test/project-git-state.test.ts`.
  Před implementací FAIL.
- [ ] **3. Implementovat read-only Git runner.**

```ts
// Přesný seznam read-only dotazů; každý spawn shell:false, cwd=kanonický root.
const queries = [
  ['rev-parse', '--show-toplevel'],
  ['rev-parse', '--verify', 'HEAD'],
  ['symbolic-ref', '--quiet', '--short', 'HEAD'],
  ['status', '--porcelain=v1', '-z', '--untracked-files=all']
];
```

  Použít `GIT_OPTIONAL_LOCKS=0`, `GIT_TERMINAL_PROMPT=0`, timeout 5 s
  na dotaz a 1 MiB output. Žádný shell string a žádné credential čtení.
  Parser `-z` rozlišuje rename dvojici, neštěpí názvy podle whitespace.
  Index hash počítat nad skutečným indexem určeným Gitem, i ve worktree.
  Při změně identity nebo indexu mezi dotazy vrátit chybu
  `R2_GIT_SNAPSHOT_UNSTABLE`; jedno omezené opakování, nikoli nekonečný loop.
  Chybějící Git a ne-repozitář jsou odlišné důvody non-git; permission/timeout
  nesmí být tiše zaměněny za čistý Git stav.
  Detached HEAD je Git s branch=null, unborn branch má head=null.
  Konfliktní cílový soubor je zakázán k editaci v W4 preflightu.
  Baseline se uloží před prvním zápisem, nikdy se nepřepisuje.

```sql
CREATE TABLE project_baselines (
  set_id TEXT PRIMARY KEY REFERENCES change_sets(id),
  baseline_json TEXT NOT NULL CHECK(json_valid(baseline_json))
) STRICT;
```

- [ ] **4. Doplnit matrix:** non-git, chybějící Git, unborn, detached,
  merge conflict, mezery/Unicode/newline v názvu, nested projekt v worktree,
  staged+unstaged, externí změna HEAD během dotazu. Migrační test v4→v5
  zachová journal. Test do sériového host projektu.
- [ ] **5. Commit:** `feat(r2): capture immutable Git and non-Git baselines`.

## D2: Vlastní diff z obnovovacích obsahů

**Files – vytvořit:** `shared/src/r2-diff.ts`, `shared/test/r2-diff.test.ts`,
`backend/core/src/changes/get-change-diff.ts`,
`backend/core/test/get-change-diff.test.ts`.
**Upravit:** exporty shared/core.
**Consumes:** `MutationJournal.entries`, `BlobStore.get`, `FileHashReader`, D1 baseline.
**Produces:** `buildFileDiff(path: string, before: string, after: string, beforeHash: string, afterHash: string):
FileDiff`; `GetChangeDiff.execute(setId: string, signal: AbortSignal): Promise<readonly FileDiff[]>`.

```ts
export interface FileDiff {
  path: string; beforeHash: string; afterHash: string;
  status: 'changed' | 'reverted' | 'conflicted';
  lines: readonly { kind: 'context' | 'removed' | 'added'; text: string }[];
  truncated: boolean;
}
```

- [ ] **1. Přidat test izolace agentního rozsahu.**

```ts
import { buildFileDiff } from '../src/changes/get-change-diff.js';
test('pre-existing user text is context, not an agent addition', () => {
  const d = buildFileDiff('src/a.ts', '// user\nconst a = 1;\n',
    '// user\nconst a = 2;\n', 'a'.repeat(64), 'b'.repeat(64));
  expect(d.lines).toContainEqual({ kind: 'context', text: '// user' });
  expect(d.lines).toContainEqual({ kind: 'removed', text: 'const a = 1;' });
  expect(d.lines).toContainEqual({ kind: 'added', text: 'const a = 2;' });
  expect(d.truncated).toBe(false);
});
```

- [ ] **2. Spustit** `npm.cmd test -- backend/core/test/get-change-diff.test.ts shared/test/r2-diff.test.ts`.
- [ ] **3. Implementovat omezený line diff.** První verze nepotřebuje
  nejkratší Myers diff. Zachová společný prefix a suffix, prostředek ukáže
  jako removed/added. Lineární čas, žádná kvadratická matice nad 1 MiB.

```ts
const left = before.split('\n');
const right = after.split('\n');
let prefix = 0;
while (prefix < left.length && prefix < right.length &&
  left[prefix] === right[prefix]) prefix++;
let suffix = 0;
while (suffix < left.length - prefix && suffix < right.length - prefix &&
  left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix++;
```

  Tento blok patří dovnitř `buildFileDiff`; `before`/`after` jsou jeho
  parametry. Vytvořit context/removed/added prostředek a maximálně 3 řádky
  kontextu na hranici. Prázdný závěrečný token reprezentuje trailing newline;
  nesmí zmizet změna konce souboru. Service předá beforeHash/afterHash
  zaznamenané v entry po ověření blobů; čistý helper je vloží do FileDiff.
  Prázdné nebo nesprávné hashe DTO schema odmítá. Hash se vztahuje
  k původním bajtům, nikoli k normalizovaným řádkům diffu.

  Seskupení: pro soubor nejstarší applied before a poslední aktivní after.
  Pokud obsahové řetězení nesedí, stav conflicted; nekreslit ruční mezikrok
  jako agentní změnu. Před vrácením výsledku porovnat aktuální readHash
  s posledním agentním afterHash; při neshodě označit conflicted, ale
  zobrazit zaznamenaný vlastní diff. Chyba pozorování vrací neověřenou
  dostupnost diffu jako strukturovanou chybu, nikoli čistý stav.
  Limit 64 KiB výsledku/1000 řádků, `truncated=true`;
  podkladové bloby zůstávají úplné. Diff se neposílá modelu automaticky.
- [ ] **4. Doplnit testy:** dvě změny stejného souboru, plný návrat,
  konflikt po ruční editaci, CRLF, BOM, prázdný soubor, newline-only,
  nadlimitní diff. Testovat stejný výstup Git/non-Git a hash shodu blobů.
- [ ] **5. Commit:** `feat(r2): expose agent-owned content diffs`.

## D3: Návrat jednotlivé změny a celé relace

**Files – vytvořit:** `backend/core/src/changes/revert-changes.ts`,
`backend/core/test/revert-changes.test.ts`,
`backend/infrastructure/test/revert-changes.integration.test.ts`.
**Upravit:** `backend/core/src/changes/change-set-store.ts`,
`backend/infrastructure/src/persistence/sqlite-change-set-store.ts`,
`backend/core/src/state/change-set.ts`, W4 společný mutační
service (extrahovat do `backend/core/src/changes/publish-mutation.ts`),
exporty, `vitest.config.ts`.
**Consumes:** W4 guard/journal/blob, D1 baseline.
**Produces:** `RevertChanges.execute(input: {setId: string; entryId?: string;
requestId: string}, signal: AbortSignal): Promise<RevertResult>`.
`RevertResult = {status: 'reverted' | 'conflicted' | 'recovery_required';
revertedIds: readonly string[]; blockedIds: readonly string[]}`.
`returnOrder(entries: readonly ChangeEntry[]): readonly ChangeEntry[]`.

- [ ] **1. Přidat pořadový a konfliktní test.**

```ts
import { returnOrder } from '../src/changes/revert-changes.js';
test('revert processes newest changes first', () => {
  const actor = { projectId: 'p', runId: 'r', callId: 'c' };
  const entry = (id: string, sequence: number) => ({
    ...actor, id, sequence, setId: 's', path: 'a.ts',
    beforeHash: 'a', afterHash: 'b', beforeBlob: 'a', afterBlob: 'b',
    kind: 'patch' as const, reversesId: null
  });
  expect(returnOrder([entry('old', 1), entry('new', 2)]).map(e => e.id))
    .toEqual(['new', 'old']);
});
```

  Test s fake guardem vrací jiné bytes/hash při ruční editaci; očekává
  `conflicted`, publish count=0 a přesně zachovaný uživatelský obsah.
  Testové zkrácené ID výše používá čistá funkce, nevkládat je do DB.
- [ ] **2. Spustit** `npm.cmd test -- backend/core/test/revert-changes.test.ts`.
- [ ] **3. Implementovat reverzní operaci přes stejný publish service.**

```ts
export function returnOrder(entries: readonly ChangeEntry[]) {
  return [...entries].sort((a, b) => b.sequence - a.sequence);
}
// Reverzní entry pro kontrolovaný publish:
const inverse = {
  ...original, id: ids.next(), sequence: await nextSequence(),
  beforeHash: original.afterHash, afterHash: original.beforeHash,
  beforeBlob: original.afterBlob, afterBlob: original.beforeBlob,
  kind: 'revert' as const, reversesId: original.id
};
```

  Druhý blok patří do execute, kde original je journal entry, ids a
  nextSequence jsou stejné injekce jako W4. Pro uživatelský návrat vytvořit
  backendový auditovaný call `change.revert@1` s novým callId pod původním
  runId; nefalšovat původní patch call. requestId+setId zajistí idempotenci
  vstupu; completed agent run se znovu nepřepíná do running.
  Uživatel smí žádat jen změny otevřeného projektu; model nedostane restore tool.

  Rozšířit W3 `ChangeSetStore` o:
  `seal(setId): Promise<void>`,
  `transition(setId, from: ChangeSetState, to: ChangeSetState): Promise<void>`.
  R2.1 otevře set, M1 jej při konci zapečetí. Návrat otevřeného běhu není
  podporován: nejprve potvrzené zastavení/zapečetění, žádný souběžný agentní
  zápis. Částečný návrat jednotlivé entry ponechá set sealed, pokud zůstávají
  aktivní změny; graph dovolí reverting→sealed pro úspěšný dílčí návrat.
  Celá relace přechází reverting→reverted až po jejich návratu;
  při prvním konfliktu zastaví zbytek a vrátí přesný seznam.

  Preflight všech vybraných souborů; guard přesto znovu kontroluje každý
  vlastní zápis. Pád mezi soubory může zanechat doložený částečný návrat,
  nikoli ztratit audit. Opakování nepřevrací již vrácenou změnu.
  Přidat unique kontrolu jediné applied reverze entry; prepared recovery
  musí být vyřešena před novým pokusem.
- [ ] **4. Integrační matrix:** Git dirty+staged obsah zachován, non-Git,
  návrat A→B→C zpět na A, pokus vrátit A→B při aktivním B→C odmítnut,
  pozdější ruční změna, pád po publikování reverze, duplicitní request,
  stop u druhého souboru a doložený první návrat.
  Porovnat index i celý původní text bajtově.
- [ ] **5. Společné gate a commit:** `feat(r2): safely revert recorded changes`.

## Výstup R2.2

Diff je odvozený z vlastní provenience, snapshot existuje v obou režimech,
novější ruční změna se zachová i za cenu odmítnutého návratu. Nevzniká žádný
automatický Git commit, reset, checkout ani stage.
