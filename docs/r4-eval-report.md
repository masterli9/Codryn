# Rozšířený eval R4

## Cílené ověření historie — 22. listopadu 2026

OpenAI adapter nahrazuje redigovanou historickou dvojici volání a výsledku omezenými, označenými metadaty; neposílá modelu placeholder jako vzor skutečného volání. Smíšené čerstvé dvojice si zachovávají párování i pořadí, odpověď na otázku zůstává dostupná a staré obsahy se neodesílají. Review i cílené testy pokrývají pořadí, souběžné volání, obnovu po otázce a nepovolené výstupy.

[Jeden živý scénář `question`](evals/r4-live-question-history-2026-11-22.json) po této změně skončil 0/1: model položil jednu otázku, ale po 12 krocích nespustil kontroly ani nedokončil úlohu. [Diagnostika](evals/r4-live-question-history-2026-11-22-diagnostics.json) nezaznamenala jediné opakování redigovaného placeholderu u `file.read`; jde o jeden pokus, nikoli důkaz spolehlivosti. Spotřeboval 12 požadavků za odhad 0,0042101 USD; součet dosud zaznamenaných sedmi živých běhů je 0,0663631 USD, nikoli ověřená faktura.

Review navíc zjistilo nesoulad otázkového případu datasetu v1: prompt žádá přidat ukládání hodnoty, ale jeho hodnoticí brána vyžaduje také opravu výpočtu čítače, kterou zadání neobsahuje, a neověřuje samotnou implementaci ukládání. Offline model tuto nesrovnalost zakrývá připravenou opravou čítače. Původní dataset a reporty zůstávají zachovány; výsledek tohoto případu nelze považovat za úplné měření splnění uživatelského zadání. Vyžaduje budoucí samostatnou opravenou sadu s předem určeným a skutečně ověřovaným očekáváním. V tomto běhu ovšem neproběhly ani kontroly a úloha nedosáhla dokončení.

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

Další omezený [diagnostický průchod](evals/r4-live-argument-diagnostic-2026-11-21.json) se stejným stropem a 24 požadavky skončil 0/9: Git úloha ve 12 krocích změnila čítač a spustila dvě úspěšné kontroly, ale nedospěla ke konečné odpovědi; non-Git a sedm následujících úloh zastavila rozpočtová brána. V prvních dvou případech [diagnostika](evals/r4-live-argument-diagnostic-2026-11-21-diagnostics.json) nezaznamenala žádné neplatné `file.read`, a proto nepotvrdila ani nevyvrátila podezření, že model v předchozím běhu napodobil redigovanou historii. Použito bylo 22 požadavků za odhad 0,0057951 USD. Součet čtyř běhů s dostupnou spotřebou činí 0,0406816 USD; nejde o ověřenou fakturaci. Výsledky ukazují proměnlivost chování a potřebu dalšího cíleného ověření.

OpenAI adapter poté dostal obecnou instrukci k účelnému dokončení úkolu, všem relevantním kontrolám, pravdivému shrnutí, respektování workflow a backendových oprávnění a k významu redigovaných argumentů historie. Testy kontraktu ověřují i planning/verification workflow a zachované párování stale volání. [Omezený živý průchod s instrukcí](evals/r4-live-guidance-2026-11-21.json) dosáhl 2/9: Git i non-Git úloha prošla, navazující úlohu přerušila rozpočtová brána po třech požadavcích a šest dalších nezahájila. V non-Git úloze jedno volání příkazu neprošlo validací a model pokračoval k oběma úspěšným kontrolám. [Diagnostika](evals/r4-live-guidance-2026-11-21-diagnostics.json) uvádí pouze povolené bezpečné metriky. Celkem bylo 22 požadavků za odhad 0,0054081 USD; součet pěti běhů je 0,0460897 USD. Jde o malý vzorek, nikoli prokázaný účinek instrukce nebo úspěch celého evaluačního souboru.

[Širší průchod se stejnou instrukcí](evals/r4-live-guidance-expanded-2026-11-21.json) dosáhl 3/9: uspěly Git změna, navazující chat a bezpečné odmítnutí ignorovaného obsahu. Non-Git změna, stale patch a otázkový případ nedokončily očekávaný cyklus; opravu po chybě přerušil rozpočtový strop a poslední dvě úlohy neměly žádný požadavek. V otázkovém případu [diagnostika](evals/r4-live-guidance-expanded-2026-11-21-diagnostics.json) jednou potvrdila přesné zopakování redigované značky historie jako neplatného vstupu `file.read`. Jde o nový konkrétní nález, nikoli důkaz příčiny všech předchozích selhání. Běh měl 61 požadavků, známou spotřebu a odhad 0,0160633 USD; součet šesti běhů činí 0,062153 USD. Rezervace širšího běhu byla 0,2770267 USD ze stropu 0,28 USD. Živá brána zůstává otevřená.

Při sepsání původního reportu z 18. listopadu nový živý eval ještě nebyl spuštěn. Pokusy z 21. listopadu jsou uvedeny výše. `FR-LLM-12` a nové rozšířené měření `AC-O1-25` zůstávají otevřené. Historické rozhodnutí ADR 0007 a původní živé protokoly R2/R3 zůstávají samostatnými důkazy.

Připravený vstup `scripts/eval-r4-model.mjs` vyžaduje současně `--live`, `--confirm-paid-api`, kladné `--max-cost-usd`, celočíselné `--max-requests` nejvýše 100, oba cenové parametry `--input-usd-per-million` a `--output-usd-per-million`, zdroj cen `--pricing-source` a potvrzení aktuální verze `--consent-version openai-api-2026-11-14`. Model je pevně `gpt-6-luna`. Klíč přebírá existující mechanismus pro lokální provider key.

Před každým požadavkem ovladač rezervuje konzervativní odhad vstupu a maximálně 4 096 výstupních tokenů proti celkovému rozpočtu. Neprovádí automatické HTTP retry. Neznámá spotřeba zůstane neznámá a rezervace se neuvolní. Report rozlišuje modelovou chybu, chybu ovladače, chybu poskytovatele a vyčerpání brány rozpočtu. Reasoning tokeny zaznamená jen při dostupných metadatech. Připravený živý vstup vyžaduje budoucí ověření proti skutečnému API.

Výstup obsahuje pouze bezpečné metriky, ID případů a otisky. Dočasný profil používá pro klíč autentizované šifrování s jednorázovým klíčem v paměti. Eval nevydává tuto testovací úschovu za produktovou Windows DPAPI. Po průchodu smaže vlastní dočasné projekty. Cenový odhad musí být posuzován podle konkrétního schváleného profilu.
