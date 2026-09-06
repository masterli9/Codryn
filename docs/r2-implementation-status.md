# R2 – stav implementace

Datum checkpointu: 2026-09-06

Větev: `docs/r2-change-lifecycle`

Poslední výchozí commit před checkpointem: `9140f2a`

## Souhrn

Lokální implementační části R2 jsou rozpracované v souladu s aktuálním
`PRD_v1.0.md`, schváleným návrhem a implementačním plánem. Do dokončení R2
ještě chybí čistý packaged důkaz a skutečná provider evaluace. Tento dokument
je předávací stav, nikoli prohlášení, že je R2 akceptované.

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
- Offline `npm.cmd run eval:r2-providers`: bezpečně skončil bez výběru modelu,
  protože nebyla dodána live data.

Výše uvedené kontroly byly provedeny před poslední změnou, která předává
packaged smoke scénáři explicitní cestu k Node executable. Tuto změnu je nutné
na začátku další relace znovu ověřit typecheckem a testy.

## Otevřené akceptační brány

1. Znovu sestavit desktop package a ověřit čistý packaged R0/R2 smoke. Předchozí
   packaged R2 průchod skončil interní chybou při detekci nadřazeného Git
   repozitáře; oprava explicitního `GIT_DIR`/`GIT_WORK_TREE` je v pracovním
   stromu, ale ještě nemá nový packaged důkaz.
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
