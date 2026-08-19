# Codryn — pokyny pro agenty

Tento soubor je stručný provozní návod pro AI agenty pracující v tomto
repozitáři. Při každém novém úkolu nejdřív přečti tento soubor a
`PROJECT_CONTEXT.md`; u produktových změn potom také aktuální
`PRD_v0.3.md`.

## Co je autorita

- `PROJECT_CONTEXT.md` je živý kontext projektu a popisuje dlouhodobá pravidla.
- `PRD_v0.3.md` je aktuální produktový rozsah.
- Starší PRD, roadmapy, etapizace, registry rozhodnutí a brainstorming jsou
  v `docs/product/` a slouží jako historie nebo podklady, ne jako vyšší autorita.
- Technická rozhodnutí k implementaci jsou v `docs/decisions/` a architektura
  v `docs/architecture/`.

## Jak pracovat

- Komunikuj s autorem česky a používej srozumitelný jazyk. Technický termín
  vždy při prvním použití krátce vysvětli.
- Před změnou zkontroluj aktuální stav branche, diff a existující testy.
- Zachovej hranice `apps/desktop`, `backend/core`,
  `backend/infrastructure`, `shared` a `tests/support`.
- Backend je zdroj pravdy; Electron renderer nesmí dostat přímý přístup k Node
  API. Vstupy na hranicích validuj a citlivá data nezapisuj do logu.
- Příkazy spouštěj s omezeným pracovním adresářem, timeoutem a kontrolou
  oprávnění. Nikdy neukládej API klíče do repozitáře.
- Po změně spusť přiměřené testy, typecheck, lint a kontrolu závislostí.
  Úspěch oznamuj až podle skutečného výstupu kontrol.
- Neprováděj destruktivní operace bez výslovného zadání. Nezasahuj do
  `Dokumentace příklady/`, pokud k tomu autor výslovně neřekne jinak.

## Git

- Pracuj na samostatné feature branchi; změny commituj po smysluplných celcích.
- Před commitem ověř, že staging obsahuje jen změny tohoto úkolu.
- Push a PR dělej pouze na výslovnou žádost autora.
