# R2 – stav implementace

Datum checkpointu: 2026-10-05

Větev: `feat/r2-change-lifecycle`

Výchozí commit před tímto pracovním průchodem: `3bdd57e3b8b9349494b59be26df92b4ff474aeae`

## Souhrn

Lokální R2 implementace prošla čerstvým hostním ověřením. OpenAI Responses
`gpt-6-luna` je vybrán autorem; pětipokusový live acceptance gate prošel 4/5
a splnil AC-O1-04. OD-04 je uzavřeno autorským rozhodnutím zaznamenaným v PRD
v1.1 a ADR 0007; head-to-head s Gemini není součástí výběru ani se netvrdí.

Bezpečné reportování samotného HTTP statusu prošlo lokálním ověřením. PR se
v tomto kroku neotevírá ani neupravuje.

## Implementováno

- W1–W5: hashovaný a chráněný textový patch, journal, blob recovery,
  perzistence záměru a backendový execution context.
- D1–D3: Git i non-Git baseline, agentní diff, bezpečný revert a detekce
  konfliktu.
- P1–P5: jednorázová oprávnění, recovery pending stavů, Windows process-tree
  ownership, workspace revize a verification record.
- M1–M3: úplný fake change/verify/return cyklus, znovupoužitelný
  `ModelAdapter`, OpenAI Responses a Gemini boundary, omezený transport,
  modelové tool namespace a dynamické `.codrynignore`.
- M4–M5: offline eval kontrakty, explicitní live runner, cost ledger,
  packaged smoke entrypoint a finální gate skripty.

## Ověřený důkaz

- `npm.cmd run verify:r2` na Windows hostu: prošel.
- Typecheck, lint a `check:deps` prošly; dependency cruiser ověřil 217 modulů a
  599 závislostí.
- Vitest: 63 souborů prošlo, 2 byly přeskočeny; 531 testů prošlo a 3 byly
  přeskočeny.
- `npm.cmd run test:r2-provider-eval`: 7/7; ověřuje volitelný srovnávací výběr,
  který po autorské volbě GPT-6 Luna není povinnou R2 branou.
- `npm.cmd run test:r2-live-report`: 6/6; rate-limit failure ownership a
  nastavení počtu retry se nyní zaznamenávají správně.
- R1 repeatability: 1/1; R2 repeatability: 20/20 pro Git i non-Git.
- `npm.cmd run package`, packaged R0 verifier a packaged R2 verifier prošly.
- Cílená guarded-writer sada: 6/6 včetně přímé/hlubší junction, výměny root
  adresáře a změny nesouvisejícího souboru vedle projektu.
- Úplný hostní verifier dokončil i zabalený R0/R2 smoke; první omezený běh
  selhal pouze na procesech, které sandbox nemohl ukončit.

Výše uvedené packaged kontroly ověřily R0 diagnostický runner a samostatný R2
Job Object. R0 při neúspěšném `taskkill` hlásí `treeTerminated: false`; záruku
vlastnictví a ukončení stromu poskytuje až R2 Job Object podle ADR 0006.

## Před otevřením PR

1. Před dalším krokem zkontrolovat finální diff: zahrnuje R2 lifecycle a
   guarded write/process ownership, provider adaptéry a transport, testy a
   eval/verification skripty, sanitizovaný report a rozhodovací dokumentaci.
   Při přípravě PR zachovat ostatní již existující pracovní změny.
2. `docs/r2-author-checklist.md` nyní ukazuje 12/12 zaškrtnutých položek, ale
   sedm změn proti HEAD nemá ověřené autorství. Autor před PR potvrdí vlastní
   attestaci, nebo políčka opraví; agent je nezaškrtává za autora.
3. Před odesíláním soukromého projektového obsahu uplatnit upozornění a
   potvrzení vyžadované FR-LLM-09/13 v PRD v1.1.
4. PR nebylo otevřeno. Jeho otevření, následná kontrola a případné sloučení
   zůstávají samostatným dalším krokem autora.
