# R3 — bod 5: čerstvý package a úplné UI průchody

Výchozí commit: `eee08b959111df394f24593450ae7591a623ed7e`, větev
`feat/r3-electron-workspace`. Vedle sjednocení secrets testu a synchronizace
lifecycle testu přibyla úzká oprava pořadí busy kontroly v run manageru.

## Reprodukce a úzká oprava

Cílený původní test nad ověřeným dosavadním package: **1 failed / 1 passed**,
22,56 s, chyba `EBUSY` při závěrečném scanu stále otevřeného Chromium profilu.
Rozdíl `[REDACTED]` proti skutečnému `[redacted]` sám neselhal: Playwright
u použitého textového matcheru nerozlišuje velikost písmen. Text očekávání
je sjednocen, ale není vydáván za příčinu selhání.

Test používá existující `scanForMarker` z bodu 4. Při běhu připouští pouze
`EBUSY` konkrétních Chromium `Local Storage/leveldb/LOCK` a
`Session Storage/LOCK`; SQLite, WAL, ciphertext a všechny ostatní soubory
se kontrolují dál. Po zavření v obou `finally` následuje úplný scan UTF-8
i UTF-16LE bez vynechání zamčených souborů. Zůstaly kontroly uloženého
legacy výsledku, zpráv a command výstupu i skutečný restart/nahrazení/odstranění
klíče. Syntetický marker nepoužívá placené API ani skutečný klíč.

Cílené opakování po opravě: **2 passed / 2**, 18,75 s, exit 0.

## Závěrečná brána

První čerstvý `node scripts/verify-r3.mjs` skončil neúspěchem v desktopové
fázi: **29 passed / 1 failed**, 478,29 s. Prošly všechny statické kontroly,
656 běžných testů (3 skipped), provider eval 8/8, live-report testy 7/7,
R1 repeatability 1/1, R2 repeatability 20/20 a čerstvé balení. Všech 20 UI
workflow prošlo, ale lifecycle test nejprve narazil na race při vytváření
nového chatu: vyplnil starý composer před načtením nového snapshotu.
Přibyla synchronizace na skutečný nadpis nového chatu, bez změny assertion
o zachování konceptu, busy stavu, schválení nebo deny.

Tím se odkryla produkční chyba: demo preflight proběhl dřív než busy guard
v SQLite a nad již upraveným souborem prvního běhu vracel `R3_INPUT_INVALID`.
Cílený infrastrukturní test tuto situaci reprodukoval přes selhávající
preflight při aktivním běhu: **1 failed / 3 passed**, očekávaný
`R3_PROJECT_BUSY`, skutečný `R3_INPUT_INVALID`. Run manager nyní po kontrole
chatu/projektu a pod stejným operation lease odmítne aktivní projekt ještě
před provider lease a preflightem. Idempotentní duplicate a request mismatch
zůstávají před touto kontrolou; původní SQLite guard se neruší. Cílený důkaz
po opravě: **4 passed / 4**, 6,51 s; zahrnuje duplicate, mismatch a jiný projekt.

Nezávislé review této opravy zachytilo souběžný případ, kdy dva požadavky
projdou prvním lookupem ještě před založením běhu. Dvě nové deterministické
bariérové regrese nad skutečnou SQLite nejprve skončily **2 failed / 4 passed**:
nový guard vracel busy i shodnému opakování nebo změněnému obsahu stejného ID.
Guard proto při aktivním běhu znovu načte request ID a porovná celý vstup přes
stávající `sameInput`; shodný vrátí jako duplicate, odlišný jako mismatch,
nový požadavek jako busy. Po opravě cílená sada prošla **6/6**, 8,21 s.
Omezené opakované review tento nález uzavřelo bez nového důležitého nálezu.

První log a neúspěšný gate report zůstávají v ignorovaných
`.r3-artifacts/2026-10-31-step5-gate.log` a
`.r3-artifacts/2026-10-31-step5-first-gate.json`. Kvůli produkční změně je nutné
znovu sestavit package a zopakovat relevantní úplné UI důkazy; první 20/20 se
nevydává za výsledek nad finálním buildem.

Nová úplná brána po uzavřeném review: typecheck, lint a check:deps prošly
(307 modulů / 942 vazeb); běžná sada **658 passed / 3 skipped**, 94 souborů
passed / 2 skipped, 246,47 s. Provider eval 8/8, live-report testy 7/7 a
R1 repeatability 1/1 a R2 repeatability 20/20 prošly. Čerstvý package prošel;
desktopová sada prošla **30/30 ve čtyřech souborech**, 573,39 s, včetně všech
20 UI workflow a všech adverse/lifecycle/secrets scénářů. Tento druhý plný
gate následně selhal v poslední z osmi packaged fází. Výstup je v
`.r3-artifacts/2026-10-31-step5-final-gate.log`.

Build identity druhého průchodu po produkční opravě (před pozdějším
doplněním smoke fixture):

- source SHA-256 `a76c7f2171cee50c1b0db2b0889704ad89458146a6eb6e99d2c82869eafb2bd4`;
- ASAR SHA-256 `79934143872590e48c0f67ebca1883652a4e4860e0582f3b2b7453b64f6d8485`;
- EXE SHA-256 `beebdecd2275635f5c17a9d3668713786d077bf49b6e8cf5be3c943867c1bc71`.

Packaged store/reopen/replace/remove/removed/workflow-git/workflow-non-git
prošly, cancel skončil `R3_SMOKE_INTERNAL`. Konkrétní příčina: fixture psala
jen 25 znaků stdout/stderr, ale `StreamRedactor` zadržuje alespoň 128 znaků
kvůli redakci tajemství napříč chunky. Poll na viditelný prefix proto nikdy
nezačal včas zastavovat. DB potvrzuje až závěrečné zrušení při shutdown,
21286 ms, `treeStopped:true`; pětisekundový late marker už existoval.
Nešlo o úspěšnou cancellation fázi a tento druhý gate zůstává failed.

Úzká oprava doplnila pouze 256 teček do každého proudu syntetického child
skriptu v `run-r3-smoke.ts`; stejný princip používají adverse fixtures bodu 4.
Žádný deadline, redaktor, PID kontrola, treeStopped nebo late-marker podmínka
se neoslabuje. Scoped review nemělo nález. Neúspěšný gate je zachován v
`.r3-artifacts/2026-10-31-step5-second-gate.json`; profil
`.r3-artifacts/packaged-8NUsvh` uchovává příčinnou stopu.

Schválené navazující ověření je explicitní agregát fází: nový package,
všech 8 R3 packaged fází, packaged R0/R2 a znovu kompletní desktop 30/30
včetně všech 20 UI pokusů. Nezměněné běžné/static/repeatability fáze se
potřetí neopakují; jejich výsledky výše patří druhému gate před změnou
pouze syntetické smoke fixture. Agregát nebude vydáván za úspěšný jednotlivý
příkaz `verify:r3`. Aktuální výstup je
`.r3-artifacts/2026-10-31-step5-final-phases.log`.

Host: Windows 11 Home, release `10.0.26300`, Node `24.19.0`.

## Finální package a navazující fáze

Po doplnění pouze smoke fixture vznikl nový package:

- source SHA-256 `82eebf763379e3d9d094e7f97359968dddc095d308f5c16e563319836238b388`;
- ASAR SHA-256 `630361f2b1bb19b6757094eb5f2dfde2a2c1b70af56700fcdf7e48c6dc445773`;
- EXE SHA-256 `6aae3c142a09d1bf0d71307aec50121d9bca412a3c717a3e5513d6b3cf4e1224`.

Všech osm R3 packaged fází prošlo nad tímto buildem; report
`.r3-artifacts/packaged-FYnII3/r3-report.json` a jednotlivé `r3-<phase>.json`.
Cancel má `cancelTreePassed:true`, všechny fáze `noPlaintextPassed:true` a
`passed:true`. Runtime z reportu: Electron `43.4.0`, vestavěný Node `24.18.1`,
`win32`; ověřovací příkazy projektu používají systémový Node `24.19.0`.
Packaged R0 prošel s reportem `.r0-artifacts/packaged-ixXNWV/r0-report.json`,
packaged R2 s `.r2-artifacts/packaged-gK3yRS/r2-report.json`.

Po skončení všech R3 packaged exe proběhl navíc úplný scan profilu:
**53 souborů, UTF-8 i UTF-16LE, žádný nález a 0 vynechaných souborů**.
Zahrnuje SQLite, další existující databázové soubory, ciphertext a reporty;
nenahrazuje skutečný restart/decrypt doložený samostatnými fázemi.
Strojový doklad: `.r3-artifacts/2026-10-31-step5-packaged-postexit-scan.json`.

Nové kompletní desktopové ověření nad stejným finálním package prošlo
**30/30 ve čtyřech souborech**, 401,71 s, v jediném příkazu. Všech 20 UI
workflow má samostatný úspěšný JSON: Git profil `.r3-artifacts/git-sX8KCL`,
non-Git `.r3-artifacts/non-git-6Dbmn6`, oba `attempt-1.json` až
`attempt-10.json`. Fixture a profil zůstaly mezi pokusy zachované, návrat
provádělo UI a Git kontroly zachovaly index/HEAD/staged/unstaged/untracked.

Agregát `.r3-artifacts/2026-10-31-step5-final-phases.json` má všech pět
navazujících fází passed a shodný build před/po běhu. Explicitní `kind`
uvádí, že nejde o úspěšnou jednotlivou invokaci `verify:r3`. Výstup batch
skriptu skončil exit 0. Původní `.r3-artifacts/gate.json` zůstává failed.

Závěrečná inspekce `.r3-artifacts/2026-10-31-step5-inspection.json` ověřila
identitu aktuálních zdrojů/ASAR/EXE, přesně 20 reportů, znovu úplný scan
53 packaged souborů bez výjimek, font/licenci a obsahovou SHA-256 shodu všech
pěti vybalených produkčních workerů se zdroji (dva C#, tři PowerShell).
Celý tento navazující batch a inspekce tedy patří finálnímu buildu uvedenému
výše, nikoli některému z předchozích package.

Každá dílčí brána má limit 600 s, packaged exe 30 s
a jednotlivý desktop test 60 s. Reference Git a non-Git mají po 10 pokusech
nad zachovaným profilem a fixture; návrat zajišťuje UI.

Tento záznam není čerstvý live GUI protokol, autorské přijetí ani uzavření E3.

Uzavření koordinátorem 1. listopadu 2026: po přerušení limitem znovu ověřena
aktuální build identita a strojový agregát i inspekce. Nezávislý reviewer ještě
před přerušením přepočítal 20 unikátních skutečných běhů, zkontroloval všech
53 souborů i pět worker hashů a potvrdil finální desktopový výsledek.
Dokument neobsahuje nedokončené tvrzení o běžící fázi. Kontrola typů desktopu
po poslední změně smoke fixture prošla také při závěrečném uzavření.
Závěrečný ESLint všech pěti změněných zdrojových a testových souborů prošel
bez chyb či varování.
