# Doplnění čerstvosti kontextu a koordinace R4

Autoritou zůstává PRD v1.1, zejména FR-CTX-05/17, FR-COORD-09/10/14 a AC-O1-22/23/24. Plán navazuje na kontextový plán Task 3/5 a workspace plán Tasks 1–3/7. Výchozí větev je codex/r4-user-driven-design, commit b0e8ad3.

## Současný stav

RunAgentLoop sestaví kontext před smyčkou a potom opakovaně předává stejný obsah. Obnovení po otázce již znovu sestavuje kontext a označuje staré výsledky, běžný další tah tuto ochranu nemá. Historie obsahuje také původní argumenty a komentáře asistenta, které mohou citovat staré zdroje.

Desktopový filesystemEffect nyní výhradně řadí pozorování, patch a revert podle projektu. Tato koordinace odstranila reprodukované selhání nativního guardu při souběžném scanu. Kanonický zámek samotného souboru již existuje. Verification evidence porovnává všechny pozorované vstupy, obecné příkazy však mohou číst i nepozorované nebo vnější soubory.

## 1. Obnova před každým modelovým tahem

- [x] Přidat selhávající testy vlastního patche, ruční změny a změny pravidel mezi modelovými tahy. Starý výřez, výsledek hledání a TS výsledek musí být odstraněný nebo výslovně zastaralý před dalším odesláním.
- [x] Sestavovat aktuální omezený kontext před každým dalším tahem. První preflight explicitní reference zůstane přísný. V dalším tahu změněnou nebo znovu zakázanou referenci vynechat s důvodem.
- [x] Evidovat důkaz hledání před a po skutečném provedení. Souborový výřez ověřit vůči současné identitě, hledání a TS vůči úplnému pozorovanému workspace a politice. Při neprokázané čerstvosti ponechat pouze bezpečná historická metadata.
- [x] Zachovat role, tool ID, call ID, výsledky uživatelské otázky a dosavadní oprávnění. Při zastaralých datech odstranit také citující historický komentář a argumenty dokončených volání. Hotové nástroje neopakovat.
- [x] Auditovat nové sestavení bezpečnými metadaty každého tahu. Neplatná politika zastaví odeslání modelu. Změna při ověřování kontextu se vyhodnotí konzervativně.
- [x] Ověřit běžný desktopový vstup, otázkový restart a příslušné R2 fake scénáře. Commitnout tento samostatný celek.

Cílené testy model-turn-context a model-turn-freshness prošly 5/5. Původní otázkové a skutečné Git/non-Git R3 cykly prošly 7/7, šest dalších testů souboru bylo vynecháno filtrem. Kontrola typů workspace prošla. Plný protokol adaptéru a finální balíček zůstávají součástí konsolidované regrese po dalších skupinách.

## 2. Koordinace zápisů a pozorování

- [ ] Testem zafixovat férovou frontu sdílených mutací a výhradního pozorování, zrušení čekání a uvolnění po chybě.
- [ ] Zachovat kanonické zámky jednotlivých souborů. Více různých nativních zápisů smí držet sdílenou mutační fázi, úplný observer čeká na jejich dokončení. Nové mutace nepředbíhají čekající observer.
- [ ] Stejnou cestu použít pro revert. Git a existující migrační operace posoudit podle skutečného prostředku. Zámek balíčkovací mutace přidat pouze k existujícímu zapisujícímu vstupu.
- [ ] Na Windows doložit souběh různých souborů i bezpečný souběh s pozorovatelem bez návratu chyby nativního guardu.

## 3. Rozsah ověření a dokončovací evidence

- [ ] Testovat přesný obsahový rozsah, nástroje, konfiguraci, nezávislé změny a neúplné vstupy. Neznámá závislost obecného shell příkazu nesmí získat příslib úplnosti.
- [ ] Zachovat provenance původního běhu a zaznamenaných kontrol. Užší důvěryhodný profil vyžaduje vlastní důkaz.
- [ ] Doplnit přesné integrované důkazy a matici podle skutečných výsledků. Konsolidované statické kontroly, úplnou sadu a finální balíček provede koordinující agent. Živé API a osobní přijetí zůstávají samostatné otevřené brány.
