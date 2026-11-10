# R3 E3 — doplnění stavů v zabalené aplikaci

Dne 8. listopadu 2026 proběhl offline průchod skutečnou zabalenou Windows aplikací na větvi `feat/r3-electron-workspace`. Navazuje na [původní vizuální průchod](2026-11-01-r3-e3-visual.md) a návrhové obrazovky v [§ 7 specifikace](../specs/2026-10-11-r3-electron-workspace-design.md#7-pracovní-plocha-a-stavy). Prvních 42 snímků je z původního balíčku B5, dalších 12 dokládá opravené stavy z nového sestavení.

## Zachycené stavy

| Stav | Pozorování |
| --- | --- |
| Otevřený projekt bez chatů | Po zrušení automatického dialogu zůstal projekt vybraný, navigace neměla chat a založení nového chatu bylo dostupné. |
| Dokončený neověřený běh a prázdný diff | Offline scénář provedl čtení bez úprav nebo kontrol. Panel zobrazil „Neověřeno“, existující prázdnou sadu bez řádků diffu a neaktivní návrat sady. |
| Nepovedené připojení k chatu | Po načtení rendereru a výběru projektu způsobilo jednorázové odmítnutí připojení chatu ve spojení mezi procesy banner s tlačítkem „Obnovit chat“. |
| Obnovený chat | Enter na předem zaměřeném tlačítku „Obnovit chat“ použil původní obsluhu spojení a načetl jedinou kopii uloženého zadání. |
| Obecná chyba | Výjimka z testovací náhrady výběru složky prošla produkčním převodem na bezpečnou chybu `R3_INTERNAL`. Banner ukázal „Operaci se nepodařilo dokončit. Data se automaticky nemažou.“ |
| Nedostupný klíč | Neplatný dokument v izolovaném chráněném úložišti vyvolal „Chráněné úložiště není dostupné“. Test připojení byl neaktivní. |
| Nedostupný projekt | Dočasná složka byla po uzavření aplikace přesunuta a profil znovu otevřen. Historie zůstala čitelná, nový chat a odeslání úkolu byly neaktivní. |

Každý stav má snímky **900 × 640, 1280 × 720 a 1440 × 900** ve světlém i tmavém motivu. Agregát má **42 PNG**, shodu změřeného a požadovaného rozměru i motivu ve všech 42 případech, žádné vodorovné přetečení dokumentu a **0 chyb stránky či konzole**. Každý snímek má v protokolu SHA-256. Nástrojem pro řízení skutečného procesu byl již instalovaný Playwright Electron a stávající pomocník pro oddělený profil. Nebyly použity klíče ani placená volání.

`verifyBuild()` před a po použitých pokusech potvrdil shodný zdrojový hash `82eebf763379e3d9d094e7f97359968dddc095d308f5c16e563319836238b388`, ASAR `630361f2b1bb19b6757094eb5f2dfde2a2c1b70af56700fcdf7e48c6dc445773` a exe `6aae3c142a09d1bf0d71307aec50121d9bca412a3c717a3e5513d6b3cf4e1224`. Chyby připojení a dialogu byly řízeně vyvolané. Nedostupnost klíče dokládá odmítnutí neplatného souboru, nikoli poruchu systémového šifrování.

## Zjištění a hranice

- Původní balíček při nedostupné složce zobrazoval současně chybu `R3_PROJECT_UNAVAILABLE` a „Načítání změn…“, protože při chybě chyběl i načtený detail. Existující prázdná sada neměla výslovný popis.
- Renderer nemá samostatný ovladač hledání, takže § 7 je zde doložen prázdným diffem.
- Dokončené neověřené čtení pokrývá stav bez důkazu kontroly. Samostatný dokončený změnový běh na nepodporovaném ověřovacím profilu tím doložený není.
- Průchod obnovy ověřil znovunačtení historie po reloadu a ruční nové připojení. V tomto scénáři byl běh už dokončený. Stavy běžícího příkazu, ověřování a zastavování patří do odděleného průchodu.
- Výběr složky byl nahrazen známou cestou a klávesa Enter použita po přímém zaměření tlačítka. Osobní průchod autora zůstává otevřený.

## Oprava a čerstvé sestavení

Panel odděluje chybu automatického načtení změn od chyb ostatních akcí. Během načítání ukáže průběhový stav, po odmítnutí chybu a u načtené prázdné sady zprávu „Sada neobsahuje žádné změny k zobrazení.“ Regresní test před opravou selhal na stále viditelném načítání a po opravě prošel spolu s ostatními testy panelu (7/7). Ověřuje také, že další aktualizace obnoví zobrazení změn a zachová chybu samostatného načítání aktivity.

Čerstvý balíček má zdrojový hash `357c70756dce80a1698723e581f9aa695bd17b0bf58d8fe4e13333fbc94fea8b`, ASAR `6dcc3e710870279b7b0ce00fc0212a9e2e07db253ff8db90a1eaec20707319f9` a exe `6d0042cd63953a0a6b51f84d522204a7a60b8d1a43074676fd2cfda17bd7d97c`. První sestavení selhalo na HTTP 504 při získávání kontrolních součtů pro Electron. Úspěšné opakování předalo běžnému ověřovači balíčku lokální kontrolní součty z nainstalovaného Electronu 43.4.0. SHA-256 existujícího ZIPu se shodoval s hodnotou `ef0709cfa719739acce73de6f9b684304baf38c6454376638a70d34a7cecffe0`. Závislosti, konfigurace balení i systémová mezipaměť byly ponechány beze změny.

V novém balíčku bylo zachyceno **12 PNG** ve stejných třech rozměrech a obou motivech. Prázdná sada výslovně vysvětlila, že nemá změny k zobrazení, a návrat byl neaktivní. U nedostupného projektu panel zobrazil chybu a zachoval historii bez textu „Načítání změn…“. Obě matice mají nulové vodorovné přetečení a nulové chyby stránky či konzole. Identita balíčku se shodovala před i po každém použitém pokusu.

## Artefakty

Ignorovaný adresář `.r3-artifacts/2026-11-08-e3-visual/` obsahuje `run.mjs` a oddělené adresáře pokusů. `attempt-XFqu50/report.json` obsahuje prvních 36 snímků. Pokus je označený jako nedokončený, protože při změně rozměru pro nedostupný projekt selhal pozorovatel Playwrightu s chybou „Resulting promise was garbage collected“. `attempt-ttwLOn/report.json` obsahuje úspěšný cílený průchod nedostupného projektu se zbývajícími šesti snímky. Dva starší pokusy skončily na ověřovacích předpokladech a do agregátu nejsou započtené.

Příklady z původního balíčku jsou `attempt-XFqu50/reconnect-error-900x640-dark.png`, `attempt-XFqu50/unavailable-key-900x640-dark.png` a `attempt-ttwLOn/unavailable-project-1440x900-light.png`.

Nové snímky prázdné sady jsou v `attempt-7ZO4Sr/report.json` (šest snímků, pokus nedokončený po chybě pozorovatele při druhém spuštění Electronu). Opakování v témže řídicím procesu `attempt-O9KiW0` nezachytilo žádný snímek, ale vytvořilo a uzavřelo oddělený profil s již nedostupnou složkou. Jeho otevření z nového řídicího procesu dalo šest snímků v dokončeném `attempt-Edpg4j/report.json`. V obou použitých záznamech byl každý PNG ověřen podle rozměrů a SHA-256. Reprezentativní snímky opravy jsou `attempt-7ZO4Sr/completed-unverified-empty-diff-1440x900-light.png` a `attempt-Edpg4j/unavailable-project-1440x900-light.png`.

Ověření snímků a zopakování cílených kroků nad čerstvým balíčkem z kořene repozitáře:

```powershell
node .r3-artifacts/2026-11-08-e3-visual/validate.mjs
node .r3-artifacts/2026-11-08-e3-visual/validate.mjs --patched
node .r3-artifacts/2026-11-08-e3-visual/run.mjs --patched-samples
node .r3-artifacts/2026-11-08-e3-visual/run.mjs --patched-samples --unavailable-profile=.r3-artifacts/2026-11-08-e3-visual/attempt-O9KiW0/profile
```
