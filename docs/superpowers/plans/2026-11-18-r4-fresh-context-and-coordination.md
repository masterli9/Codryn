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

- [x] Testem zafixovat férovou frontu sdílených mutací a výhradního pozorování, zrušení čekání a uvolnění po chybě.
- [x] Zachovat kanonické zámky jednotlivých souborů. Více různých nativních zápisů smí držet sdílenou mutační fázi, úplný observer čeká na jejich dokončení. Nové mutace nepředbíhají čekající observer.
- [x] Stejnou cestu použít pro revert. Git a existující migrační operace posoudit podle skutečného prostředku. Zámek balíčkovací mutace přidat pouze k existujícímu zapisujícímu vstupu.
- [x] Na Windows doložit souběh různých souborů i bezpečný souběh s pozorovatelem bez návratu chyby nativního guardu.

ResourceBarrier prošel 2/2: FIFO, nejvýše osm sdílených operací, fronta nejvýše 128, zrušení a uvolnění. Skutečné nezávislé nativní zápisy a dva R2 aktéři s čekajícím úplným observerem prošli 2/2. Původní guarded-writer sada prošla 13/13 včetně parent rename, junction a oplock ochran. Příčina původního selhání byla nadbytečná požadovaná DELETE práva rodičovského handle; zákaz sdílení pro smazání zůstává zachován.

Migrační důkaz prošel 1/1: dva procesy nad starším schématem používají existující BEGIN IMMEDIATE; dva souběžné desktopové openy nad kanonickými aliasy v jednom procesu vytvoří jednu zálohu. Napříč procesy se neprohlašuje jediná společná záloha. Balíčkovací CLI drží nativní SQLite zámek od vstupního sourceHash po zápis build.json; dvouprocesový test a uvolnění po chybě prošly 1/1. Pomocník je určen pro jeden balíčkovací běh na proces, nikoli pro dvě souběžná asynchronní volání v témže event loopu.

## 3. Rozsah ověření a dokončovací evidence

- [x] Testovat přesný obsahový rozsah, nástroje, konfiguraci, nezávislé změny a neúplné vstupy. Neznámá závislost obecného shell příkazu nesmí získat příslib úplnosti.
- [x] Zachovat provenance původního běhu a zaznamenaných kontrol. Užší důvěryhodný profil vyžaduje vlastní důkaz.
- [x] Doplnit přesné integrované důkazy a matici podle skutečných výsledků. Konsolidované statické kontroly, úplnou sadu a finální balíček provede koordinující agent. Živé API a osobní přijetí zůstávají samostatné otevřené brány.

Rozsah má přesný marker bounded-project-inputs-v3. Běžné uživatelské ignore pravidlo vytvářející nepozorovaný vstup, rezervovaný kořenový název metadat, binární či nadlimitní vstup nebo alias nepřipustí úplný důkaz tohoto profilu. Starší uložené záznamy zůstávají čitelné se svou proveniencí, ale potřebují nové ověření. Nejde o sledování běhového I/O: pevně chráněné adresáře, tajné soubory, závislosti a vstupy mimo kořen nejsou prohlášeny za pozorované.

Cílené scope/classifier/store testy prošly 9/9. Skutečný TS non-Git cyklus prošel 1/1 (Git varianta vynechána filtrem): samostatné schválení, skutečné kontroly, původ neúspěšné kontroly, invalidace po změně souboru i nových textových dat, zachování stejného pozorovaného rozsahu po vnější nezávislé změně a bezpečný návrat. Poslední zachování je důkazem pouze uvnitř deklarovaného rozsahu, nikoli zárukou o libovolných shell závislostech. Původní skutečné R3 Git/non-Git cykly po koordinaci prošly 2/2.

## Závěrečný stav — 19. listopadu 2026

Všechny tři implementační skupiny jsou dokončené. Finální úplná sada prošla 788/2 skipped, typy/lint/závislosti prošly pro 404 modulů a 1 378 hran. Novější skutečný test dvou souběžných host.localGit požadavků prošel samostatně 1/1 a doplnil přesný AC-O1-22 spolu s nezávislými zápisy 2/2; není připočten k úplné sadě. Node resource/eval brány prošly 5/5.

Finální balíček zdroje d2bde68019763b4056ae4a33553bffbb89d481c4e7ae6d2455e10604d8c752b7, ASAR 6418032f00a2f56e9e20a170a111ea2e1118325c099eda119bca5383fa2d19ad prošel R3 8/8 (`packaged-Z6GTyT`), TS worker (`r4-ts-worker-zDBZ4y`) a desktop otázky/reference/Git 3/3. Dřívější dva timeout pokusy a úplná sada 785/2 skipped/2 failed zůstávají v akceptačním záznamu včetně příčin a oprav. Testovací workflow rozpočet je nyní omezených 60/70 s kvůli opakované validaci kontextu; produktová oprávnění a worker limity zůstávají stejné.

AC-O1-22 nevyžaduje koordinační UI a AC-O1-24 hodnotí deklarovaný rozsah zaznamenaných vstupů. Jejich důkazy jsou doplněné bez nové obecné podmínky runtime I/O tracingu. Placený eval, osobní přijetí a celý zbývající rozsah R4 tento plán neuzavírá. Podrobné limity a identita workeru jsou v docs/r4-acceptance.md.
