# R3 — ověření čtvrtého kroku

Datum: 31. října 2026. Výchozí HEAD `5693e86`, větev
`feat/r3-electron-workspace`. Rozsah je bod 4 z
[plánu pokračování](2026-10-11-r3-progress.md). Dva implementační subagenti
pracovali s čistým kontextem a odděleným vlastnictvím souborů; další agent
provedl nezávislou revizi. Přerušení limitem bylo obnoveno u rozpracovaných
úkolů, bez opakování již dokončených kroků.

## Opravené chování

- Zkrácení příkazového výstupu se promítá z uloženého výsledku i starších
  označených bloků do souhrnu a všech stránek výstupu.
- Pokud se nový šifrovaný klíč zapíše před selháním DB metadat, testování
  a odstranění pracují se skutečnou verzí obálky. Staré úspěšné ověření
  připojení se nepřebírá k novému klíči.
- Automatické rozhodnutí o oprávnění má v historii čitelný souhrn, výsledek,
  identifikátor pravidla a důvod. Skalární seznam a limit detailu zůstaly
  zachovány; obsah čteného souboru se tím do historie nepřidává.

Každá produkční oprava navázala na skutečně selhanou regresi. Neměnil se
procesní worker, IPC kontrakt, oprávnění rendereru ani schválený vzhled.
Podrobnosti a dílčí výsledky jsou v
[backendovém reportu](2026-10-31-r3-step4-storage.md) a
[Electron reportu](2026-10-31-r3-step4-electron.md).

## Hranice důkazů

- Backendové scénáře používají skutečné služby, SQLite, soubory a Windows
  příkazy. Secret-store fault/race testy používají testovací port šifrování,
  skutečnou kontrolu Windows ACL a přímou injekci selhání `FileHandle.sync()`.
  Samy o sobě nepotvrzují systémové šifrování v Electronu.
- Cílené Electron scénáře používají nově zabalenou aplikaci, skutečný renderer,
  preload, IPC, safeStorage/DPAPI a restart profilu. Odpovědi modelu jsou pevné
  testovací scénáře; neproběhlo placené API volání ani použití reálného klíče.
- Syntetický klíč je rozdělen do modelových delt a vrácen skutečným příkazem
  na stdout i stderr. Kontrola zahrnuje průběžně uložený výstup, živý WAL,
  odpovědi a aktualizace na IPC/preload hranicích, DOM, logy a soubory profilu.
  Soubory se hledají v UTF-8 i UTF-16LE. Během chodu lze vynechat pouze konkrétní
  zamčené Chromium LOCK; po zavření se kontroluje celý profil bez výjimek.
  Vstup uložení klíče není vydáván za únik v odpovědi.
- HTML v modelové zprávě i výstupu příkazu zůstává textem. DOM regrese
  kontrolují 101 aktivit; skutečný Electron průchod vytvořil 147 událostí
  běžnými nástroji, včetně automatických oprávnění, historie a odděleného chatu.
- Externí pozorovatel pádu ověřuje skutečný hlavní Electron PID pomocí
  `process.pid`, cesty executable a Browser metriky. U příkazu navíc kontroluje
  `hostPid` workeru a DB časovou identitu procesů. Zabije pouze hlavní proces
  a měří od okamžiku před zabitím. Úklid následuje až po měření, jednotlivě
  podle ověřené identity; nepoužívá stromové zabití.

První test chybně ukončil Windows `cmd.exe` launcher z `app.process().pid`.
Jeho přeživší potomci nebyli důkazem chyby backendového monitoru. Tento
předpoklad byl opraven před platným měřením; produkční procesní kód se kvůli
tomu neměnil. Původní neúspěšné artefakty zůstaly zachovány. První běh nad
opraveným pozorovatelem následně odhalil předčasnou testovou kontrolu po
asynchronním založení chatu; čekání nyní ověřuje zobrazení nového chatu.

## Závěrečné kontroly

| Kontrola | Skutečný výsledek |
| --- | --- |
| Úplná běžná sada `npm.cmd test` | exit 0, 656 passed / 3 skipped; 94 souborů passed / 2 skipped; 256,07 s |
| `npm.cmd run typecheck` | exit 0, všechny workspaces |
| `npm.cmd run lint` | exit 0, žádné chyby/varování |
| `npm.cmd run check:deps` | exit 0, 307 modulů / 939 vazeb, žádné porušení |
| Nový package a nezávislé ověření build identity | exit 0; hash zdrojů, executable i ASAR odpovídá |
| Pád během příkazu | worker, cíl a potomek ukončeni za 97,339 ms; restart bez opakování |
| Pád během modelového streamu | hlavní proces ukončen za 0,381 ms; restart bez trvalého streaming/replay |
| Secret/IPC/SQLite/WAL a zkrácení výstupu | úspěšný scénář; poslední úplný scan 46 souborů, obě kódování, 0 vynechaných |
| Delší aktivita/HTML | cílené opakování 1 passed; 147 událostí, klávesnice, historie a oddělený chat |
| Obnova čekajícího schválení | cílený test 1 passed, žádné staré spustitelné schválení |

První tři Electron scénáře prošly v posledním společném běhu, který měl
celkově 3 passed / 1 failed kvůli nepovinnému screenshot capture v historii.
Po odstranění této vedlejší kontroly prošlo cílené opakování čtvrtého scénáře.
Nejde o tvrzení o 4/4 v jediném příkazu; tři nezměněné úspěšné scénáře se znovu
nespouštěly. Screenshot timeout a původní neplatný launcher crash jsou zachovány
v `electron/red-attempt/` a reportech, nikoli zaměněny za úspěšné běhy.

Úplná běžná sada a statické brány běžely po freeze společného kódu, bez souběhu
těžkých hostních testů. Tři přeskočené testy jsou dosavadní opt-in packaged
R0/R2 smoke a souborový symlink scénář vyžadující Windows oprávnění fixture.
Nové adverse Electron testy jsou opt-in a jejich skutečné výsledky jsou uvedeny
samostatně výše. `full-tests-final.json/.log`, `typecheck-final.log`,
`lint-final.log` a `check-deps-final.log` zachycují společnou závěrečnou bránu.

Aktuální build nezávisle potvrdil koordinátor pomocí `verifyBuild()`:

- source SHA-256: `401308413fd299b3713a48f00088fd4b038e2002c95ceae8f739f96774ff29f2`
- ASAR SHA-256: `432d8a1407cffa1f099611108587d36125bc610b3e926f4093503b7e2b823d1d`
- executable SHA-256: `f624ba032f779875481b7c681807374c3bf5fc62a10f8c20f658cb3e1694e083`

Strojové reporty a screenshoty jsou lokálně v
`.r3-artifacts/2026-10-31-step4/`, mimo Git. Revize pozdních změn našla tři
mezery v testovém důkazu: chybějící UTF-16LE scan, úplný scan po posledním
restartu/zavření a očekávání starého názvu pole oprávnění. Implementer je
opravil před závěrečným během. Stejný nezávislý reviewer omezeným opakovaným
review všechna tři zjištění uzavřel, zkontroloval skutečné výsledky a nenašel
další důležitý problém. Celkovou běžnou sadu a statické brány potvrzuje
koordinátor samostatně.

## Co zůstává

Nový package byl nutnou podmínkou důkazu tohoto kroku. Celý bod 5 tím není
splněný: zbývají všechny packaged secret/workflow Git/non-Git/cancellation
fáze, všech 20 UI opakování a celá brána `verify:r3`. Starší připravené testy
nelze automaticky vydávat za průchozí jen podle nových cílených scénářů.
E3 dokumentace, pět čerstvých live pokusů, osobní autorský checklist a přijetí
R3 zůstávají samostatné. Tento krok nemění rozsah R4/R5 ani neprovádí push,
PR nebo merge.
