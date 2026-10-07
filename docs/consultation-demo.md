# Ukázka pro říjnovou konzultaci

Ukázka předvádí čtyři úkoly zadávacího listu na malém projektu: hledání textu,
čtení souboru, úpravu souboru a schválení/spuštění příkazu. Trvá přibližně
5–8 minut. Používá skutečné agentní jádro R2, souborové nástroje, schvalování,
procesní runner (službu spouštějící příkazy), ověření a návrat změny.

Rozhodování modelu je předem naprogramované pro opakovatelnou ukázku. Není to
živý požadavek na AI model. Nástroje skutečně čtou, hledají, zapisují a spouštějí
test. Internet ani API klíč nejsou potřeba. Ukázka nepředstavuje hotové grafické
rozhraní aplikace; předvádí funkční backend, tedy výkonné jádro programu.

## Spuštění

Použij Windows a verzi Node/npm předepsanou v kořenovém `package.json`.
Závislosti musí být nainstalované. Otevři běžný interaktivní PowerShell v kořeni
repozitáře, zvětši písmo terminálu a spusť:

```powershell
npm.cmd run demo:consultation
```

Enter pokračuje na další krok. Ve schvalovací otázce zadej `a` nebo `y` pro
jednorázové povolení; `n` nebo prázdná odpověď příkaz zamítne. Ctrl+C ukázku přeruší.

Každé spuštění vytvoří novou složku `codryn-consultation-*` v systémové dočasné
složce. Zdrojový kód Codrynu ani předchozí ukázka se neupravují. Cesta se vypíše
na začátku. Ukázkový projekt nevyžaduje Git. Výsledky zůstávají k prohlédnutí;
skript tyto složky automaticky nemaže.

## První průchod: povolení příkazu

1. **Výchozí chyba.** Funkce `sum` obsahuje `return a - b`. Přípravný test
   spuštěný průvodcem skutečně selže: pro `sum(2, 3)` očekává `5`, dostane `-1`.
   Řekni: „Nejdřív ukazuji, že chyba opravdu existuje.“
2. **Hledání.** Agent požádá o `text.search`; skutečný výsledek obsahuje cestu,
   řádek a okolní text. Řekni: „Agent si vyhledá relevantní místo v projektu.“
3. **Čtení.** Agent požádá o `file.read` a dostane obsah `sum.mjs` a jeho hash,
   tedy otisk konkrétní verze souboru. Řekni: „Agent pracuje se skutečným obsahem
   souboru. Otisk chrání proti přepsání souběžné změny.“
4. **Úprava.** `file.patch` vymění minus za plus. Řekni: „Zápis provádí nástroj
   po kontrole souboru, nikoli samotný text odpovědi modelu.“
5. **Schválení.** Ukaž celý příkaz, pracovní složku a časový limit. Odpověz `a`.
   Řekni: „Schvaluji jeden konkrétní příkaz jednou. Souhlas není obecné povolení
   pro všechny další příkazy.“
6. **Ověření.** Nástroj spustí `node --test sum.test.mjs`; průvodce ukáže jeho
   výstup a stav ověření z jádra. Řekni: „Opravu potvrzuje úspěšný test,
   nikoli tvrzení modelu.“
7. **Rozdíl a návrat.** Diff je přehled rozdílů mezi původním a upraveným
   souborem. Ukaž řádky s minus/plus; Enter spustí návrat přes službu Codrynu.
   Průvodce ověří původní obsah. Řekni: „Změnu umím také bezpečně vrátit.“

Po návratu je v projektu opět původní chyba. Úspěšné ověření se týkalo opraveného
stavu před návratem; neznamená, že obnovený chybný soubor prochází testem.

## Druhý průchod: zamítnutí příkazu

Spusť stejný příkaz znovu. U schvalování odpověz `n`.

Soubor se upraví ještě před žádostí o spuštění testu. Zamítnutí blokuje příkaz,
nevrací automaticky již provedenou úpravu. Průvodce z historie jádra ověří, že
příkaz byl zamítnut a nemá událost spuštění. Oprava zůstane neověřená; potom
průvodce ukáže diff a vrátí změnu.

Řekni: „Bez souhlasu se agentní příkaz nespustí. Program rozlišuje provedenou
úpravu a ověřenou opravu.“ Výchozí přípravný test se i v tomto průchodu spustil
ještě před agentním během; nepleť ho se zamítnutým agentním příkazem.

## Co ukázat, když se vedoucí zeptá na implementaci

- `scripts/consultation-demo.ts`: průvodce, oddělený projekt a prezentace.
- `apps/cli/src/scenarios/change-verify-return.ts`: předem připravené kroky modelu.
- `backend/core/src/tools/tool-execution-harness.ts`: kontrola nástroje a oprávnění.
- `backend/infrastructure/src/create-r2-infrastructure.ts`: propojení jádra
  se skutečnými soubory, databází a procesy.

Vztah částí lze vysvětlit větou: „Model navrhuje kroky. Jádro kontroluje
oprávnění, nástroje provedou operace a výsledky se vracejí modelu.“

V dočasné složce zůstane `evidence.json` s výsledkem běhu a historií událostí
**před návratem změny**. Databáze v `user-data` uchovává také následný návrat.
Při chybě ukázka vypíše chybu a skončí neúspěšně; nehlásí automaticky splnění.

## Ověření před konzultací

Oba průchody si jednou projdi v interaktivním terminálu. Automatická kontrola
nad skutečnými službami je:

```powershell
npm.cmd test -- apps/cli/test/consultation-demo.test.ts
```

Testy nastavují odpověď programově, aby prověřily povolení i zamítnutí. Ruční
ukázka žádný souhlas automaticky neuděluje.
