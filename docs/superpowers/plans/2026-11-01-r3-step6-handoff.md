# R3 — bod 6: dokumentace a předání

Datum: 1. listopadu 2026. Základ pokračování `71188cf`, větev `feat/r3-electron-workspace`. Rozsah této části E3 je dokumentace podle skutečných zdrojů a existující evidence; žádná změna produkčního kódu, žádné autorské zaškrtnutí.

## Konkrétní výstupy

- [README](../../../README.md): Windows/Node/npm, spuštění a package, offline demo versus live, skutečná omezení referenčního profilu, ochrana klíče, souhlas, nákladové/časové hranice a recovery.
- [Akceptace](../../r3-acceptance.md): všech 13 oblastí spec §8 s konkrétními zdroji/testy, očekáváním, výsledkem, build identitou a limity; převzatých všech 108 M/O1 požadavků a 26 povinných AC-O1. R4/R5/ŠF zůstávají výslovně otevřené.
- [Autorský checklist](../../r3-author-checklist.md): všechny položky nezaškrtnuté; skutečné OS dialogy, Git/non-Git, stale/conflict, approval reload, stop, klíč, motivy, klávesnice a předváděcí obrazovka.
- [Architektura](../../architecture/r3-desktop.md): hranice vrstev, migrace 10–12, request/job/run ID, atomické přijetí, projekce/kurzory, odběry, shutdown/recovery, secret boundary a referenční relevance.
- [Live JSON template](../../evals/r3-desktop-template.json), [schema](../../evidence/r3-live-report.schema.json), [pravidla evidence](../../evidence/README.md), [autorská šablona](../../evidence/r3-author-session-template.md). Prázdný seznam pokusů má stav `not_run`, nikoli passed.
- [ADR 0008](../../decisions/0008-r3-secret-storage.md) aktualizované skutečným packaged synthetic-key výsledkem; [hlavní plán](2026-10-11-r3-implementation.md) dostal současnou stavovou anotaci při zachování historického textu.

## Převzaté důkazy a hranice

[Bod 5](2026-10-31-r3-step5-packaged.md) je agregát úspěšných fází. Dvě invokace celé brány zůstávají failed. Běžných 658 passed / 3 skipped, statické kontroly a R1/R2 repeatability předcházejí poslední změně pouze výplně syntetické cancellation fixture. Finální package má source `82eebf763379e3d9d094e7f97359968dddc095d308f5c16e563319836238b388`, ASAR `630361f2b1bb19b6757094eb5f2dfde2a2c1b70af56700fcdf7e48c6dc445773` a EXE `6aae3c142a09d1bf0d71307aec50121d9bca412a3c717a3e5513d6b3cf4e1224`. Nad ním prošlo všech osm R3 packaged fází, R0/R2 packaged a znovu desktop 30/30 včetně 20 UI workflow. Úplný scan po zavření: 53 souborů, žádný marker ani vynechání. Toto není nové měření z dokumentačního kroku.

Aktuální live GUI a packaged vizuální audit mají samostatné vlastní záznamy; jejich výsledek tento dokument nedoplňuje odhadem. Osobní autorské přijetí zůstává pending. Jeden live smoke nebo historický R2 report nenahradí nové pětipokusové AC-O1-04. GUI nemá dolarový budget ani globální run timeout; samostatný placený postup musí limity skutečně vynucovat.

## Skutečný živý protokol

[Živý protokol](../../evals/r3-desktop-2026-11-01.md) a jeho validovaný
[JSON](../../evals/r3-desktop-2026-11-01.json) dokládají poslední sérii **4/5**.
Dvě předchozí série **0/5** zůstávají zachované jako chyby testovacího ovladače
(stará approval v UI, potom nekánonická cesta Node). Před poslední sérií
stejný ovladač skutečně dokončil celý offline GUI tok bez klíče a bez API.
Čtvrtý pokus poslední série neodeslal revert kvůli předčasnému Enter na
nepovoleném tlačítku; není zpětně povýšen na úspěšný. Všechny usage jsou známé.
Všech 70 HTTP požadavků má odhad **0,0102730 USD**, konzervativní rezerva je
**0,203958501 USD** z autorem povolených 0,25 USD. Nejde o potvrzení fakturace.
Původní limit se mezi sériemi neresetoval. Další placené pokusy neproběhly.

Živý stream před dokončením zůstal nezměřený. Úplný scan zavřených profilů
zkontroloval 1007 souborů a samostatně byly zkontrolovány publikované dokumenty
proti přesnému klíči v UTF-8/UTF-16LE; bez nálezu. Skutečná hodnota klíče není
v reportech. Native dialogy byly nahrazené pouze v test driveru; osobní
kontrola autora a zbývající vizuální/streamové mezery jsou stále otevřené.

## Dokumentační kontrola

Samostatné [skutečné vizuální QA](2026-11-01-r3-e3-visual.md) doplnilo 67
unikátních snímků zabalené aplikace (66 maticových a jeden revert dialog),
19 klávesnicových záznamů a nulové horizontální přetečení či konzolové chyby.
Používá připravené modelové scénáře, nikoli placené API. Dva dodatečné pokusy
pozorovat samostatný command stream neprošly; zpráva je neoznačuje za nový
důkaz streamu nebo potvrzeného stopu. Další nepokryté stavy spec §7 jsou
výslovně vypsány; tento dílčí průchod neuzavírá celé E3.

Dokumentační kontrola skutečně prošla: 120 místních Markdown odkazů existuje; matice obsahuje přesně 108 unikátních M/O1 ID a 26 unikátních povinných AC-O1. Všech 11 nových/změněných dokumentačních souborů je bez nepovolených řídicích znaků, checklist bez zaškrtnutí, `git diff --check` bez chyby. Existující AJV validoval JSON Schema draft 2020-12 i prázdný `not_run` template; negativní kontroly odmítly prázdné `passed`, 3/5 a neznámou usage vydávanou za nulu. Strukturální příklad 4/5 existoval pouze v paměti kontroly, nebyl uložen jako měření. Produkční brána se kvůli čistě dokumentační části neopakovala. Samotný dokumentační audit neprovádí osobní dialogy ani živé pokusy; skutečný samostatný živý výsledek je uveden výše. Žádný stage, commit, push nebo PR v této části.

R3 zůstává před osobním přijetím a uzavřením vypsaných vizuálních/streamových mezer; dokumentace nepředává R4 jako již schválenou novou implementaci a neoznačuje celý O1/ŠF za hotový.

Závěrečný rozšířený audit koordinátora pokryl 18 dokumentačních souborů a
150 místních odkazů bez chyby. Oba skutečné neúspěšné JSON protokoly, finální
4/5 i prázdná šablona prošly schématem; autorský checklist zůstal prázdný.
Aktuální `verifyBuild()` znovu potvrdil B5 a `git diff --check` prošel.
Nezávislá revize zdrojových tvrzení i skutečných výsledků a součtů byla
uzavřená bez důležitého nálezu. Žádná změna produkčního kódu ani další API
volání při uzavírání dokumentace neproběhla; jde o lokální předávací záznam.
