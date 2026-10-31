# R3 bod 4 — backendová perzistence, redakce a úložiště klíčů

Datum: 31. října 2026. Výchozí checkpoint: `5693e86`, větev
`feat/r3-electron-workspace`. Rozsah je backendová část bodu 4 z
`2026-10-11-r3-progress.md`; produktovou autoritou zůstává `PRD_v1.1.md`
a `PROJECT_CONTEXT.md`. Tento zápis nepotvrzuje dokončení R3 ani autorské přijetí.

## Prokázané chyby a úzké opravy

1. **Ztracené zkrácení výstupu příkazu.** Skutečný Windows příkaz vyprodukoval
   více než povolených 1024 bajtů. Worker a `desktop_command_results` nesly
   `truncated=true`, desktopová projekce přesto vracela `false`. Druhá regrese
   prokázala ztrátu označení staršího bloku po jeho odsunutí mimo posledních
   16 bloků nebo aktuálně žádanou stránku. `SqliteDesktopProjectionStore` nyní
   pro souhrn i každou stránku čte již perzistované terminální metadata
   a existenci označeného bloku celého příkazu. Žádná změna IPC kontraktu,
   limitu nebo procesního workeru.
2. **Test klíče po částečně dokončeném uložení.** Šifrovaná obálka verze 2
   se mohla zapsat před selháním DB metadat, která zůstala na verzi 1
   s předchozím `passed`. `get()` správně maskovalo starý výsledek jako
   `not_tested`, ale nové `testKey()` padalo na `R3_STALE_VIEW`.
   Srovnání verze nyní proběhne uvnitř existujícího výhradního přístupu
   nastavení před testem. Není přidán nový koordinační mechanismus.
3. **Verze při odstranění po témže selhání.** Odstranění původně počítalo
   z neaktuální DB verze 1 a zapsalo 2. Nově vychází z verze skutečně
   uložené obálky a zapíše 3; další uložení pokračuje verzí 4. Samostatná
   varianta potvrzuje, že přímé nahrazení bez předchozího testu již správně
   používá verzi 3 a nepřebírá staré `passed`.
4. **Chybějící důvod automatického oprávnění.** Skutečný desktopový průchod
   delší historií odhalil, že `tool_call.permission_decided` mělo obecný
   souhrn a neobsahovalo důvod. Přímá regrese provádí skutečný
   `ToolExecutionHarness` s `ProjectFilesystem` a `SqliteToolCallStore`.
   Před opravou selhala na souhrnu `Událost běhu`. Projekce nyní mapuje
   souhrn `Rozhodnutí o oprávnění` a povoluje pouze skalární
   `permissionResult`, `permissionRuleId`, `permissionReason`. Dosavadní
   limit 4096 bajtů i vynechání obsahu souboru zůstávají ověřené.

Každé změně produkčního chování předcházelo skutečné cílené selhání testu:
`truncated:false` místo `true`, `R3_STALE_VIEW` a verze 2 místo 3.
Pozdější čtvrté opravě předcházel výše popsaný skutečný harness RED.

Soubor a DB metadata podle C2 nejsou jedna atomická transakce. Pokud selže
šifrování, fsync nebo nahrazení souboru před úspěšným replace, testy potvrzují
zachování původního ciphertextu; nepoužije se plaintext fallback. Pokud již replace uspěl a teprve
potom selhala DB metadata, uloženou hodnotou je **nový** klíč. Po vytvoření
nové služby se zkontroluje verze obálky, starý výsledek testu se v pohledu
resetuje a operace test/remove použijí skutečnou verzi uvnitř existujícího
výhradního přístupu. Není slibováno, že libovolné selhání celé `saveKey`
ponechá starý klíč. Čerstvý úspěšný test se přiřadí pouze nové verzi.

## Rozšířený důkaz

- `r3-secret-store.test.ts`: poškozená/future obálka, chybný provider,
  nulová/necelá/nebezpečně velká logická verze, neznámé pole a prázdný
  ciphertext. Čtení ani přepis poškozenou obálku nepřijmou.
- Selhání skutečného Windows nahrazení souboru se simuluje jeho příznakem
  read-only. Předchozí šifrované bajty i verze zůstanou stejné, starý klíč
  lze znovu číst a nezůstane dočasný soubor. Stávající test šifrovací chyby
  zůstává zachován.
- Přímá fsync injekce používá skutečný prototype `FileHandle` a jednorázově
  selhané `sync()` nového dočasného souboru. Před vyvoláním chyby test načte
  reálně zapsaný dočasný ciphertext verze 2, ověří aktivaci právě jedné
  injekce a po chybě potvrdí původní bajty, reopen starého klíče/verze 1
  i úklid dočasného souboru. Prototype se obnovuje v `finally`; žádné nové
  produkční DI nebo API kvůli testu nevzniklo.
- Bariéra uvnitř protector portu drží čekající save; souběžné read/save/version/
  remove se nad skutečnými soubory dokončí v pořadí bez roztržené obálky.
  Test připojení drží výhradní přístup proti save/remove/run lease a i po
  výjimce jej uvolní. Test portu neprovádí síťové volání.
- Junction kořene profilu a adresáře secrets jsou odmítnuté bez změny cíle.
  Reencrypt zachovává logickou verzi; selhání reencrypt ponechá starou obálku.
- `r3-runtime-flow.test.ts`: produkční R3 manager/runtime, skutečná SQLite,
  skutečný Windows command worker a schválení. Modelový adapter je
  deterministický double bez placené sítě. Známý syntetický klíč vrací
  po oddělených deltách; příkaz jej vydává na stdout i stderr. Bariéra
  příkazu se uvolní až po průběžně perzistovaném výstupu, před ukončením
  procesu. Druhá varianta prokazuje pravdivé označení omezeného výstupu.
- Stejný runtime také skutečně čte běžný projektový soubor obsahující marker.
  Test ověří přijetí tohoto obsahu do paměťové tool historie a bezpečný
  `safe_result_json` obsahující pouze klasifikaci výsledku. Toto je důkaz
  hranice perzistence; netvrdí redakci obsahu projektu před odesláním modelu.
- Scan všech souborů vlastního userData kontroluje UTF-8 i UTF-16 podobu
  celého známého markeru, zahrnuje SQLite, živý WAL a logy i obsahovou
  databázovou zálohu. Samostatně kontroluje legacy
  `agent_run_details.result_json`, modelové zprávy, příkazový výstup,
  snapshot, run inspect, historii zpráv, updates a výsledky manageru.
  Nejde o záchyt skutečného Electron IPC; ten patří desktopové části.
- Přerušený modelový stream má prefix prokazatelně uložený před výjimkou.
  Po zavření a novém otevření infrastruktury zůstane bezpečný obsah
  ve stavu `interrupted`, bez surové chybové zprávy s markerem.

## Cílené ověření a omezení

- `npm.cmd exec -- vitest run --project parallel --maxWorkers=1
  backend/infrastructure/test/r3-secret-store.test.ts
  backend/infrastructure/test/r3-projection-store.test.ts
  backend/infrastructure/test/stream-redactor.test.ts
  backend/core/test/provider-settings-service.test.ts
  backend/core/test/r3-model-stream.test.ts`: **32 passed / 0 skipped**.
- `npm.cmd exec -- vitest run --project host-integration
  backend/infrastructure/test/r3-runtime-flow.test.ts`: **6 passed / 0 skipped**,
  42,27 s celkem. Obsahuje i dosavadní Git/non-Git approval/test/diff/revert
  a zrušení čekajícího schválení. Celkem v cílené finální sadě **38 passed**.
- Později doplněný přímý fsync test:
  `npm.cmd exec -- vitest run --project parallel --maxWorkers=1
  backend/infrastructure/test/r3-secret-store.test.ts -t fsync`:
  **1 passed / 18 mimo výběr**, 5,25 s; report `storage/fsync.json`.
- Po doplnění automatického oprávnění celý
  `npm.cmd exec -- vitest run --project parallel --maxWorkers=1
  backend/infrastructure/test/r3-projection-store.test.ts`:
  **8 passed / 0 skipped**, 6,03 s; report `storage/permission-projection.json`.
- Machine-readable reporty:
  `.r3-artifacts/2026-10-31-step4/storage/backend-parallel.json`
  a `backend-runtime.json`; artefakty jsou lokální a ignorované Gitem.
- Jeden dřívější souběžný cílený běh skončil 29 passed / 1 failed na
  `R3_SECRET_UNAVAILABLE:ACL_VERIFY` během prvního ukládání ve Windows.
  Samostatná předchozí matice i konečný běh s jedním workerem prošly;
  příčina pětisekundového hostního ověření ACL není potvrzena. Nejde o
  omluvení prokázaných produktových regresí ani tvrzení o opraveném timeoutu.
- Protector těchto testů je výslovně port double; žádné XOR testovací
  šifrování se nepřidává do produkce. Testy volají skutečnou Windows
  kontrolu ACL, ale nenahrazují skutečný safeStorage/DPAPI restart ani
  packaged Electron důkaz. Ty patří samostatnému desktopovému běhu.
- Read-only audit procesních zdrojů nevedl k žádné produkční změně. První
  desktopový crash RED zabil PID spouštěče místo skutečného Electron mainu;
  přesné měření identity tuto chybu observeru odhalilo. Opravené main-only
  měření a nový package dokládá desktopová část, nikoli Node hostní test
  této zprávy. Zabalený C# command job měl při auditu stejný SHA-256 jako
  zdroj. Po úzké opravě projekce byl backend znovu frozen a slot předán
  desktopové části pro čerstvé sestavení.
- Kompletní testovací sada, typecheck, lint, dependency gate, finální package
  a osobní kontrola autora nejsou výsledkem této dílčí zprávy; ověřuje je
  koordinující agent v navazující společné bráně. Žádný commit, staging,
  push, PR, změna závislostí ani skutečný provider call v této části nevznikl.
