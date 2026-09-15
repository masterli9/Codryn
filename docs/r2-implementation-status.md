# R2 – stav implementace

Datum checkpointu: 2026-09-14

Větev: `feat/r2-change-lifecycle`

Poslední výchozí commit před checkpointem: `9140f2a`

## Souhrn

Lokální implementační části R2 jsou hotové v souladu s aktuálním
`PRD_v1.0.md`, schváleným návrhem a implementačním plánem. Packaged Windows
smoke je ověřený; k formálnímu uzavření R2 stále chybí autorský checklist a
skutečná provider evaluace. Tento dokument není prohlášením, že je R2 plně
akceptované.

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

- `npm.cmd test`: 464 testů prošlo, 3 byly přeskočeny; 2 přeskočení se týkají
  volitelného packaged režimu.
- `npm.cmd run typecheck`: prošel.
- `npm.cmd run lint`: prošel.
- `npm.cmd run check:deps`: prošel bez porušení závislostních pravidel.
- `npm.cmd run test:r2-repeatability`: 20/20 běhů pro Git i non-Git prošlo.
- `npm.cmd test`: 65 souborů; 510 testů prošlo a 3 jsou záměrně přeskočené.
- `backend/infrastructure/test/process-runner.test.ts`: 28/28 prošlo po opravě
  fallbacku sirotčích Windows process trees.
- `node scripts/verify-packaged-r0.mjs`: prošlo, všech 11 R0 kontrol má `pass`.
- `node scripts/verify-packaged-r2.mjs`: prošlo; database, guarded write,
  process tree i návrat baseline mají úspěšný stav.
- Offline `npm.cmd run eval:r2-providers`: bezpečně skončil bez výběru modelu,
  protože nebyla dodána live data.

Výše uvedené packaged kontroly ověřily R0 diagnostický runner a samostatný R2
Job Object. R0 při neúspěšném `taskkill` hlásí `treeTerminated: false`; záruku
vlastnictví a ukončení stromu poskytuje až R2 Job Object podle ADR 0006.

## Otevřené akceptační brány

1. Vyplnit autorský checklist vlastními slovy a ověřit neověřené kroky.
2. Spustit skutečnou evaluaci providerů a vybrat model až z úplných dat.
3. Spustit pět autorizovaných live trialů (3 Git, 2 non-Git) podle M4,
   s pozitivním cost capem, cenami a jejich zdrojem. V této relaci nebyl
   použit žádný `R2_PROVIDER_API_KEY`.
4. Po průchodu branami provést finální requirement audit a případně rozdělit
   checkpoint na menší tematické commity.

## Doporučený start zítra

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run package
node scripts/verify-packaged-r0.mjs
node scripts/verify-packaged-r2.mjs
```

Teprve potom má smysl řešit live provider credentials a M4 acceptance gate.
