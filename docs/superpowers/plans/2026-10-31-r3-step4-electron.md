# R3 bod 4 – adverse Electron a DOM důkazy

Rozsah: pokračování schváleného bodu 4 nad `feat/r3-electron-workspace`,
výchozí HEAD `5693e86`. Nejde o dokončení bodu 5, E3 ani autorské přijetí.
Backendové opravy/verze/fault/race a jejich testy popisuje samostatný storage report.

## Co testy skutečně ověřují

- Nový `tests/desktop/r3-adverse.test.ts` používá skutečný Forge Electron,
  běžný renderer, preload, IPC, aplikační služby a SQLite. Připravené starší
  `r3-lifecycle.test.ts` / `r3-secrets.test.ts` nejsou vydávány za nový důkaz.
- Main-only pevné testovací scénáře rozšiřují existující test provider;
  neexistuje renderer IPC pro vlastní shell/cestu ani placené API volání.
  `stream` a `interrupted-model` mají invocation audit pro zjištění replaye.
- Externí pozorovatel běží ve Vitestu mimo Electron. Zaznamenává PID a čas
  vytvoření mainu, PowerShell workeru, cílového Node a potomka v .NET UTC ticks.
  Skutečný main ověří přes `app.evaluate`, Browser metriku a známý executable;
  předaný worker hostPid musí odpovídat mainu. Pro měření zabíjí pouze main PID.
  Cleanup po měření používá jednotlivé procesy s ověřenou identitou a otevřeným
  handle; nepoužívá `/T`. Znovu použitý nebo neověřený PID se neukončuje.
- Stejný profil po restartu musí mít `interrupted`, zachovaný potvrzený text,
  žádný `streaming`, žádnou starou spustitelnou approval a žádný nový tool/model.
- Secret scénář úmyslně vrací syntetický uložený klíč v rozděleném model textu
  i skutečném stdout/stderr. Před uvolněním latch kontroluje uložené chunks,
  stále běžící příkaz, SQLite včetně existujícího WAL, raw main odpovědi/update,
  skutečné preload odpovědi/update, DOM a zachycené logy. Sken pokračuje po
  dokončení i restartu; zahrnuje legacy `agent_run_details.result_json`.
  `settings.saveKey` vstup se necapturuje: přenos nově zadané syntetické hodnoty
  do mainu je nutný. Zpět do rendereru patří pouze metadata/redigovaný text.
  Bezpečný JSON capture je místním testovým exportem, produktový obecný export
  v R3 není zaveden.
- Test malé 1024B command kvóty kontroluje dvě truncation hlášky v UI i
  přetrvání informace po restartu. Backend metadata opravuje storage část.
- `long-activity` vytváří skutečné file.read události běžnými službami;
  nepoužívá seed databáze. Zkouší Enter na stránkování a detailu rozhodnutí,
  historický běh, oddělený chat a inertní HTML v modelové odpovědi.
- DOM regrese navíc izolovaně prokazují všech 101 aktivit, zachování nejstaršího
  rozhodnutí přes snapshot refresh, žádný únik při změně chatu, inertní script,
  image handler/javascript link a obě hlášky zkrácení výstupu.

## Ověření a omezení

- DOM: `npm.cmd exec -- vitest run --project parallel apps/desktop/test/run-detail.test.tsx apps/desktop/test/workspace.test.tsx`
  prošlo **16/16**. První sandboxový pokus skončil EPERM při Vite temp rename
  před načtením testů; hostní opakování výše je platný výsledek.
- Desktop a test-support typecheck a scoped ESLint prošly před balením.
- Čerstvé `npm.cmd run package` po finálním backend freeze prošlo. Následné
  `verifyBuild()` před každým desktop během ověřilo exe, ASAR i zdrojový hash.
  Konečný build v `.r3-artifacts/2026-10-31-step4/electron/build.json`:
  - sourceHash `401308413fd299b3713a48f00088fd4b038e2002c95ceae8f739f96774ff29f2`
  - exeHash `f624ba032f779875481b7c681807374c3bf5fc62a10f8c20f658cb3e1694e083`
  - asarHash `432d8a1407cffa1f099611108587d36125bc610b3e926f4093503b7e2b823d1d`
  - Electron 43.4.0, Windows, systémový Node 24.19.0.
- Poslední běh celého nového adverse souboru měl **3 passed / 1 failed**:
  command crash, model crash a secret/persistence/truncation prošly. Jediný
  fail byl nepovinný screenshot capture timeout; byl odstraněn z testu.
  Poslední cílené opakování long-activity poté prošlo **1 passed / 3 deselected**.
  Nejde o tvrzení o jediném společném běhu 4/4. Tři již zelené nezměněné scénáře
  nebyly potřetí opakovány. Následující legacy approval test prošel
  **1 passed / 3 deselected** a nyní také zabíjí ověřený skutečný main.

| Scénář | Skutečný výsledek | Místní důkaz pod `.r3-artifacts/2026-10-31-step4/electron/` |
| --- | --- | --- |
| Command stream crash | main exit pozorován za 18.251 ms; worker + target + potomek pryč za 97.339 ms od kill; všichni Electron potomci pryč; restart interrupted, text zachován, žádný replay ani pozdní marker | `crash-stream.json`, zelená příslušná assertion v `vitest-electron.json` |
| Model stream crash | main exit pozorován za 0.381 ms; 2 potvrzené zprávy zachovány, žádný streaming ani replay po restartu | `crash-interrupted-model.json`, zelená příslušná assertion v `vitest-electron.json` |
| Syntetický secret | 39 dostupných souborů za běhu včetně SQLite/WAL; 26 raw main odpovědí, 45 main updates, 45 preload updates a 2 skutečné preload odpovědi; žádný marker; legacy result a command output čisté; obě truncation hlášky i po restartu | `secret-boundaries.json`, zelená příslušná assertion v `vitest-electron.json` |
| Úplný scan po posledním restart-close | 46 souborů UTF8 i UTF16LE, žádný marker, žádný přeskočený soubor | `secret-final-close-scan.json` |
| Dlouhá aktivita/HTML | 147 skutečných událostí; nejstarší automatické rozhodnutí a přesný permissionReason otevřené Enterem; původní historický běh znovu dostupný; nový chat nemá cizí aktivitu; HTML inertní | `long-activity.json`, `vitest-long-activity.json` |
| Legacy approval crash | main exit pozorován za 0.578 ms; restart interrupted, žádná stará approval ani spuštěný command owner | `crash-approval.json`, `vitest-approval.json` |

Měření main exit je externí kontrola existence skutečného main procesu s
10ms pollingem; exit Windows `cmd.exe` launcheru se eviduje zvlášť. Limit
2 sekund pro worker/potomky začíná okamžikem kill, nikoli opožděným exit eventem.
Za běhu se smí přeskočit pouze zamčený Chromium `Local Storage/leveldb/LOCK`
nebo `Session Storage/LOCK`, nikoli SQLite/WAL či secret soubory. Poslední
stream scan zaznamenal jeden takový LOCK. Po zavření je scan úplný bez výjimek.
Log capture hook byl aktivní; během zachyceného okna nevznikl žádný log záznam.
Bezpečný JSON capture je testový export, nikoli nový produktový export.

## Zjištěné chyby a opravy

První red pokus je zachován v `electron/red-attempt/` se svou starší build
identitou. Původně zabíjel `app.process().pid`, který je v této Windows
Playwright konfiguraci **cmd.exe launcher**, nikoli Electron main. Přeživší
worker po takovém kill není důkaz backend chyby. Přesná diagnostika ověřila
skutečný main i předaný hostPid a opravená main-only zkouška prošla; produkční
procesní runner se neměnil. Stejný falešný kill byl opraven i v původním
approval hard-restart testu.

Skutečný projekční nález z 147 živých událostí byl odlišný: backend nezobrazoval
typ `tool_call.permission_decided` a zahazoval jeho permissionResult/rule/reason.
Storage část přidala bounded projekci s regresí; Electron nyní ověřuje skutečný
důvod. Další harness opravy byly rozlišení FILETIME/UTC ticks, Chromium LOCK
scan a čekání na skutečně načtený nový chat před assertion izolace. Tyto opravy
nevyžadovaly změnu produktu ani povolených oprávnění.

Starý připravený `r3-secrets.test.ts` se zde nepouštěl; obsahuje historická
očekávání uppercase `[REDACTED]` a neomezený scan Chromium profilu za běhu.
Tyto staré testy se nesmějí vydávat za průchod této nové evidence. Při bodu 5
je nutné jejich harness sjednotit s aktuálním chováním a skutečně je spustit.

Přímé existující Playwright `_electron` API je použité pro spuštění a zabití
vlastního Electron hostitele. Tuto lifecycle funkci Playwright MCP neposkytuje;
nejde o tvrzení o celkové nedostupnosti MCP po celou session.
Sandbox/contextIsolation/CSP/fuses ani schválený vzhled se neuvolňují.
Celá běžná sada a společné statické brány se ověřují až nad společným výsledkem;
dvacet UI workflow, všechny packaged fáze a live/autorská akceptace zůstávají
mimo tento díl.
