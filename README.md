# Codryn

Codryn je školní desktopový programovací nástroj pro Windows 11. R3 přidává pracovní plochu nad backendem R2: projekty a chaty, průběžný výstup, schvalování, diff (přehled změn), ověření a bezpečný návrat. Stav k 1. listopadu 2026: implementace má automatické a packaged důkazy, [čerstvý živý GUI protokol](docs/evals/r3-desktop-2026-11-01.md) dosáhl v poslední sérii 4/5; dvě předchozí série 0/5 s chybami testovacího ovladače zůstávají zachované. Osobní přijetí autora a vypsané mezery vizuálního/streamového ověření zůstávají otevřené. Celé O1 ani školní verze tím nejsou dokončené.

Autorita: [PROJECT_CONTEXT](PROJECT_CONTEXT.md), [PRD v1.1](PRD_v1.1.md). Podrobné výsledky a omezení: [R3 akceptace](docs/r3-acceptance.md), [architektura](docs/architecture/r3-desktop.md), [autorský průchod](docs/r3-author-checklist.md).

## Spuštění ze zdrojů

Potřebujete Windows 11 x64, Node.js **24.19.0**, npm **>=11 <12** a pro Git scénář nainstalovaný Git CLI. Electron obsahuje vlastní Node pro aplikaci, ale nenahrazuje systémový Node pro ověřovací příkazy projektu. Příkazy spouštějte v kořeni repozitáře v PowerShellu:

```powershell
node --version
npm.cmd --version
npm.cmd ci
npm.cmd run start --workspace @codryn/desktop
```

Instalace závislostí a sestavení potřebují dostupné balíčky; offline zde znamená následný provoz demo režimu bez modelového API. Pro distribuční složku:

```powershell
npm.cmd run package
& .\apps\desktop\out\Codryn-win32-x64\Codryn.exe
```

Spouštějte celý výstupní adresář, nikoli samotnou kopii exe. Běžné spuštění používá standardní Electron `userData` profil účtu Windows; obsahuje `codryn.sqlite`, případné `backups` před migrací a šifrované `secrets/openai.json`. Testovací/smoke profily jsou zvlášť v `.r3-artifacts`; jejich parametry nejsou běžný uživatelský postup. Profil nemažte jako způsob řešení chyby, obsahuje historii a chráněný klíč. `npm.cmd run make` je dostupný Forge příkaz pro distribuční artefakty; časovaná instalace na čistém účtu Windows a limit dvě minuty AC-O1-01 zůstávají samostatným R5 důkazem. Vývojářské spuštění je nesplňuje.

## Offline demonstrační průchod

V Nastavení ponechte **Demo · připravený scénář**. Zkopírujte obsah [referenčního projektu](tests/support/fixtures/r2-project) do nové pracovní složky mimo tento repozitář. Pro Git variantu nejprve vytvořte vlastní lokální repozitář a výchozí commit; pro non-Git variantu složka nesmí ležet uvnitř jiného repozitáře. V aplikaci otevřete složku, založte chat a zadejte opravu součtu v `sum.mjs`. Modelové volby jsou předem připravené; čtení, hledání, změna, oprávnění, skutečný Node test a návrat pracují nad skutečnými soubory.

Zkontrolujte rozhodnutí oprávnění patche (referenční patch může být automaticky povolen pravidlem) a potvrďte schválení testovacího příkazu, prohlédněte aktivitu, diff a výsledek, potom potvrďte návrat změn. Nepotvrzujte příkaz bez přečtení jeho programu, argumentů a pracovního adresáře. Pro další demo nejprve vraťte původní chybu přes UI. Demo vyžaduje původní `sum.mjs` a přesný podporovaný `sum.test.mjs`; jiná složka může mít dostupnou historii, ale připravený scénář odmítne. Referenční ověřovací profil nepředstavuje obecné TypeScript ověřování; to patří do R4.

## Živý model a klíč

V Nastavení vyberte **OpenAI API · gpt-6-luna**, vložte klíč do pole **Nový API klíč** a uložte jej. Jde o samostatně placené modelové API. **Otestovat připojení** posílá pevnou krátkou zprávu bez projektu: limit 32 výstupních tokenů a 10 sekund, může vzniknout malý náklad. Test připojení ani uložení klíče není souhlas s přenosem projektu. Před prvním projektovým požadavkem přečtěte aktuální upozornění a potvrďte přenos projektových dat; backend platnou verzi potvrzení vynucuje.

Ukládání používá Electron safeStorage a Windows DPAPI (systémové šifrování pro účet Windows). SQLite uchovává metadata a verzi, soubor tajemství pouze šifrovaný obsah. Není podporováno nešifrované náhradní uložení. Klíč lze nahradit nebo odstranit; správa klíče během aktivního běhu je blokovaná. Chránění neizoluje klíč od jiných programů stejného účtu Windows a odstranění neslibuje fyzické přepsání SSD. Viz [ADR 0008](docs/decisions/0008-r3-secret-storage.md).

Pro první live zkoušku použijte výhradně nový syntetický projekt. Nastavte nízký **Limit kroků** (1–32), předem dohodněte nákladový limit a časový limit pokusu a evidujte skutečnou spotřebu. GUI nemá dolarový rozpočet ani pole pro celkový timeout běhu; limit kroků není finanční strop. Pevný finanční strop musí zajistit samostatný kontrolovaný postup/provider. Není-li možné náklady spolehlivě omezit, placenou zkoušku nespouštějte. [Live šablona](docs/evals/r3-desktop-template.json) a [pravidla evidence](docs/evidence/README.md) nejsou provedeným měřením.

## Chyby, zastavení a obnova

Chyba připojení se zobrazí bezpečným důvodem; neodesílejte klíč, HTTP hlavičky ani raw odpovědi do reportu. Při chybě zachovejte zadání a nejdříve zkontrolujte stav běhu. Opakování je nový záměr s vazbou na původní požadavek; stejné doručené odeslání nevytvoří druhou akci. Pokud je projekt vytížený, přejděte z nastavení k aktivnímu běhu. **Zastavit** nejdříve požádá o ukončení; konečný stav závisí na potvrzení backendu.

Obnovení okna načte uloženou historii a čekající schválení. Po pádu celé aplikace se nástroje ani model automaticky znovu nespouštějí; neukončené běhy zůstanou přerušené a stará schválení nelze znovu použít. Pokud návrat hlásí novější ruční změnu, zastaralý podklad nebo nutnou obnovu, zachovejte soubory a přečtěte diff; nepřepisujte je ručně kvůli zelenému výsledku. Nedostupná složka nemá zničit historii. Neúspěšné potvrzení zastavení při zavření ponechá aplikaci otevřenou.

## Ověření

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run check:deps
npm.cmd test
npm.cmd run verify:r3
```

`verify:r3` postupně provádí statické kontroly, testy, provider/report kontrakty, opakovatelnost R1/R2, nové balení, desktopové a packaged R3 i R0/R2 zkoušky. Automatika nepoužívá skutečný API klíč; testovací profily jsou oddělené. Samostatné `test:r3-desktop` a `test:r3-packaged` vyžadují aktuální package s ověřenou build identitou. Reporty vznikají v ignorovaných `.r3-artifacts`, historický záznam je v [bodu 5](docs/superpowers/plans/2026-10-31-r3-step5-packaged.md).

Poslední výsledek je agregát úspěšných fází po opravách, **nikoli jeden úspěšný příkaz `verify:r3`**. Přesné počty, build hash a stáří důkazů uvádí akceptační dokument. Ruční OS dialogy, osobní klávesnicový a předváděcí průchod patří autorovi.
