# R3 — ověření prvního kroku po checkpointu

Datum: 29. října 2026. Ověřený základ: `ed9092c` na větvi
`feat/r3-electron-workspace`. Node `24.19.0`, npm `11.17.0`, Windows.

Rozsah odpovídá prvnímu bodu pokračování v
[checkpointu R3](2026-10-11-r3-progress.md): ověřit uložené opravy procesů,
SQLite a R3 průchodu, potom celou testovací sadu a statické kontroly.
Produkční kód ani testy nebyly v tomto kroku měněny.

## Výsledky

| Kontrola | Skutečný výsledek |
| --- | --- |
| `npm.cmd run typecheck` | exit 0, všechny workspace |
| `npm.cmd run lint` | exit 0 |
| `npm.cmd run check:deps` | exit 0, 297 modulů / 895 vazeb, bez porušení hranic |
| Cílená sada procesů, SQLite a R3 | první hostní běh 83 passed / 1 failed; timeout Git varianty R3 |
| Izolované opakování `r3-runtime-flow.test.ts` | exit 0, 3/3; Git, non-Git a zrušení čekajícího schválení |
| Úplná sada `npm.cmd test` | exit 0, 87 souborů prošlo / 2 přeskočeny; 601 testů prošlo / 3 přeskočeny; 240,19 s |

Cílená sada obsahovala `r3-command-stream.test.ts`, `r2-command-runner.test.ts`,
`process-runner.test.ts`, `sqlite.test.ts`, `r3-chat-persistence.test.ts`,
`r3-projection-store.test.ts` a `r3-runtime-flow.test.ts` z
`backend/infrastructure/test/`. Izolované opakování použilo
`npm.cmd exec -- vitest run --project host-integration backend/infrastructure/test/r3-runtime-flow.test.ts --reporter=verbose`.

Úplná sada běžela bez souběžného typechecku/lintu přes existující `runGate`
s limitem 600 sekund. Vitest dostal navíc reportery `default` a `json` a
`--outputFile=.r3-artifacts/2026-10-29-step1/full-tests.json`.
Lokální ignorované důkazy jsou v této složce: `full-tests.json` a
`full-tests.log`. JSON uvádí `success: true` a nula neúspěšných testů.

Úplná sada prokázala také skutečný průběžný stdout/stderr, potvrzené zastavení
procesního stromu a zánik potomků po ukončení pouze Node hostitele. R3 Git
i non-Git průchod provedl schválení, test, diff a idempotentní bezpečný návrat;
samostatná CLI regrese zachovala rozpracované soubory, HEAD a přesné bajty
Git indexu. SQLite a audit dokončení ručního návratu prošly.

## Pozorování a hranice důkazu

- První sandboxový pokus skončil na `EPERM` při přejmenování dočasných souborů
  Vitestu, ještě před vykonáním testů. Výše uvedené testové výsledky pocházejí
  až z hostitelských Windows.
- Při prvním hostním cíleném běhu souběžně se statickými kontrolami nastal
  `TimeoutError` v Git variantě R3. Příčina nebyla potvrzena; nesmí být označen
  za opravenou produkční chybu. Izolovaný běh i následná úplná sada bez
  souběžných kontrol prošly beze změny kódu (Git průchod 21,59 s a 17,73 s).
- Přeskočeny byly dva opt-in packaged smoke testy R0/R2 a jeden test
  souborového symlinku podmíněný oprávněním Windows. Úspěch ostatních testů
  toto chybějící měření nenahrazuje.
- Neběžel `verify:r3`, nový package, Electron UI E2E, packaged ochrana klíče,
  placené API ani nové měření bezpečnostních zranitelností závislostí.
  Osobní autorský checklist zůstává neprovedený.

## Navazující práce

První ověřovací krok má zelenou úplnou testovací sadu i statické kontroly.
Další je bod 2 checkpointu: startup failure IPC fallback, hranice testovacího
profilu a chybové kategorie factory. UI nedodělky, problémové scénáře,
aktuální Windows package a E3 předání zůstávají samostatnou prací.
R3 není tímto dokončené ani přijaté a práce na R4 se nezahajuje.
