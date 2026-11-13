# R4 kontext a repo mapa bez modelového API

Měření z 13. listopadu 2026 používá syntetický projekt s TypeScript a TSX soubory. Reprodukce z kořene repozitáře:

```powershell
npx.cmd vitest run backend/infrastructure/test/r4-context-evidence.test.ts --disableConsoleIntercept
```

## Otevření projektu a audit

Projekt se přes běžný desktopový backend otevřel za **144–418 ms** při záměrně pozastaveném scanu. Stav mapy zůstal `indexing` během otevření chatu, načtení jeho pohledu, hledání reference a odeslání úkolu. Od odeslání po načtení detailu běhu uplynulo **897–3 111 ms**. Jde o rozsah tří měření z vývojového prostředí s nahrazeným poskytovatelem a pozastaveným mapovým workerem.

Lokální náhrada modelu dostala jeden požadavek s omezeným výřezem z vybraného souboru. Uložený audit rozlišil zadání, ukazatel `@` a zkrácený výřez. Obsah výřezu a syntetická hodnota z `.env.local` se v auditu neobjevily. Opakované odeslání staré reference po změně souboru bylo odmítnuto před modelem. Neplatné pravidlo na řádku 2 zastavilo nové odeslání, zatímco chat šlo načíst.

## Párové srovnání mapy a základního hledání

Dvě úlohy byly zafixované ve fixture. Náhrada modelu deterministicky použije cestu ze symbolu v mapě, pokud ji dostane. Jinak provede doslovné hledání v souborech a odpoví ve druhém kroku. Počítadlo dělí text na slova a jednotlivé znaky interpunkce. Uvedené tokeny patří této náhradě modelu a zahrnují její vstup a výstup.

| Úloha | Varianta | Vstupní tokeny | Výstupní tokeny | Kroky | Správná cesta |
| --- | --- | ---: | ---: | ---: | --- |
| Najít `GaugeWidget` | Bez mapy | 77 | 7 | 2 | Ano |
| Najít `GaugeWidget` | S mapou | 42 | 5 | 1 | Ano |
| Najít `parseConfig` | Bez mapy | 77 | 7 | 2 | Ano |
| Najít `parseConfig` | S mapou | 42 | 5 | 1 | Ano |

Tento průchod měří dvě úlohy hledání symbolu a záměrně jednoduché rozhodování náhrady. Výsledek nepokrývá rozhodování skutečného modelu, tokenizaci poskytovatele ani úlohy úpravy kódu. Celá AC-O1-27 zůstává otevřená do společné zkoušky s produkčním TypeScript indexem. Důkaz z tohoto souboru je backendový, ovládání klávesnicí a zobrazení souhrnu pokrývají samostatné testy rendereru.
