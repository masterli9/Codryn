# Rozšířený eval R4

## Zafixovaná sada a rozsah

Dataset `tests/support/r4-eval/dataset-v1.json` byl zafixován v commitu `916e520` před vyhodnocením. Obsahuje devět případů nad malou TypeScript/React fixture. Generátor vytváří oddělené dočasné projekty s komponentou, funkcí čítače, TypeScript konfigurací a skutečným testem Node. Vyhodnocení používá běžný desktopový backend, původní nástroje a jednotlivá oprávnění příkazů.

Případy zahrnují změnu v Git i non-Git projektu, navazující prompt, ignorovaný vstup, zastaralý patch, otázku, opravu po neúspěšném testu a oba vestavěné postupy. Příkazy eval povoluje pouze při přesné shodě s existujícím navrženým checkem. Závislosti neinstaluje. Otázkový případ má předem určenou testovací odpověď.

## Offline výsledek z 18. listopadu 2026

`node scripts/eval-r4-model.mjs --offline` prošel 9/9, bez placených požadavků. Validováno bylo všech 30 argumentových obálek podle skutečných událostí validace nástrojů a uložených otázek. Součet časů případů činil 88 080 ms. Strojový záznam obsahuje každý případ, jeho výsledek, platnost argumentů, dokončení, opravu po chybě a latenci. [Úplný report](evals/r4-offline-report.json)

Odmítnutý ignorovaný vstup je úspěchem bezpečnostního očekávání. Jeho úkol zůstal nedokončený a report uvádí `taskCompleted=false`. U ostatních osmi případů běh dospěl k dokončení. Oprava po chybě je doložena pro stale patch i po původně neúspěšném testu. Modelová spotřeba, reasoning tokeny a cena jsou v offline reportu `null`.

- Dataset SHA-256 `00fdb7d02920f9dab7b53193d92353cfe3fa9b72d9c6e418cd3e85bd912fd502`
- Zdroj SHA-256 `a41de13fc3d40ba74175b3f0198ccde9f9c636438e010f1e33d39eb470fe0014`

První pokus odhalil dvě chyby ovladače. Příkaz testu měl tvar, který inferenční pravidla nepodporují. Ovladač také čekal na celý obnovený běh dříve, než zpracoval jeho nové oprávnění. Tento pokus se zastavil bez úplného reportu. Oprava se týkala ovladače. Po ní prošel celý offline průchod i následný průchod se zpřesněnými kontrolami skutečných výsledků. Oba použily stejných devět očekávání.

`node --test scripts/eval-r4-model.test.mjs scripts/r4-eval-budget.test.mjs` prošel 4/4. Ověřuje bránu placeného měření, konzistenci reportu a zastavení delegovaných požadavků před překročením počtu nebo rezervované ceny. Neznámá spotřeba se nedoplňuje odhadem.

## Živý eval

Nový živý eval nebyl spuštěn. Autor dosud neschválil jeho konkrétní rozpočet. `FR-LLM-12` a nové rozšířené měření `AC-O1-25` zůstávají otevřené. Historické rozhodnutí ADR 0007 a původní živé protokoly R2/R3 zůstávají samostatnými důkazy.

Připravený vstup `scripts/eval-r4-model.mjs` vyžaduje současně `--live`, `--confirm-paid-api`, kladné `--max-cost-usd`, celočíselné `--max-requests` nejvýše 100, oba cenové parametry `--input-usd-per-million` a `--output-usd-per-million`, zdroj cen `--pricing-source` a potvrzení aktuální verze `--consent-version openai-api-2026-11-14`. Model je pevně `gpt-6-luna`. Klíč přebírá existující mechanismus pro lokální provider key.

Před každým požadavkem ovladač rezervuje konzervativní odhad vstupu a maximálně 4 096 výstupních tokenů proti celkovému rozpočtu. Neprovádí automatické HTTP retry. Neznámá spotřeba zůstane neznámá a rezervace se neuvolní. Report rozlišuje modelovou chybu, chybu ovladače, chybu poskytovatele a vyčerpání brány rozpočtu. Reasoning tokeny zaznamená jen při dostupných metadatech. Připravený živý vstup vyžaduje budoucí ověření proti skutečnému API.

Výstup obsahuje pouze bezpečné metriky, ID případů a otisky. Dočasný profil používá pro klíč autentizované šifrování s jednorázovým klíčem v paměti. Eval nevydává tuto testovací úschovu za produktovou Windows DPAPI. Po průchodu smaže vlastní dočasné projekty. Cenový odhad musí být posuzován podle konkrétního schváleného profilu.
