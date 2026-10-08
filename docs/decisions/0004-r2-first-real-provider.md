# ADR 0004: První skutečný model již v R2

## Stav

Přijato autorem 5. září 2026 pro pořadí implementace. Konkrétní model není vybrán.

## Kontext

Roadmapa původně řadila provider eval a první skutečný adaptér do R4.
Autor při schvalování rozdělení R2 požádal o jejich přesun do R2.

## Rozhodnutí

R2 proto musí prokázat celý bezpečný headless cyklus s fake i skutečným
modelem. R4 přebírá rozšiřování scénářů nad již integrovaným adaptérem.

## Důsledky

Jde o pořadí implementace uvnitř stejné produktové etapy O1. Nemění se
schopnost, bezpečnostní hranice ani význam AC-O1-04. PRD v1.0 a vydané
v1.0 doprovodné dokumenty zůstávají zachované; jejich historické přiřazení
prvního adaptéru k R4/F3 zpřesňuje toto rozhodnutí a PROJECT_CONTEXT.md.
Termín OD-04 se zpřísňuje na dobu před uzavřením R2; rozhodnutí o modelu
zůstává otevřené do měření dle FR-LLM-12.

Fake testy zůstávají výchozí a bez sítě. Live testy používají syntetickou
fixture, explicitní spuštění, omezené náklady a pravidla zpracování dat dle
PRD. API nedostupnost neblokuje lokální testování, ale brání prohlášení živé
brány R2 za splněnou. Druhý produktový adaptér zůstává ve ŠF.

## Alternativy

- Původní R4: menší R2, ale pozdější důkaz skutečného modelového průchodu.
- Vybraný směr R2: dřívější důkaz, za cenu provider evalu a integrační práce
  před připojením produktového UI.

## Ověření

Rozhodnutí o pořadí je zaznamenáno v roadmapě a živém kontextu. Implementační
důkaz zatím neexistuje; vyžaduje fake regresi, provider eval a live 4/5.

## Navazující brána

Před podrobnými implementačními plány proběhne revize návrhové specifikace.
Před uzavřením R2 musí být doložen výběr modelu a oba druhy testů.

- `docs/superpowers/specs/2026-09-05-r2-change-lifecycle-design.md`
- `docs/product/ROADMAP.md`, R2 a R4
- `PRD_v1.0.md`, FR-LLM-03/12, AC-O1-04 a OD-04
