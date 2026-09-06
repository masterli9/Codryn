# R2 – technická akceptace

Datum implementačního průchodu: 2026-09-06. Stav popisuje skutečně ověřené
lokální kontroly; živý provider a packaged Windows build nebyly v této relaci
autorizovány ani dokončeny.

| Požadavek | Implementace | Důkaz | Stav / omezení |
| --- | --- | --- | --- |
| Hashovaný textový patch | `backend/core/src/changes`, guarded writer | W1 probe, patch/recovery testy | implementováno; host gate opakovat v čistém checkoutu |
| Durable journal a recovery | SQLite migration 4–9, `RecoverR2Run` | `r2-recovery.test.ts` | implementováno pro podporované stavy |
| Diff a bezpečný revert | `GetChangeDiff`, `RevertChanges` | R2 Git/non-Git composition test | implementováno |
| Oprávnění a omezený proces | permission service, Job Object runner | permission/runner host testy | implementováno; shell není sandbox |
| Workspace revize a verification | observer, lease, verification store | observer/lease/verification testy | implementováno; fault matrix lze dále rozšířit |
| Celý fake cyklus | `createR2Infrastructure`, CLI scenario | Git/non-Git cycle test | implementováno; repeatability script připraven |
| Provider boundary | OpenAI Responses + Gemini offline adapters | provider contract/context testy | implementováno offline, bez live API důkazu |
| Výběr modelu | eval report + explicitní live entrypoint | `eval:r2-providers`, `verify:r2:live` | neověřeno; není vybrán vítěz |
| Packaged desktop smoke | R2 smoke entrypoint a report | `verify-packaged-r2`, skipped test bez buildu | připraveno, build/runtime důkaz zbývá |

## Známé hranice

R2 nepřidává produktové renderer UI, vzdálený Git, cloud ani skutečný shell
sandbox. Live gate vyžaduje explicitní provider, model, pozitivní cost cap a
session-only `R2_PROVIDER_API_KEY`; klíč se nesmí objevit v argv, logu ani
reportu. `R2_PROVIDER_API_KEY` nebyl v této implementaci použit.
