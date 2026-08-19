# ADR 0002: Ukončení stromu Windows procesů v R0

## Stav

Dočasně přijato pouze pro Windows spike R0.

## Kontext

Diagnostika musí po timeoutu nebo překročení výstupu ukončit vlastněný proces i jeho potomky.

## Rozhodnutí

R0 používá `taskkill /T /F` až po spuštění konkrétního vlastněného procesu a zachovává jeho lifecycle do rozhodnutí o ukončení stromu.

## Důsledky

Tento mechanismus není sandbox ani bezpečnostní hranice a neopravňuje spouštění nedůvěryhodných příkazů. Je omezen na diagnostické fixture procesy R0.

## Ověření

Integrační testy ověřují timeout, limit výstupu, závody lifecycle a nepřežívajícího potomka.

## Navazující brána

R2/O1 musí před obecnými shell nástroji schválit Windows Job Object nebo rovnocenně ověřený mechanismus.
