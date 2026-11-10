# R4 Chat Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Další vlastní zadání ve stejném projektovém chatu použije omezenou, dohledatelnou historii dokončených výměn a naváže na ni v reálném modelovém režimu.

**Architecture:** SQLite čte kandidátní dvojice zpráv výhradně z aktuálního chatu před právě přijatou zprávou. Čistá funkce v `backend/core` vybere omezený souvislý konec historie. Orchestrátor zaznamená metadata výběru; modelový kontrakt drží předchozí konverzaci odděleně od historie nástrojů v aktuálním běhu. OpenAI adapter pošle předchozí zprávy v chronologickém pořadí před novým promptem. UI ukáže počet použitých zpráv a zkrácení přes existující aktivitu.

**Tech Stack:** TypeScript 6, Zod, Node SQLite, Vitest, Electron/React, OpenAI Responses adapter.

**Spec:** `docs/superpowers/specs/2026-11-10-r4-user-driven-alpha-design.md` §1; `PRD_v1.1.md` `FR-CHAT-06`, `FR-CTX-01/02`, `FR-LLM-03`; `PROJECT_CONTEXT.md` směr R4.

## Global Constraints

- Zachovat Windows 11, Node.js `24.19.0`, npm `>=11 <12` a existující hranice `apps/desktop`, `backend/core`, `backend/infrastructure`, `shared`, `tests/support`.
- Backend je zdroj pravdy; renderer nemá Node API. Nové vstupy přes hranice jsou validované a audit nesmí obsahovat text historie, API klíč ani obsah souborů.
- Zahrnout nejvýše 8 posledních souvislých dokončených dvojic (nejvýše 16 zpráv) a nejvýše 32 KiB jejich UTF-8 textu. Při příliš velké poslední dvojici nepoužít žádnou a ukázat důvod.
- Číst pouze dokončené běhy téhož chatu; vyloučit aktuální request, selhání, přerušení, průběžné komentáře a staré výstupy nástrojů. Projektové soubory se při novém běhu znovu čtou podle aktuálních pravidel.
- Demo fixture zůstává offline regresí. Živé API volat pouze v samostatném rozpočtovaném eval průchodu, ne v běžných automatických testech.
- Před implementací obnovit pracovní závislosti podle lockfile: v této kopii chybí `react` a `playwright`, takže výchozí `npm.cmd run typecheck` nyní selhává. Neoznačovat toto selhání za regresi R4.

## Review Focus

1. Dvě současně uložené zprávy v různých chatech stejného projektu: druhý chat nesmí vidět první; test v úkolu 2.
2. Poslední dvojice přes 32 KiB: žádná historie nesmí být poslána a audit uvede `oversized_latest`; test v úkolu 1.
3. Odpověď streamovaná před pádem aplikace: nesmí se po restartu vydávat za dokončenou minulou odpověď; test v úkolu 2.
4. Retry po neúspěšném běhu: neúspěšná dvojice se nesmí objevit v kontextu, úspěšný nový pokus může; test v úkolu 2.
5. Předchozí odpověď zmiňuje starou podobu souboru: model musí dostat označení minulého rozhovoru, bez starých tool výsledků; test v úkolu 4.

---

## File Structure

| Odpovědnost | Soubor |
| --- | --- |
| Výběr omezené historie a auditní souhrn | `backend/core/src/desktop/conversation-context.ts` |
| Port pro čtení kandidátů | `backend/core/src/desktop/ports.ts` |
| Čtení uložených dokončených dvojic | `backend/infrastructure/src/persistence/sqlite-conversation-reader.ts` |
| Předání výběru do běhu a audit | `backend/infrastructure/src/model/r3-runtime-factory.ts`, `backend/infrastructure/src/create-r2-infrastructure.ts`, `backend/core/src/agent/run-agent-loop.ts` |
| Modelový kontrakt a OpenAI pořadí zpráv | `shared/src/model-contract.ts`, `backend/infrastructure/src/model/openai-responses-adapter.ts` |
| Zobrazení auditního výsledku | `backend/infrastructure/src/persistence/sqlite-desktop-projection-store.ts`, `apps/desktop/src/renderer/components/composer.tsx` |

### Task 1: Bounded conversation selection

**Files:** Create `backend/core/src/desktop/conversation-context.ts`; modify `backend/core/src/index.ts`; test `backend/core/test/conversation-context.test.ts`.

**Interfaces:**
- Produce `ConversationPair = { user: { id: Uuid; text: string }; assistant: { id: Uuid; text: string } }` in newest-first order from the reader.
- Produce `selectConversationContext(pairs: readonly ConversationPair[]): ConversationSelection` where `ConversationSelection` holds chronological `messages: readonly { role: 'user'|'assistant'; text: string }[]`, `messageIds: readonly Uuid[]`, `byteLength: number`, `truncated: boolean`, and `reason: 'none'|'count_limit'|'byte_limit'|'oversized_latest'`.

- [ ] **Step 1: Write failing tests.** Assert chronological roles, 8-pair and 32 KiB UTF-8 limits, contiguous suffix, multibyte characters, and `oversized_latest` returning zero messages.
- [ ] **Step 2: Run** `npx.cmd vitest run backend/core/test/conversation-context.test.ts`; expect failures for missing export.
- [ ] **Step 3: Implement** `selectConversationContext(pairs: readonly ConversationPair[]): ConversationSelection` with one deterministic pass from newest to oldest; stop on first pair that exceeds the remaining budget. Reject malformed or duplicate IDs before selection.
- [ ] **Step 4: Run** the same test; expect pass.
- [ ] **Step 5: Commit** `backend/core/src/desktop/conversation-context.ts`, export, and test as `feat(r4): bound prior chat context`.

### Task 2: Read only completed pairs from the accepted chat

**Files:** Modify `backend/core/src/desktop/ports.ts`, `backend/core/src/index.ts`; create `backend/infrastructure/src/persistence/sqlite-conversation-reader.ts`; test `backend/infrastructure/test/sqlite-conversation-reader.test.ts`.

**Interfaces:**
- Consume `ConversationPair` from Task 1.
- Produce `ConversationHistoryReader.readCandidates(chatId: Uuid, currentRequestId: Uuid): Promise<readonly ConversationPair[]>`, newest first, at most 9 pairs. The ninth pair proves count truncation.

- [ ] **Step 1: Write failing SQLite tests.** Two chats in one project; a completed exchange; an interrupted streamed answer; a failed run with retry; and the current accepted user message. Assert only earlier finished jobs with `result_json.status === 'completed'` and their last complete assistant step are returned, with matching user message and chat ownership.
- [ ] **Step 2: Run** `npx.cmd vitest run backend/infrastructure/test/sqlite-conversation-reader.test.ts`; expect missing reader failure.
- [ ] **Step 3: Implement** `SqliteConversationReader.readCandidates(chatId: Uuid, currentRequestId: Uuid)` against `desktop_jobs` and `chat_messages`. Find the current message sequence first, require matching chat, select at most 9 eligible jobs before it, then read each user and final assistant message. Reject inconsistent rows; never fall back to another chat or include an unfinished response.
- [ ] **Step 4: Run** the same test; expect pass.
- [ ] **Step 5: Commit** port, reader, exports, and test as `feat(r4): read completed chat exchanges`.

### Task 3: Pass selected history through the agent loop and audit it

**Files:** Modify `shared/src/model-contract.ts`, `backend/core/src/agent/run-agent-loop.ts`, `backend/infrastructure/src/create-r2-infrastructure.ts`, `backend/infrastructure/src/model/r3-runtime-factory.ts`; tests `backend/core/test/run-agent-loop.test.ts`, `backend/infrastructure/test/r3-runtime-flow.test.ts`.

**Interfaces:**
- Add `priorConversation` to `ModelRequest`: at most 16 items `{role:'user'|'assistant',text:string}` with a combined 32 KiB UTF-8 limit. It remains distinct from existing `history: ModelTurn[]`, which contains only turns and tool results of the current run.
- Add optional `priorConversation?: ConversationSelection` to `R2ExecutionOptions` and the `createR2Infrastructure` options. R3 runtime reads and selects candidates using `input.request.chatId` and `input.request.requestId` after durable acceptance; R1/R2 callers omit it.

- [ ] **Step 1: Write failing tests.** In a second run, spy on the fake model request and assert prior user/assistant text appears once, before the new task semantically, while `history` starts empty and later contains only current-run tools. Assert R1/R2 calls remain valid when `priorConversation` is absent. Assert the event payload has only message IDs, byte count, selected count, truncated flag and reason, without message text.
- [ ] **Step 2: Run** the two targeted Vitest files; expect failing assertions.
- [ ] **Step 3: Extend** `modelRequestSchema` with the count and byte bounds, and extend the loop input. Append `conversation.context_selected` after run creation and before first `model.requested`, once per run. Pass selected messages unchanged on each model step but never add them to current-run tool `history`.
- [ ] **Step 4: Wire** `SqliteConversationReader` and `selectConversationContext` in `r3-runtime-factory.ts`; pass selection via `createR2Infrastructure`. On reader corruption, fail safely before provider transmission rather than silently sending a partial history.
- [ ] **Step 5: Run** targeted tests; expect pass.
- [ ] **Step 6: Commit** contract, loop, wiring, and tests as `feat(r4): include bounded chat context in runs`.

### Task 4: Send history in the right order to the real provider

**Files:** Modify `backend/infrastructure/src/model/openai-responses-adapter.ts`; test `backend/infrastructure/test/provider-contract.test.ts`.

**Interfaces:** Consume `ModelRequest.priorConversation` from Task 3. Existing `history` retains tool-call encoding within the current run.

- [ ] **Step 1: Write failing transport tests.** Assert input order: a `developer` instruction, prior user, prior assistant, current user task, current project context, then current-run tool turns. Assert exactly one copy of the current task, no prior tool output and `store:false`. The instruction is exactly: `Previous chat messages describe past work. Re-read project files before relying on their contents.` Include a prior message mentioning an obsolete file value.
- [ ] **Step 2: Run** `npx.cmd vitest run backend/infrastructure/test/provider-contract.test.ts`; expect ordering assertion failure.
- [ ] **Step 3: Change** `inputItems(request, externalByInternal, tools)` to serialize prior messages first and retain current tool-call mapping. Keep the provider instruction out of persisted chat text.
- [ ] **Step 4: Run** the same test; expect pass.
- [ ] **Step 5: Commit** adapter and test as `feat(r4): send prior chat before new prompt`.

### Task 5: Make context use visible and verify the complete path

**Files:** Modify `backend/infrastructure/src/persistence/sqlite-desktop-projection-store.ts`, `apps/desktop/src/renderer/components/composer.tsx`; create `docs/architecture/r4-chat-continuity.md`, `docs/r4-acceptance.md`; tests `backend/infrastructure/test/r3-projection-store.test.ts`, `apps/desktop/test/composer.test.tsx`, `backend/infrastructure/test/r3-runtime-flow.test.ts`.

**Interfaces:** Consume `conversation.context_selected` from Task 3 through existing activity projection. No new renderer access to SQLite or filesystem.

- [ ] **Step 1: Write failing tests.** The activity shows “Navázáno na 2 předchozí zprávy” for one selected pair, and distinguishes a shortened history and `oversized_latest`. The composer says new input continues this chat. A two-prompt fake-adapter flow in Git and non-Git fixtures observes the prior exchange in the second request, keeps the second request ID distinct, and never repeats a tool call from the first run.
- [ ] **Step 2: Run** the three targeted Vitest files; expect failures in activity, copy and second-request assertions.
- [ ] **Step 3: Add** the summary and allowlisted `messageCount`, `truncated`, `reason` fields to the activity projection, then update the composer hint. Render counts as text and keep raw history out of the event details.
- [ ] **Step 4: Run** the targeted tests; expect pass. Run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run check:deps`, then `npm.cmd test` sequentially; record actual outputs. Run packaged R3 smoke if the changed model contract or runtime path affects it.
- [ ] **Step 5: Create** `docs/architecture/r4-chat-continuity.md` with the data flow and limits, and `docs/r4-acceptance.md` with the exact covered `FR-CHAT-06` evidence. Keep TypeScript verification, repo map and Git criteria open for later plans.
- [ ] **Step 6: Commit** UI, projections, tests and evidence as `feat(r4): show chat context and verify continuation`.

## Self-Review and Handoff

- Coverage: this plan implements early `FR-CHAT-06` and the history part of `FR-CTX-01/02`; it does not claim the rest of R4. The next independently testable plan covers project recognition and relevant TypeScript verification (`FR-TERM-04`), then the full TypeScript profile.
- Inspect types after Tasks 1–3: `ConversationPair` is newest first; `ConversationSelection.messages` and `messageIds` are chronological; `ModelRequest.priorConversation` contains text only. The audit carries IDs and counts only.
- Review focus tests are assigned in Tasks 1, 2 and 4. Existing R2/R3 provider, recovery and secret tests remain regression gates.
