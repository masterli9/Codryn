# Audit implementačních plánů R4 proti PRD a roadmapě

**Datum:** 13. listopadu 2026

**Autorita:** `PRD_v1.1.md`, `PROJECT_CONTEXT.md`, `docs/product/ROADMAP.md` §8.
**Rozsah:** šest implementačních plánů `docs/superpowers/plans/*r4*.md`; audit dokumentace, nikoli důkaz implementace.

## Pokrytí povinného R4 rozsahu

| Oblast | Implementační plán | PRD a důkazní brána |
| --- | --- | --- |
| Navazující vlastní prompt v témže chatu | `2026-11-10-r4-chat-continuity.md` | Dřívější dodání `FR-CHAT-06`; historie v `FR-CTX-01/02`, živý model `FR-LLM-03`; fake a oddělený live průchod |
| Rozpoznání projektu a relevantní kontrola | `2026-11-10-r4-typescript-verification.md` | `FR-TS-01`, `FR-TERM-04..06`, `FR-ORCH-06/07`, přesná invalidace `AC-O1-24` |
| Strukturální TypeScript dotazy | `2026-11-13-r4-typescript-structural-profile.md` | `FR-TS-02..08`, 20 ručně ověřených dotazů a `AC-O1-13` |
| Kontext, mapa, `@` a ignore | `2026-11-13-r4-repo-map-references.md` | `FR-CHAT-12..14`, `FR-CTX-01..06/12..17`, `AC-O1-14/17/18/27` |
| Workspace a lokální Git | `2026-11-13-r4-workspace-git.md` | `FR-COORD-01/02/08..10/14`, lokální M/O1 `FR-VCS-01..07/09..14/16/20/21`, `AC-O1-19/20/22/23/24` |
| Otázky, katalog a provider eval | `2026-11-13-r4-questions-workflows-eval.md` | `FR-CHAT-19..21`, `FR-ORCH-11`, `FR-EXT-01/02`, `FR-LLM-12`, `AC-O1-25/31` a závěrečná matice všech `AC-O1` |

`AC-O1-01..12/15/16` a starší M/O1 požadavky R2/R3 nejsou znovu implementovány z pouhého plánu; dokončovací matice vyžaduje konkrétní existující důkaz a čerstvou regresi. Volitelné S/O1 položky (`AC-O1-21/26/28/29/30`) se hodnotí jen při výslovném zařazení do buildu. Historické `AC-O1-04` a provider rozhodnutí se nepřepisují novým evalem. R3 osobní přijetí zůstává otevřené.

## Opravené rozpory a mezery

1. **Platnost ověření:** původní TypeScript plán svazoval platnost se shodou celé globální revize. `AC-O1-24` vyžaduje rozlišit relevantní a nezávislou změnu. Plán nyní ukládá rozsah/hash vstupů a posuzuje ho podle aktuálního stavu; neúplné pozorování zůstává nejisté.
2. **Ignorované deklarace:** strukturální plán připouštěl interní čtení `.d.ts` z ignorovaného `node_modules`. Podle `FR-CTX-14/15` nyní host takové projektové deklarace automaticky nečte a při omezeném type resolution hlásí `limited`.
3. **Pořadí bezpečnostní politiky:** společný základ `.codrynignore` se má zavést před novým TypeScript indexem a finálním skládáním kontextu, nikoli až po nich. Kontextový plán toto pořadí uvádí a chrání pevné zákazy i před negací pravidla.
4. **Hlubší inicializace:** kontextový plán nyní výslovně zahrnuje projektové instrukce jako samostatný zdroj vedle struktury, konfigurace, symbolů a vazeb podle `FR-CTX-06`.
5. **Specifikace oblastí:** roadmapa vyžaduje samostatné technické specifikace. Doplněny jsou `docs/superpowers/specs/r4-typescript-profile.md`, `r4-context-security.md`, `r4-workspace-state.md` a `r4-local-git.md`. Provider má existující `docs/architecture/r2-provider-contract.md` a datované rozhodnutí `docs/decisions/0007-r2-provider-selection.md`. Před produkčním kódem implementátor ověří návrhy specifikací proti tehdejším rozhraním.
6. **Pluginový registr:** plán nyní validuje manifesty skillů i pluginů dle `FR-EXT-01`, ale cizí import zůstává volitelný S/O1.

## Pořadí a otevřené brány

1. Ověřit oblastní specifikace a zavést kontextovou bezpečnostní politiku (Task 0–1 kontextového plánu).
2. Dodat návaznost chatu, rozpoznání/ověření TypeScript projektu a strukturální dotazy. Bezpečnostní jádro workspace a přesná invalidace ověření musí být hotové před tvrzením, že `AC-O1-24` prošlo.
3. Dodat mapu, `@` reference a audit; potom otázky, vestavěné postupy a lokální Git nad společným workspace stavem.
4. Na zafixovaných fixture spustit testy, bezpečnostní sadu, lokální Git scénáře, TypeScript eval, live provider eval a packaged průchod. Do matice uvést i neúspěchy a neověřené požadavky.

**Výsledek auditu:** Plány po opravách pokrývají povinné oblasti R4 vyjmenované v PRD a roadmapě. Jsou to implementační podklady; žádná jejich položka tímto auditem nezískává stav „splněno“. Produktová implementace, čerstvé důkazy a kontrola technických specifikací před kódem zůstávají otevřené.
