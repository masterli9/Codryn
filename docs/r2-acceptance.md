# R2 – technická akceptace

Datum aktualizace: 2026-10-05. Lokální Windows sada `npm.cmd run verify:r2`
prošla i po doplnění bezpečné HTTP diagnostiky. GPT-6 Luna live acceptance
prošel 4/5; OD-04 je uzavřeno autorskou volbou GPT-6 Luna, bez head-to-head
srovnání s Gemini.

| Požadavek | Implementace | Důkaz | Stav / omezení |
| --- | --- | --- | --- |
| Hashovaný textový patch | `backend/core/src/changes`, guarded writer | W1 probe, patch/recovery testy, junction a root-swap regresní testy | implementováno; guarded writer 6/6 a R2 repeatability 20/20 |
| Durable journal a recovery | SQLite migration 4–9, `RecoverR2Run`, `agent_run_details` | `r2-recovery.test.ts`, `r2-persistence.test.ts` | implementováno pro podporované stavy; nejistý shell je `failed` / unknown effect |
| Diff a bezpečný revert | `GetChangeDiff`, `RevertChanges` | R2 Git/non-Git composition test | implementováno |
| Oprávnění a omezený proces | permission service, Job Object runner | permission/runner host testy | implementováno; shell není sandbox |
| Workspace revize a verification | observer, lease, verification store | observer/lease/verification testy | implementováno; fault matrix lze dále rozšířit |
| Celý fake cyklus | `createR2Infrastructure`, CLI scenario | Git/non-Git cycle test | implementováno; repeatability script připraven |
| Provider boundary | OpenAI Responses + Gemini adapters, paced bounded fetch transport | Offline provider contract/context/transport tests; GPT-6 Luna live report | Implementováno; vybraný OpenAI `gpt-6-luna` gate 4/5, status `passed`; Gemini 3.6 2/5 zůstává historickým nevybraným během |
| Výběr modelu | OD-04 + explicitní live entrypoint | GPT-6 Luna acceptance 4/5, usage ve všech pokusech, datovaný report a autorské rozhodnutí | Vybrán GPT-6 Luna; head-to-head s Gemini nebyl proveden ani se pro tuto volbu nevyžaduje |
| Packaged desktop smoke | R2 smoke entrypoint, report a explicitní verifier | hostní `npm.cmd run verify:r2`, `verify-packaged-r0`, `verify-packaged-r2` | ověřeno 5. 10. 2026; R0 a R2 packaged smoke prošly |

## Živá akceptace GPT-6 Luna – 5. října 2026

Pětipokusový běh OpenAI Responses `gpt-6-luna` s `reasoning: none` dokončil
5 pokusů (3 Git / 2 non-Git) a uspěl ve 4. Tím splnil minimum 4/5 v AC-O1-04.
Úspěšné byly jednoduché změny a stale-hash scénáře v obou režimech. Jeden
`test-failure` scénář měl záměrně vloženou souběžnou změnu. Bezpečný návrat ji
odmítl přepsat a skončil `result_verified_conflicted`, takže se podle gate počítá
jako neúspěch. Audit opravil chybné přiřazení `failureOwner` z `model` na
`harness`; výsledek 4/5 se nezměnil.

Všech pět pokusů vykázalo usage. Report spočítal odhad `$0.0051795` při profilu
`$0.10/$0.50` za milion vstupních/výstupních tokenů a rezervoval `$0.0701687`
z limitu `$1`. Nejde o potvrzenou fakturaci. Sanitizovaný report je součástí
review evidence v `docs/evals/r2-live-openai-gpt6-2026-10-05.json` (SHA-256
`12294263CB45569B463E64D525B73699E4B3BA49194DB56D37131B15E573EDB7`).

Celkem proběhlo 27 platných a 0 neplatných tool callů. Součet délky pěti
scénářů byl 89,228 ms (průměr 17.85 s včetně přípravy fixture, orchestrace,
ověření a návratu; nejde o samotnou API latenci).

První pokus spuštěný v síťově omezeném sandboxu skončil před dosažením API
(`EACCES`) a není výsledkem modelu. Následný povolený run testoval stejný model
živě a prošel acceptance gate. Autor zvolil GPT-6 Luna přímo; žádné další
Gemini volání ani tvrzení o srovnávacím vítězství nejsou součástí rozhodnutí.

## Lokální ověřovací průchod 5. října 2026

Hostní `npm.cmd run verify:r2` prošel: typecheck, lint, kontrola závislostí
(217 modulů / 599 závislostí), Vitest (531 prošlo, 3 přeskočeny), provider eval
testy (7/7), live-report testy (6/6), R1 repeatability (1/1), R2 repeatability
(20/20), package a oba packaged smoke. První sandboxový Vitest běh měl čtyři
selhání kolem ukončování procesních stromů; stejný úplný verifier v hostním
režimu prošel.

## Známé hranice

R2 nepřidává produktové renderer UI, vzdálený Git, cloud ani skutečný shell
sandbox. Live gate vyžaduje explicitní provider, model, pozitivní lokální
odhadový limit, input/output pricing se zdrojem a odpovídající lokální klíč z gitignored
`.env`: `R2_OPENAI_API_KEY` nebo `R2_GEMINI_API_KEY`; pro zpětnou kompatibilitu
lze při jednoposkytovatelovém běhu použít `R2_PROVIDER_API_KEY`. Klíč se nesmí
objevit v argv, logu ani reportu. OpenAI live běh použil `gpt-5.6-luna` s
`reasoning: none`, stropem 1 USD a cenou přibližně 0,011 USD podle dřívějšího
záznamu; jeho sanitizovaný report není v repozitáři. Nový Gemini běh použil
`gemini-3.6-flash`, strop 1 USD, odhadové ceny `$0.75/$3.75` za milion tokenů,
minimální rozestup požadavků 15 sekund a až čtyři retry na HTTP 429. Dosáhl
2/5 úspěchů; tři odmítnuté trialy mají usage/náklady neznámé. Report obsahuje
rezervovaný odhad `$0.2951145` a známé vypočtené náklady `$0.0183045`; nejde
o potvrzení faktury ani záruku proti účtování.

Projekt Free Tier ani přesný limit nelze ověřit pouze z lokálního reportu.
Google uvádí limity za požadavky/minutu, vstupní tokeny/minutu a požadavky/den;
aktuální hodnoty závisejí na projektu/modelu a jsou viditelné v AI Studio.
Viz [limity Gemini](https://ai.google.dev/gemini-api/docs/rate-limits) a
[doporučené opakování po 429](https://ai.google.dev/gemini-api/docs/troubleshooting).
