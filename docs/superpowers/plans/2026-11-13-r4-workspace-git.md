# R4 Workspace State and Local Git Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Každý zápis vychází z aktuálního souboru, výsledek ověření se po relevantní změně přestane tvářit jako platný a uživatel může bezpečně prohlížet a explicitně měnit lokální Git stav v desktopu.

**Architecture:** Backend udržuje monotónní revizi workspace a vedle ní hash dotčeného souboru. Mutace procházejí úzkou revizní kontrolou a auditní událostí. Jedna Git služba dodává snapshot panelu i provádí stavové akce; před každou akcí pod zámkem konkrétního worktree/ref znovu zkontroluje HEAD, branch, index a relevantní pracovní strom. Renderer používá validované IPC a po externí změně zahodí starý snapshot.

**Tech Stack:** TypeScript, Zod, SQLite, nainstalovaný Git CLI přes `execFile`, Electron/React, Vitest a Git fixture.

**Spec:** `PRD_v1.1.md` `FR-COORD-01/02/08..10/14`, `FR-VCS-01..07/09..14/16/20/21`, `AC-O1-19/20/22/23/24`; `docs/product/ROADMAP.md` §8; `docs/superpowers/specs/2026-11-10-r4-user-driven-alpha-design.md` §5; `docs/superpowers/specs/r4-workspace-state.md` a `docs/superpowers/specs/r4-local-git.md`. Vzdálené Git akce `FR-VCS-15/17..19` jsou S/O1 a nejsou součástí tohoto plánu.

## Global Constraints

- Zachovat stávající Git/non-Git změnový tok, obsahové snapshoty a safe return z R2/R3. Projektové hranice, přístup k Node jen v backendu, validace IPC, limity výstupu a redakce citlivých dat platí i pro nové operace. `FR-VCS-01` požaduje detekci projektu i uvnitř většího worktree; současné `ProjectGitState` vyžaduje shodný kořen, takže tento rozdíl je součástí Task 4 a nesmí se označit za hotový regresí.
- `workspaceRevision` roste při úspěšném zápisu, zjištěné ruční změně, změně HEAD/branche a dokončení serializované stavové akce. Samotná chatová zpráva ji nezvýší. Uložit čas, Git identitu a důvod změny. Před zápisem samotná globální revize nestačí: porovnává se očekávaný hash cílového souboru nebo revize podkladu.
- Každý patch včetně revertu a budoucích zapisujících aktérů používá stejný guarded writer. Při stale podkladu nesmí vzniknout částečný zápis; audit zaznamená odmítnutí a agent musí znovu načíst aktuální obsah.
- Verification record uchová druh, nástroj/příkaz, rozsah vstupů, výsledek, čas, zdrojovou relaci a workspace revizi. Platnost vyhodnotit podle zaznamenaných vstupů; nezávislá změna mimo rozsah sama nevyžaduje nový běh, ale neúplné pozorování znamená `unknown/stale`, nikdy jisté `verified`.
- Git čtecí akce nemění repozitář. Stavové akce vyžadují explicitní UI volbu nebo zvlášť povolený nástroj. Žádná akce se automaticky nespouští kvůli dokončení chatu. Commit message z modelu je jen upravitelný návrh ze staged diffu.
- Každý Git příkaz má argumenty jako pole, pevný cwd, timeout, limit výstupu a `windowsHide`; žádné shell řetězce. Git output se validuje a bezpečně omezí před IPC/auditem. Non-Git, nedostupný Git, detached HEAD a konflikt mají viditelný omezený stav.
- Resource key pro worktree/ref, lockfile/balíčkovací operaci a projektovou DB brání pouze kolizím stejného zdroje. Různé soubory lze měnit souběžně; dev server ani kolize portu nejsou důvod zastavit jiný proces.
- Automatické testy používají dočasná lokální Git repo a fake model. Historické R2/R3 důkazy se nepovažují za důkaz nových kritérií. R3 osobní přijetí zůstává samostatně otevřené.

## Review Focus

1. Externí změna souboru mezi přečtením a patch/revertem: novější obsah zůstane beze změny a vznikne audit `stale`.
2. Externí `git add` mezi zobrazením staged diffu, návrhem zprávy a commitem: commit se zastaví před zápisem a návrh se nepoužije jako důkaz aktuálního indexu.
3. Dvě stavové Git akce stejného worktree nebo ref se nespustí současně, ale editace různých souborů běží dál.
4. Externí změna HEAD/branch, konflikt, detached HEAD a non-Git režim nemohou potichu vést ke ztrátě uživatelských změn.
5. Nezávislá změna souboru mimo rozsah testu nezneplatní ověření bez důvodu; změna dotčeného vstupu, nástroje, konfigurace nebo neúplné pozorování ano.

---

### Task 0: Ověřit specifikace bezpečnostního jádra a lokálního Gitu před kódem

- [ ] **Step 1: Ověřit** existující `docs/superpowers/specs/r4-workspace-state.md` a `docs/superpowers/specs/r4-local-git.md` proti aktuálnímu kódu, `FR-COORD-01/02/08..10/14`, všem lokálním M/O1 `FR-VCS` a roadmapě §8.
- [ ] **Step 2: Uzavřít** technické rozpory před produkčním kódem a zaznamenat přijatá rozhraní v dokumentačním commitu.

---

## File Structure

| Odpovědnost | Soubor |
| --- | --- |
| Revizní a Git kontrakty | `shared/src/r4-workspace.ts`, `shared/src/r4-git.ts`, `shared/src/r3-ipc.ts`, `shared/src/index.ts` |
| Stav workspace a zámky | `backend/core/src/workspace/observe-workspace.ts`, `backend/core/src/workspace/resource-locks.ts`, `backend/infrastructure/src/persistence/sqlite-workspace-store.ts`, nová migrace pod `backend/infrastructure/src/persistence/` |
| Zápis a ověření | `backend/infrastructure/src/filesystem/windows-guarded-writer.ts`, `backend/infrastructure/src/persistence/sqlite-verification-store.ts`, `backend/infrastructure/src/persistence/sqlite-desktop-projection-store.ts`, `backend/infrastructure/src/create-r2-infrastructure.ts` |
| Git služba | `backend/core/src/git/local-git-service.ts`, `backend/infrastructure/src/git/project-git-state.ts`, `backend/infrastructure/src/git/local-git-operations.ts` |
| Desktop | `backend/infrastructure/src/create-r3-infrastructure.ts`, `apps/desktop/src/ipc/r3-handler.ts`, `apps/desktop/src/renderer/workspace.tsx`, `apps/desktop/src/renderer/components/git-panel.tsx`, `apps/desktop/src/renderer/styles.css` |
| Testy | `backend/core/test/workspace-state.test.ts`, `backend/infrastructure/test/workspace-revision.test.ts`, `backend/infrastructure/test/git-workflow.test.ts`, `backend/infrastructure/test/verification-freshness.test.ts`, `apps/desktop/test/git-panel.test.tsx`, fixture pod `tests/support/` |

### Task 1: Dokončit monotónní workspace revizi a provenienci

**Interfaces:** `WorkspaceSnapshot` vrací `revision`, `observedAt`, `gitIdentity`, `changeSource`, `complete` a fingerprint; `WorkspaceStore.advance(projectId, source, expectedRevision?, observation?)` je transakční a idempotentní podle mutation ID. Pozorovatel porovnává konkrétní obsah i Git identitu, ne pouze watch event.

- [ ] **Step 1: Napsat selhávající testy** pro první otevření, opakované pozorování bez změny, úspěšný patch, ruční změnu, změnu HEAD/branche, dokončenou Git mutaci, duplicitní mutation ID, restart a chatovou zprávu bez změny workspace.
- [ ] **Step 2: Spustit** `npx.cmd vitest run backend/core/test/workspace-state.test.ts backend/infrastructure/test/workspace-revision.test.ts`; ověřit nová selhání.
- [ ] **Step 3: Přidat** migraci čas/provenienci a transakční `advance`. Napojit R2 writer, observer a Git službu na stejnou operaci. Neúplné pozorování označit v snapshotu, ne vydávat za plný důkaz beze změn.
- [ ] **Step 4: Spustit** cílené testy; commit `feat(r4): track workspace revision and change provenance`.

### Task 2: Sjednotit stale ochranu všech patchů a ověřování

**Interfaces:** `GuardedMutation` vyžaduje `path`, `expectedHash` nebo `expectedRevision` a `actor/runId`; výsledek `applied/stale/rejected` nese audit bez obsahu. `VerificationAssessment` je `current/stale/unknown` s přesným důvodem a seznamem dotčených vstupů.

- [ ] **Step 1: Napsat selhávající testy** pro patch různých aktérů, revert, změnu po read, stejný obsah po mezitímní změně, symlink alias, partial write, paralelní různé soubory a nový obsah zachovaný při stale. Změna konfigurace testu či vstupu zneplatní záznam, nezávislá cesta nikoli.
- [ ] **Step 2: Spustit** `npx.cmd vitest run backend/infrastructure/test/workspace-revision.test.ts backend/infrastructure/test/verification-freshness.test.ts`; ověřit selhání.
- [ ] **Step 3: Vést** všechny zapisující cesty přes guarded writer a očekávaný podklad; vynutit audit odmítnutí před jakýmkoli zápisem. Agentní větev po `stale` znovu čte aktuální soubor, nikoli opakuje starý patch.
- [ ] **Step 4: Rozšířit** verification record/projekci o rozsah a provenienci; před vykreslením i dokončením běhu znovu posoudit vstupy proti aktuální revizi/obsahu. Stará DB data migrovat na `unknown`, pokud nemají potřebný rozsah.
- [ ] **Step 5: Spustit** cílené testy a fake scénář `AC-O1-23/24`; commit `feat(r4): reject stale writes and assess verification scope`.

### Task 3: Sdílené zámky pro stavové operace

**Interfaces:** `ResourceLocks.withKey(key, signal, action)` serializuje stejné kanonické worktree/ref, lockfile/balíčkovací operace a migrace jedné projektové DB; abort čekajícího požadavku uvolní frontu. Klíč jiného souboru či worktree neblokuje.

- [ ] **Step 1: Napsat selhávající concurrency test** dvou Git požadavků, externí změny indexu během čekání, dvojí změny téhož lockfilu, dvou migrací jedné DB a paralelních editací různých souborů. Ověřit pořadí událostí i uvolnění po výjimce/abortu.
- [ ] **Step 2: Spustit** `npx.cmd vitest run backend/infrastructure/test/git-workflow.test.ts backend/infrastructure/test/workspace-revision.test.ts`; ověřit selhání.
- [ ] **Step 3: Implementovat** úzký backendový zámek a napojit všechny jmenované stavové cesty. Po vstupu do zámku znovu provést preflight; zámek není náhradou kontroly externích změn.
- [ ] **Step 4: Spustit** test `AC-O1-22`; commit `feat(r4): serialize conflicting resource mutations`.

### Task 4: Čtecí Git snapshot, diff a historie

**Interfaces:** `LocalGitService.read(projectId)` vrací `snapshotId` odvozené z kanonického worktree, HEAD, branche, index hashe a relevantního stavu; branch/upstream/ahead/behind, oddělené staged/unstaged/untracked/conflict položky. `diff(snapshotId,path,side)` a `history(cursor)` znovu ověří snapshot nebo vrátí `stale`.

- [ ] **Step 1: Napsat selhávající Git fixture testy** pro projekt v podadresáři většího worktree, staged i unstaged změnu téhož souboru, nový/smazaný/přejmenovaný/konfliktní soubor, unborn/detached HEAD, chybějící upstream, non-Git a Git CLI unavailable. Historie obsahuje hash, zprávu, autora, čas, rodiče, reference a detail souborů. U podadresáře panel nesmí umožnit mutaci souboru mimo otevřený projekt bez výslovného rozšíření rozsahu.
- [ ] **Step 2: Spustit** `npx.cmd vitest run backend/infrastructure/test/git-workflow.test.ts`; ověřit selhání.
- [ ] **Step 3: Rozšířit** `ProjectGitState` na kanonický kořen projektu uvnitř worktree a přidat read-only Git službu s omezeným stránkováním/výstupem. Snapshot rozlišuje worktree root a projektový podadresář, Git příkazy používají bezpečné pathspec. `ahead/behind` počítat jen při existujícím lokálním upstream bez fetch. Při externí změně zahodit snapshot a vrátit nový stav.
- [ ] **Step 4: Přidat** validované `git.status`, `git.diff`, `git.history` IPC a panel v desktopu. Diff se váže ke konkrétní straně index/worktree. Ověřit renderer klávesnicí a prázdné/omezené stavy.
- [ ] **Step 5: Spustit** `AC-O1-19` integrační test a UI test; commit `feat(r4): show current local Git state and history`.

### Task 5: Stage, unstage a bezpečné přepnutí branche

**Interfaces:** `stage/unstage(path, expectedSnapshotId)` mění celý soubor a po zámku vrací nový snapshot. `switchBranch(target, expectedSnapshotId)` před mutací posoudí necommitnuté i aktivní agentní změny; při riziku ztráty skončí bez změny. Žádný automatický stash/reset/clean.

- [ ] **Step 1: Napsat selhávající testy** pro externí index update, rename/untracked/conflict, aktivní agentní změny, detached HEAD, dirty worktree a přepnutí na existující lokální branch. Ověřit, že stale požadavek neovlivní index/worktree.
- [ ] **Step 2: Spustit** cílené Git testy; ověřit selhání.
- [ ] **Step 3: Implementovat** operace pod worktree/ref zámkem s novým preflightem uvnitř zámku, přesným celosouborovým pathspec a auditní událostí. Přidat `git.stage`, `git.unstage`, `git.switchBranch` validované IPC a UI potvrzení při změně branche.
- [ ] **Step 4: Spustit** cílené testy a Git E2E; commit `feat(r4): guard local Git index and branch actions`.

### Task 6: Návrh commit message a explicitní commit

**Interfaces:** `suggestMessage(expectedSnapshotId)` sestaví modelový požadavek pouze ze staged diffu a povolených projektových konvencí, vrátí text a `sourceSnapshotId`; `commit(message, expectedSnapshotId)` se provede pouze po explicitním kliknutí/odeslání uživatele, s neprázdným staged obsahem a beze změny snapshotu.

- [ ] **Step 1: Napsat selhávající testy**: model nedostane unstaged diff, ignorované tajemství ani historii chatu; návrh lze upravit; externí `git add`/HEAD změna před commitem způsobí `stale`; prázdný index, konflikt a chybějící Git identita jsou bezpečně vysvětleny.
- [ ] **Step 2: Spustit** cílené Git/model testy; ověřit selhání.
- [ ] **Step 3: Implementovat** návrh přes stávající modelový adapter s omezením vstupu a redakcí. Commit pod zámkem znovu ověří celý staged snapshot a explicitní akci; nevytváří prázdný commit a zaznamená audit.
- [ ] **Step 4: Přidat** validované IPC, upravitelný návrh a samostatné tlačítko Commit. Po úspěchu obnovit Git panel a workspace revizi; při stale zachovat rozepsanou zprávu a vyžádat novou kontrolu.
- [ ] **Step 5: Spustit** `AC-O1-20` E2E a audit test; commit `feat(r4): suggest and explicitly create local commit`.

### Task 7: Integrační důkazy a regrese

- [ ] **Step 1: Spustit** `AC-O1-19/20/22/23/24` na čerstvé Git i non-Git fixture včetně externí změny indexu a souboru. Zaznamenat přesné příkazy, výstupy, čas a hash buildu. Testy nepoužívají placené API.
- [ ] **Step 2: Spustit** relevantní R2/R3 regrese, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run check:deps` a packaged smoke lokálních Git operací. Selhání opravit a opakovat dotčenou kontrolu.
- [ ] **Step 3: Zkontrolovat** diff/staging a commitnout důkazní fixture/report. Neoznačit R4 hotové jen na základě této oblasti; push/PR jen na výslovnou žádost autora.

## Self-review

- Plán pokrývá všechny lokální M/O1 `FR-VCS-09..14/16/20/21`; `FR-VCS-01..07` se znovu ověří a zjištěná mezera v podadresáři worktree se opraví v Task 4.
- Globální revize, hash souboru, Git snapshot a rozsah verification recordu mají odlišné role. Žádný starý snapshot neopravňuje zápis.
- Stavové operace mají úzký zámek, čerstvý preflight a audit; čtecí operace zůstávají neblokující.
