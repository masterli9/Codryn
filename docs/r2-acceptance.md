# R2 – technická akceptace

Datum implementačního průchodu: 2026-09-07. Stav popisuje skutečně ověřené
lokální kontroly a autorizovaný OpenAI live gate; packaged Windows build a
živý Gemini běh zůstávají otevřené.

| Požadavek | Implementace | Důkaz | Stav / omezení |
| --- | --- | --- | --- |
| Hashovaný textový patch | `backend/core/src/changes`, guarded writer | W1 probe, patch/recovery testy | implementováno; host gate opakovat v čistém checkoutu |
| Durable journal a recovery | SQLite migration 4–9, `RecoverR2Run`, `agent_run_details` | `r2-recovery.test.ts`, `r2-persistence.test.ts` | implementováno pro podporované stavy; nejistý shell je `failed` / unknown effect |
| Diff a bezpečný revert | `GetChangeDiff`, `RevertChanges` | R2 Git/non-Git composition test | implementováno |
| Oprávnění a omezený proces | permission service, Job Object runner | permission/runner host testy | implementováno; shell není sandbox |
| Workspace revize a verification | observer, lease, verification store | observer/lease/verification testy | implementováno; fault matrix lze dále rozšířit |
| Celý fake cyklus | `createR2Infrastructure`, CLI scenario | Git/non-Git cycle test | implementováno; repeatability script připraven |
| Provider boundary | OpenAI Responses + Gemini adapters, bounded fetch transport | provider contract/context/transport testy; OpenAI live gate | implementováno; OpenAI live ověřen, Gemini blokuje Free Tier rate limit/quota |
| Výběr modelu | eval report + explicitní live entrypoint | `verify:r2:live`: OpenAI 4/5, gate passed | OpenAI `gpt-5.6-luna` je prakticky ověřený kandidát; dvouproviderové srovnání čeká na Gemini |
| Packaged desktop smoke | R2 smoke entrypoint, report a explicitní verifier | `verify-packaged-r2`, `tests/packaged/r2-smoke.test.ts` | připraveno; aktuální host skončil Chromium GPU chybou, čistý packaged důkaz zbývá |

## Známé hranice

R2 nepřidává produktové renderer UI, vzdálený Git, cloud ani skutečný shell
sandbox. Live gate vyžaduje explicitní provider, model, pozitivní cost cap,
input/output pricing se zdrojem a odpovídající lokální klíč z gitignored
`.env`: `R2_OPENAI_API_KEY` nebo `R2_GEMINI_API_KEY`; pro zpětnou kompatibilitu
lze při jednoposkytovatelovém běhu použít `R2_PROVIDER_API_KEY`. Klíč se nesmí
objevit v argv, logu ani reportu. OpenAI live běh použil `gpt-5.6-luna` s
`reasoning: none`, stropem 1 USD a skutečnou cenou přibližně 0,011 USD.
Gemini live běh byl zastaven po odpovědi poskytovatele o překročení Free Tier rate limitu/quoty.
