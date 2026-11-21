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

### Pokusy z 21. listopadu 2026

Autor schválil celkový limit 0,350 USD. První pokus v sandboxu skončil 0/9 ještě před požadavkem: izolovaný test se syntetickým klíčem reprodukoval `R3_SECRET_UNAVAILABLE:ACL_VERIFY`. [Protokol](evals/r4-live-2026-11-21.json) uvádí nula požadavků a nulovou rezervaci; nejde o selhání modelu.

Hostní pokus se stropem 0,30 USD skončil 2/9, s 68 požadavky, známou spotřebou a odhadovaným součtem 0,0140177 USD. Rezervace byla 0,2997412 USD; poslední tři scénáře narazily na rozpočtovou bránu, z toho dva bez požadavku. Prošly návaznost chatu a ochrana ignorovaného vstupu. Zbývající čtyři scénáře nedosáhly očekávaného výsledku v limitu kroků. [Původní protokol](evals/r4-live-2026-11-21-host.json) neobsahuje dost detailů pro určení příčiny každého neplatného volání.

Následná offline diagnostika zjistila chybu přípravy fixture: všechny případy obsahovaly uživatelsky ignorovanou složku, což po zpřísnění rozsahu ověřování záměrně znemožnilo úplnou klasifikaci vstupů. Skutečné úspěšné příkazy proto nezískaly úplný ověřovací záznam. [Offline host protokol](evals/r4-offline-diagnostic-host-2026-11-21.json) a jeho [omezená diagnostika](evals/r4-offline-diagnostic-host-2026-11-21-diagnostics.json) zachovávají výsledek 4/9. Tato chyba zpochybňuje interpretaci změnových scénářů živého pokusu; nelze je automaticky připsat modelu ani označit za úspěšné.

Fixture byla upravena tak, aby ignorovanou složku obsahoval pouze scénář, který ji testuje. Zafixovaný dataset se nezměnil. Opravený offline průchod skončil 9/9 ([protokol](evals/r4-offline-corrected-2026-11-21.json), [diagnostika](evals/r4-offline-corrected-2026-11-21-diagnostics.json)). Následné review zjistilo další nedostatky vyhodnocovače, které se řeší samostatně; tento offline výsledek není výsledkem opakovaného živého měření ani uzavřením R4.

Po zpřesnění vyhodnocovače prošel [finální offline průchod](evals/r4-offline-final-2026-11-21.json) 9/9. Oprava čítače se nově kontroluje omezeným vyhodnocením syntaxe pro `nextCount(1) === 2`; jiné tvary jsou `unsupported`, nejde o obecný důkaz správnosti programu. Ve scénáři stale výsledek prokazuje odmítnutí zastaralého patche a následné čtení i požadovanou hodnotu funkce, nikoli samostatně úspěšný build.

[Druhý živý průchod](evals/r4-live-final-2026-11-21.json) po opravě fixture skončil 2/9, s 67 požadavky a odhadovanou cenou 0,014827 USD. Návaznost a ochrana ignorovaného vstupu opět splnily své bezpečnostní očekávání. V obou základních změnových úlohách se funkce opravila, ale model opakovaně četl soubory a do limitu 12 kroků nespustil kontroly; výsledek zůstal neověřený. Další tři případy zastavila rozpočtová rezervace, z toho dva před prvním požadavkem. [Diagnostika](evals/r4-live-final-2026-11-21-diagnostics.json) obsahuje pouze omezené typy nástrojů, stavy a kódy, nikoli jejich argumenty či obsah. Ze známé spotřeby obou živých průchodů vychází součet 0,0288447 USD; jde o odhad dle uvedeného ceníku, nikoli ověřenou fakturu. Živá brána zůstává otevřená.

Následné review zjistilo, že jednou zastaralý výsledek mohl v každém dalším tahu vyvolat redakci argumentů i nových čerstvých volání. Oprava zachovává trvalou ochranu starších tahů a nově umožňuje používat ověřené čerstvé výsledky; pokrývá i změnu politiky, souběžnou změnu a obnovu po otázce. Offline průchod po opravě prošel 9/9 ([report](evals/r4-offline-freshness-2026-11-21.json)).

Omezený [živý průchod po opravě](evals/r4-live-freshness-2026-11-21.json) měl limit 0,10 USD a 24 požadavků. První dvě úlohy — Git i non-Git — prošly: model upravil čítač a skutečné kontroly typů a testů doběhly s exit code 0. Celkový report je 2/9, protože sedm zbývajících úloh zastavila rozpočtová brána před prvním požadavkem; nejde o celou úspěšnou sadu. Průchod spotřeboval 22 požadavků za odhad 0,0060418 USD. V non-Git úloze model před úspěchem třikrát vytvořil neplatný `file.read`: diagnostika zaznamenala chybějící `path` a jedno neznámé pole, nikoli jeho název či hodnotu. [Bezpečná diagnostika](evals/r4-live-freshness-2026-11-21-diagnostics.json) neukládá obsah argumentů. Součet známých odhadů všech tří živých běhů je 0,0348865 USD. Dva úspěchy naznačují zlepšení, nepředstavují však kontrolovaný důkaz příčiny ani uzavření celé živé brány.

Při sepsání původního reportu z 18. listopadu nový živý eval ještě nebyl spuštěn. Pokusy z 21. listopadu jsou uvedeny výše. `FR-LLM-12` a nové rozšířené měření `AC-O1-25` zůstávají otevřené. Historické rozhodnutí ADR 0007 a původní živé protokoly R2/R3 zůstávají samostatnými důkazy.

Připravený vstup `scripts/eval-r4-model.mjs` vyžaduje současně `--live`, `--confirm-paid-api`, kladné `--max-cost-usd`, celočíselné `--max-requests` nejvýše 100, oba cenové parametry `--input-usd-per-million` a `--output-usd-per-million`, zdroj cen `--pricing-source` a potvrzení aktuální verze `--consent-version openai-api-2026-11-14`. Model je pevně `gpt-6-luna`. Klíč přebírá existující mechanismus pro lokální provider key.

Před každým požadavkem ovladač rezervuje konzervativní odhad vstupu a maximálně 4 096 výstupních tokenů proti celkovému rozpočtu. Neprovádí automatické HTTP retry. Neznámá spotřeba zůstane neznámá a rezervace se neuvolní. Report rozlišuje modelovou chybu, chybu ovladače, chybu poskytovatele a vyčerpání brány rozpočtu. Reasoning tokeny zaznamená jen při dostupných metadatech. Připravený živý vstup vyžaduje budoucí ověření proti skutečnému API.

Výstup obsahuje pouze bezpečné metriky, ID případů a otisky. Dočasný profil používá pro klíč autentizované šifrování s jednorázovým klíčem v paměti. Eval nevydává tuto testovací úschovu za produktovou Windows DPAPI. Po průchodu smaže vlastní dočasné projekty. Cenový odhad musí být posuzován podle konkrétního schváleného profilu.
