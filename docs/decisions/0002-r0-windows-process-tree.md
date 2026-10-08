# ADR 0002: Ukončení stromu Windows procesů v R0

## Stav

Dočasně přijato pouze pro Windows spike R0.

## Kontext

Diagnostika musí po timeoutu nebo překročení výstupu ukončit vlastněný proces i jeho potomky.

## Rozhodnutí

R0 používá `taskkill /T /F` až po spuštění konkrétního fixture procesu a
zachovává jeho lifecycle do rozhodnutí o ukončení stromu. Pokud Node už oznámil
`exit`, runner `taskkill` nespouští, aby vědomě nepředal zastaralý PID.

## Důsledky

Tento mechanismus není sandbox ani bezpečnostní hranice a neopravňuje spouštění nedůvěryhodných příkazů. Je omezen na diagnostické fixture procesy R0.

`taskkill /PID` nepřebírá handle ani creation-time identitu procesu. Mezi
spuštěním `taskkill` a otevřením PID proto může proces skončit a PID být
recyklován. `treeTerminated: true` v R0 znamená pouze úspěšný návrat
`taskkill` v ověřené fixture; není to důkaz vlastnictví ani obecná garance
bezpečného ukončení stromu. Tento interval řeší až R2 Job Object vytvořený a
přiřazený před spuštěním uživatelského kódu podle ADR 0006.

## Ověření

Integrační testy ověřují timeout, limit výstupu, závody lifecycle a nepřežívajícího potomka.

## Navazující brána

R2/O1 musí před obecnými shell nástroji schválit Windows Job Object nebo rovnocenně ověřený mechanismus.
