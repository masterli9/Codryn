# R3 – minimální Electron pracovní plocha

| Položka | Hodnota |
| --- | --- |
| Datum | 11. října 2026 |
| Stav | Podklad pro plán na žádost autora po porovnání s PRD; konkrétní vizuální varianty dosud neposouzené |
| Autorita | AGENTS.md, PROJECT_CONTEXT.md, PRD_v1.1.md, registr v1.1, ROADMAP §7 |
| Větev a základ | feat/r3-electron-workspace, main de470b6 |
| Výstup | Návrhová specifikace, nikoli implementace nebo test report |
| Revize rozsahu | Porovnáno s PRD v1.1, registrem v1.1 a ROADMAP §7–8 dne 11. října 2026; autor následně zadal sepsání implementačního plánu |

## 1. Záměr a schválené volby

R3 zpřístupní stejný agentní průchod jako interní CLI přes desktopové
rozhraní. Uživatel otevře projekt, zadá úkol, sleduje průběh, rozhodne
o oprávnění, prohlédne změny a ověření a může změny bezpečně vrátit.
Backend je nadále jediným vlastníkem agentních pravidel a stavu relace.

Autor schválil skutečný model i oddělený demonstrační režim, základní správu
projektových chatů, jeden aktivní běh nad projektem a pravidla obnovy.
Výslovně změnil původní doporučení pro klíče: **trvalé bezpečné ukládání,
test připojení, nahrazení a odstranění API klíče jsou součástí R3**.
Požadavky FR-LLM-06/07 se tím realizují dříve než jejich nejzazší etapa ŠF;
jejich bezpečnostní význam se nemění. Klíče se nesynchronizují do cloudu.
Světlý/tmavý základ a nezbytná obnova rozhraní rovněž realizují část
požadavků ŠF dříve. Neznamená to přesun ostatního rozsahu ŠF do R3.

Vizuální směr: Instrument Sans, velké zaoblené rohy inspirované aplikací
Shop, vyvážená hustota, vzdušný chat a kompaktní navigace. Aktivita je
v chatu s rozbalitelnými detaily; změny a ověření mají vedlejší panel.
Lucide se nepoužije. Světlý a tmavý návrh se porovnají s limetkovým
a lesním zeleným akcentem. Přesná paleta a konkrétní obrazovky zatím
nejsou schválené a nejsou podmínkou návrhu backendových rozhraní.

## 2. Rozsah a pravdivé limity

R3 zahrnuje systémový dialog pro otevření složky, rozlišení Git/non-Git,
seznam chatů a jejich vytvoření, přejmenování, otevření a archivaci,
víceřádkové zadání, odpověď modelu, aktivitu, oprávnění, diff, aktuální
výsledek ověření, zastavení, návrat změn a obnovení rozhraní.
V Git projektu UI oddělí výchozí necommitnutou práci uživatele od
agentní sady změn a zobrazí zachycenou branch/HEAD jako kontext této sady.
Nejde o plný Git panel. Detached HEAD, konflikt a chybějící Git executable
mají výslovný stav a omezení; jejich dopad určuje backend. Nedostupný Git
nesmí být vydáván za čistý repozitář ani blokovat čtení historie.
R3 automaticky nevytváří branch ani commit a neposkytuje stavové Git akce.
R3 dodává pracovní plochu nad jádrem R2; není celou širokou alfou O1.
Požadavek M/O1 označuje nejzazší produktovou bránu, nikoli automaticky
povinnou implementaci každé schopnosti už v R3. Přidělení do R4 níže
vychází z výslovného pořadí roadmapy.

První reálný adaptér zůstává OpenAI Responses / gpt-6-luna. Nabídka modelů
obsahuje pouze skutečně připojené schopnosti; demonstrační režim je
jednoznačně označen a neposílá obsah do sítě. R3 nepřidává druhý produktový
adaptér ani znovu neotevírá výběr poskytovatele. Síťová akce vyžaduje
explicitně zvolený reálný režim; chybějící klíč nezablokuje demonstrační režim.
UI zobrazí provider, model a dostupné potřebné schopnosti. Nepodporovaná
volba má vysvětlení, nikoli nefunkční položku. Parametry běhu zahrnují
backendem validovaný limit kroků 1–32, výchozí hodnotu stanoví plán.
Backend uchová model, čas, kroky a dostupnou tokenovou spotřebu;
chybějící spotřeba je neznámá, nikoli nula nebo odhad zbývajícího kreditu.

Současný R2 patch upravuje existující podporovaný textový soubor. Vytváření,
mazání a přejmenování souborů se tímto návrhem nepřidává. Referenční
ověřovací profil zná sum.mjs a sum.test.mjs včetně očekávaných testů.
Úspěšný obecný příkaz není automaticky relevantním ověřením jiného projektu.
UI rozliší výsledek příkazu od ověření úkolu; nepodporovaný profil zobrazí
jako neověřený. Referenční fixture zůstává základem dokončovací brány R3.
Jde o dočasnou hranici tohoto přírůstku: relevantní kontroly pro rozpoznaný
TypeScript projekt podle FR-TERM-04 musí navázat na TypeScript profil v R4.
R3 tím neprohlašuje FR-TERM-04 ani celý produktový rozsah ověřování za splněný.
Pouhé otevření projektu ani výběr providera jeho soubory neodesílají modelu.

R4 dodá finální @ reference, strukturované otázky, TypeScript profil, repo
mapu, lokální Git panel a vestavěné workflows. R3 pro ně zachová rozšiřitelná
rozhraní, ale nevystaví nefunkční ovládání. Mimo R3 zůstává účet, cloud,
Auto režim, canvas, libovolně přesouvané panely a finální design systém.
Globální interaktivní terminál a přehled zbývajícího využití jsou požadavky
pro následný návrh, nikoli hotové schopnosti tohoto kroku. Výstup agentova
příkazu už R3 zobrazí v aktivitě a výsledcích.

## 3. Architektura

| Hranice | Vlastnictví |
| --- | --- |
| apps/desktop renderer | React/TypeScript, zadání a zobrazení backendového stavu, místní rozepsaný text, focus a rozbalení detailů |
| apps/desktop preload a main | Omezené IPC, ověření původu volání, systémové dialogy, lifecycle okna, adaptér systémové ochrany klíče |
| backend/core | Správa chatů a běhů, oprávnění, agentní smyčka, změny, ověření a pravidla obnovy |
| backend/infrastructure | SQLite, souborové úložiště, stávající Windows runner a provider transport |
| shared | Serializovatelné příkazy, odpovědi, pohledy na stav a validační schémata |
| tests/support | Reálné izolované fixture a testovací pomocníci, bez produkčních importů |

Electron main sestaví služby a drží jejich lifecycle. Rozhraní se nepřipojuje
k SQLite, souborům nebo procesům přímo. Stávající RunAgentLoop.executeR2
zůstává jedinou smyčkou; desktop nepřepisuje algoritmus oprávnění,
dokončení, návratu ani recovery. Závislost na Electron safeStorage patří
do desktopového adaptéru za rozhraním služby pro tajemství, nikoli do core.

Zachová se Electron Forge a současná Webpack cesta. Přidání Reactu není
důvodem měnit balicí infrastrukturu. Renderer má contextIsolation,
nodeIntegration vypnuté a sandbox zapnutý. IPC zkontroluje očekávané okno,
hlavní frame i jeho povolený původ; cizí okno nebo frame nedostane privilegia.
Nedůvěryhodný Markdown se vykreslí bez aktivního HTML a spouštění skriptů.

## 4. Komunikace, stream a historie

IPC znamená validovanou komunikaci rozhraní s privilegovanou částí aplikace.
Nabídne konkrétní operace: otevření a výpis projektů; vytvoření, výpis,
přejmenování a archivaci chatů; odeslání úkolu; odběr stavu; zastavení běhu;
odpověď na čekající oprávnění; čtení diffu a vrácení změny; správu provideru
a klíče. Nenabídne obecný příkaz pro spuštění kódu ani libovolné čtení disku.

Příkazy používají projektová/chatová ID a jednoznačné requestId. Backend
ověřuje vlastnictví všech referencí; renderer neurčuje skutečný kořen
projektu, argv schvalovaného nástroje ani platnost výsledku. Opakované
odeslání stejného requestId nesmí vytvořit druhou zprávu nebo běh.
Stejné requestId s odlišným obsahem se odmítne. Zpráva a počáteční událost
běhu se zapíší atomicky nebo idempotentně obnovitelným postupem podle
PRD §12.2; pád mezi nimi nesmí vytvořit osiřelou zprávu či druhý běh.
Nové tabulky použijí verzované migrace, cizí klíče, validaci a zálohu před
nevratnou migrací; existující historie a obnovovací data se zachovají.

Snapshot je úplný pohled na aktuální stav. Nese projekt, chat, zprávy,
aktivní běh, čekající oprávnění, změny, ověření a pořadové číslo projekce.
Události doplňují změny po tomto pořadovém čísle. Připojení nesmí mít mezeru
mezi načtením snapshotu a odběrem událostí; backend poskytne souvislé
pořadí nebo nařídí nový snapshot. Duplicitní události klient ignoruje,
mezera vyvolá opětovné načtení. Odběr má omezenou frontu a odhlášení;
pomalé nebo odpojené UI nesmí blokovat agentní běh ani růst bez omezení.

Stávající collector sbírá text_delta do celé odpovědi. R3 doplní backendový
průběžný výstup, nikoli čtení provider streamu v rendereru. Úseky mají
identitu zprávy a pořadí. Backend ukládá omezené dávky textu a označí
uzavřenou či přerušenou zprávu; potvrzený obsah lze obnovit bez duplicity.
Po pádu se dosud nepotvrzený konec nesmí vydávat za uložený nebo dokončený.

Stejná cesta nabídne omezený průběžný stdout/stderr agentova příkazu
podle FR-TERM-01. Aktivita zobrazí přesný příkaz, pracovní adresář,
průběžný výstup a po skončení exit code, délku běhu, truncation a stav
ukončení stromu. R2 runner dnes vrací výsledný výstup; plán musí doplnit
průběžná data přes jeho produkční procesní protokol, ne simulovaný přepis
hotového výstupu. UI data jsou bezpečně zkrácená a redigovaná, nejsou
obecným přístupem k procesu. Zabalený build musí použít backendem
ověřený Node executable pro referenční test; Electron executable se
nesmí bez důkazu považovat za ekvivalent `node --test`.

Chat má vlastní ID odlišné od jednotlivého běhu, projekt, název a stav
archivace. Zprávy obsahují roli, text, čas a vazbu na běh a requestId.
Budou samostatnými lokálními daty v SQLite. Bezpečný audit nástrojů se
nemění na úložiště plných souborů nebo provider-native historie. API klíče
nepatří ani do zpráv. UI uchovává rozepsaný text při přepnutí panelu/chatu
a odesílání respektuje IME kompozici. Neexistuje automatické předání celé
staré konverzace modelu; produktové pokračování starého chatu dle
FR-CHAT-06 zůstává navazující schopností. Nový úkol tvoří samostatný běh.
Otevření starého chatu slouží v R3 ke čtení historie; tlačítko pro nový
samostatný úkol vysvětlí, že nepokračuje v původním modelovém kontextu.
Přijatá odpověď nebo čtecí úloha se nesmí prezentovat jako ověřená změna.
Rozlišení konverzačního výsledku a dokončení změnového průchodu vlastní
backend podle PRD FR-ORCH-06/07, nikoli výjimka v rendereru.

## 5. Oprávnění, souběh a ukončení

Backend připustí nejvýše jeden aktivní běh nad kanonickou identitou projektu.
Přepnutí chatu nemění lifecycle běhu. Sdílené backendové zámky a očekávané
hashe chrání i před externími editacemi; omezení počtu běhů je nenahrazuje.
Jde o omezení spouštění produktových agentních běhů v R3, ne centrální
zámek všech souborů nebo dev serverů. Externí editor může dál pracovat;
Codryn kvůli kolizi nezastavuje cizí proces a neblokuje nezávislé editace.

Schválení se zobrazí uvnitř chatu s nástrojem, vstupem, pracovním adresářem,
důvodem a dopadem. Nabídne jednorázové povolení a zamítnutí. Uživatel
neschvaluje upravitelnou kopii příkazu: odpověď je svázaná s trvalým ID
a digestem, který backend ověří a právě jednou převezme ke spuštění.
Výchozí režim je Řízený. UI ukáže i automatická rozhodnutí, zdroj pravidla
a důvod, nikoli pouze ruční schválení. Zamítnutý nástroj se nespustí a
odmítnutí se vrátí modelu. Projektové hranice R2 se zobrazením oprávnění
nerozšiřují; nepodporovaná práce mimo kořen se bezpečně odmítne.
Při současném zrušení, duplicitní odpovědi nebo zastaralém vstupu backend
rozhodne podle svého aktuálního stavu. Archivace aktivního chatu je
zablokovaná s vysvětlením, dokud běh neskončí nebo není zastaven.

Restart rendereru obnoví pohled a čekající žádost; backendový běh přežívá
a odpověď obnoví jeho existující čekání. Reload nespouští recovery určené
pro pád hostitele. Zastavení nejprve ukáže „Zastavuji“, teprve potvrzený
výsledek ukáže ukončení. Procesní strom musí projít stávajícím runnerem.
Odpojený renderer není souhlas: backend může dokončit již povolené bezpečné
operace, ale nové ruční schválení zůstane čekající až do připojení uživatele.

Zavření celé aplikace při aktivním běhu zobrazí volbu zůstat nebo zastavit
a ukončit. Druhá volba požádá o zrušení, počká na potvrzené ukončení
a zajištění dat a až potom zavře služby. Pokud ukončení nelze potvrdit,
UI vysvětlí chybu a neoznámí úspěšné zastavení. Pád hostitele se po příštím
startu řeší přes existující recovery: klasifikace skutečných souborů,
přerušených procesů a oprávnění, bez automatického replaye nástroje nebo
modelové konverzace. Historická čekající žádost bez živého pokračování
nesmí mít funkční tlačítko pro spuštění staré akce; zobrazí stav přerušení.

## 6. Trvalý API klíč

Nastavení je přímo přístupné z navigace. Uživatel zadá klíč do maskovaného
pole, uloží jej, otestuje připojení, nahradí nebo odstraní. Po předání
backendu se pole vyprázdní. Uložená hodnota se nikdy nevrací do rendereru;
UI dostává jen stav chybí / uložen / nedostupný a výsledek testu.

Doporučená technická cesta je Electron safeStorage s ochranou Windows DPAPI
(systémové šifrování svázané s uživatelským účtem). Šifrovaný záznam se
uloží mimo projekt i SQLite v datovém adresáři aplikace. Souborové zápisy
musí být atomické, omezené na tuto cestu a se zkontrolovanými oprávněními.
Selhání uložení zachová starý platný záznam; nenastane tichý plaintext fallback.
Neplatná nebo nedostupná ochrana zablokuje živý režim s možností klíč
nahradit či odstranit. DPAPI není izolace před jinými programy stejného
Windows uživatele ani záruka proti kompromitovanému účtu.
Uložený klíč není automaticky otestovaný. UI oddělí stavy neotestován,
poslední test úspěšný a poslední test neúspěšný; nahrazení zneplatní
dřívější test. Testovací úspěch je datovaný výsledek, ne trvalá záruka
aktuální platnosti klíče nebo dostupnosti modelu.

Nainstalované typy Electronu obsahují asynchronní safeStorage API; návrh
upřednostňuje tuto cestu. Konkrétní funkčnost se musí ověřit v zabaleném
Windows buildu, včetně znovuotevření po restartu. Core definuje port pro
správu tajemství, desktop dodá šifrovací adaptér a infrastructure úložiště.

Klíč krátce existuje v maskovaném vstupu a paměti backendového transportu.
Nesmí vstoupit do argv, běžných logů, auditních payloadů, diagnostiky nebo
modelového obsahu. Nelze slíbit spolehlivé přepsání JavaScript stringu
v paměti; implementace omezí jeho životnost a počet kopií.

Nahrazení nebo odstranění během běhu nejprve vyžádá jeho zastavení;
nový běh nesmí převzít starý klíč. Uložení klíče neprovádí automatický
síťový test. Test připojení je explicitní, omezený timeoutem a počtem
požadavků, bez projektových souborů; UI předem označí síťový účinek
a možnost malého API nákladu. Úspěšné připojení není důkazem ověření úkolu.
Datové upozornění a potvrzení podle FR-LLM-09/13 zůstávají oddělené od
uložení klíče a respektují skutečný provider a režim.
Při prvním odeslání projektového obsahu UI srozumitelně uvede, kterému
provideru obsah předává a podle jakého nastavení. Pokud se uplatní
FR-LLM-13, běh vyčká na vědomé potvrzení; změna provideru nebo relevantních
datových podmínek nesmí využít neplatné staré potvrzení. Pouhé uložení
či otestování klíče se nepovažuje za takové potvrzení.

Primární zdroj: [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage),
ověřeno 11. října 2026. Převzatý princip je OS šifrování za desktopovým
adaptérem; návrh nepřebírá cizí implementační kód.

## 7. Pracovní plocha a stavy

Vlevo je kompaktní navigace projektů a chatů, uprostřed konverzace a zadání,
vpravo skrývatelný panel diffu a ověření. Na menší šířce se detaily otevřou
v dostupném přepínatelném pohledu místo tří nečitelných sloupců. Návrat
do chatu, stav běhu, čekající oprávnění a zastavení zůstávají dosažitelné.

Barva akcentu neznamená úspěch. Ověřeno, částečně ověřeno, neověřeno,
zastaralé ověření a konflikt mají výslovný text a rozlišitelné značky.
Historický úspěch nesmí po externí změně zůstat označen jako aktuální;
backend před načtením výsledku a privilegovanou akcí obnoví pozorování
a invaliduje důkaz podle jeho vstupů. Otevřený pohled se pravidelně
aktualizuje, watcher není jediným podkladem pro platnost.

Návrat změn je konkrétní akce nad změnou nebo sadou. UI ukáže rozsah,
potvrdí požadavek a zobrazí výsledek backendu. Konflikt nikdy nenabídne
tichý force overwrite. Neaktivní akce vysvětlí, co brání jejich použití.

Při autentizační chybě UI nabídne opravu nastavení a zachová zadání.
Rate limit zobrazí kategorii a dostupný serverový retry údaj; automatická
opakování jsou omezená a nevytvářejí druhou zprávu. Timeout a přerušený
stream ukážou neúplnou odpověď a zachované bezpečné události. Uživatelské
opakování je explicitní nový požadavek s vazbou na původní; před změnovým
během se znovu ověří workspace a nevyřešené změny. Není to automatické
pokračování původního modelového kontextu ani opakování nejistého nástroje.
Selhání recovery blokuje další změnový běh nad dotčeným projektem.
Nedostupná složka zachová historii chatu a zakáže souborové nástroje;
změna přiřazení cesty bez ztráty metadat dle FR-PROJ-07 zůstává pro ŠF.

Částečně ověřeno vznikne pouze z konkrétního backendového důkazu
s vymezením provedených a chybějících kontrol. UI si tento stav nevytváří
z formulace modelu nebo z dostupnosti některého zeleného badge.
Konečný souhrn uvádí přesně spuštěné kontroly a jejich výsledky.

Povinné návrhové obrazovky: žádný projekt, otevřený projekt bez chatů,
prázdný chat, čekání na model, běh nástroje, čekání na schválení, ověřování,
úspěch, neověřený výsledek, chyba, zastavování, přerušený běh, reconnect,
prázdný výsledek hledání/diffu, částečné a zastaralé ověření, nedostupný
projekt, konflikt návratu a chybějící/nedostupný klíč. Kritický tok funguje klávesnicí
s viditelným focusem. Instrument Sans bude lokální asset s přiloženou
licencí, nikoli vzdálené načítání fontu za běhu. Konkrétní obrazovky se
posoudí před implementací rendereru.

## 8. Dokončovací důkazy

| Oblast | Důkaz |
| --- | --- |
| Sdílené jádro | Stejný řízený scénář CLI/Electron s významově shodnými událostmi, Git i non-Git, změna → ověření → diff → návrat |
| IPC bezpečnost | Neplatný vstup, cizí sender/frame, nepatřící ID, žádný přímý Node/SQLite/filesystem/process přístup z rendereru |
| Chat a stream | Uložení a otevření historie, duplicitní odeslání, průběžný text, přerušený stream, pořadí událostí a obnovení bez duplicity |
| Perzistence | Pád mezi zápisem zprávy a počáteční události, stejné requestId s jiným vstupem, migrace a znovuotevření existující historie |
| Model a chyby | Zobrazení skutečné volby a schopností, limit kroků, auth/rate limit/timeout, zachování zadání, spotřeba známá/neznámá |
| Agentní příkaz | Skutečný výstup před skončením procesu, oddělený stdout/stderr, exit code, délka běhu, zkrácení a bezpečný výstup |
| Oprávnění | Renderer restart během čekání, jedno spuštění po odpovědi, deny, cancel, duplicita a stale digest |
| Lifecycle | Přepnutí chatu, jeden běh na projekt, zavření se zastavením stromu, pád hostitele bez automatického replaye |
| Změny a ověření | Aktuální diff, jednotlivý i úplný návrat, novější ruční změna, zastaralý výsledek a neznámý profil |
| Tajemství | Uložit → restart → použít, nahradit, odstranit, poškozený záznam, nedostupné šifrování, selhání zápisu a nepřítomnost klíče v logu/IPC odpovědi/SQLite |
| Datové podmínky | Otevření projektu nic neodesílá, uložení klíče není souhlas s přenosem, FR-LLM-13 zastaví běh bez potvrzení |
| UI | Screenshoty stavů, světlá/tmavá varianta, klávesové dokončení hlavního toku a čitelnost na předváděcí obrazovce |
| Windows distribuce | Zabalená aplikace, systémový dialog, skutečné OS šifrování a reálný process runner |

Automatické testy běží bez skutečného API klíče a síťového providera.
Windows klíčové a procesní zkoušky používají skutečné produkční adaptéry
a izolovaná data; neprokazují bezpečnost pouhým mockem. Živá kontrola GUI
je samostatný explicitní běh nad syntetickým projektem s nákladovými limity.
Testy se doplní typecheckem, lintem, kontrolou závislostí, R1/R2 regresí,
Windows balením a novou R3 bránou. Existující R0/R2 smoke se zachová.
Autorský checklist vznikne nezaškrtnutý; agent jej nevyplní za autora.
Secret scan použije jednoznačný syntetický klíč: prohledá běžné lokální
datové soubory, SQLite, logy a exporty, ověří nepřítomnost v odpovědích
IPC a zkontroluje odstranění z aktivního nastavení. Datový soubor smí
obsahovat pouze ciphertext, nikoli plaintext klíč. Tento dílčí důkaz
AC-SF-07 není tvrzením, že už byla provedena cloudová bezpečnostní sada.

Samotný plán ani úspěch R3 neoznačí všechna kritéria O1 za splněná.
CLI/UI E2E obsahuje nejméně dvě čtecí/hledací volání, jednu cílenou změnu,
relevantní kontrolu a souhrnný diff (AC-O1-02). R2 opakovatelnost a živý
report zůstávají regresními podklady, nikoli náhradou nového UI důkazu.
AC-O1-03/04 a ostatní O1 brány budou evidovány podle skutečně provedených
běhů; pouhá existence adaptérů nebo použití dřívějšího reportu nestačí
pro tvrzení o nově přidaném desktopovém toku.

## 9. Přechod k plánu

Po porovnání tohoto dokumentu s PRD autor zadal podrobný implementační
plán. [Plán R3](../plans/2026-10-11-r3-implementation.md) rozděluje práci
na trvalé chaty a projekce, backendovou správu běhů, tajemství, IPC a obnovu,
renderer a Windows dokončovací důkazy. Určuje přesné migrace, rozhraní,
limity front, souborové kroky a testovací brány. Plánování není provedení
implementace. Vizuální porovnání čtyř variant zůstává navazujícím návrhovým
výstupem, ne hotovou ani odsouhlasenou obrazovkou.

## 10. Vazba na PRD a rozdělení mezi přírůstky

Tato tabulka je kontrola navrženého rozsahu, nikoli report splnění.
„R3 nad R2“ znamená připojit UI ke stávajícím pravidlům a ověřit je přes
desktopový vstup, nikoli bezpečnostní jádro implementovat podruhé.

| Požadavky PRD | Zařazení a konkrétní výstup |
| --- | --- |
| FR-DESK-01/02/08; FR-UX-01 až 05 | R3: Windows pracovní plocha, omezené privilegované API, povinné stavy a srozumitelné podmínky akcí |
| FR-PROJ-01/04/09 | R3 nad R2: systémový dialog, Git/non-Git a backendové ověření kořene |
| FR-CHAT-01 až 05/11 | R3: seznam a správa chatů, stream, vazby zpráv, potvrzené zastavení a víceřádkové zadání |
| FR-ORCH-01 až 07; PRD §11.5 a §12.2 | R3 nad R2: jediný stav relace, konfigurovatelný limit, pravdivé dokončení, idempotentní zápis zprávy a počátku běhu. Produktový waiting_for_user_input a související část FR-ORCH-02 doplní R4 |
| FR-LLM-01/02/03/05/08/11 | R3 nad R2: skutečný a demo režim, volba připojeného modelu, streaming, chyby a viditelné capability limity |
| FR-PERM-01/02/03/06/07 | R3 nad R2: Řízený režim, přesná žádost, jedno povolení, zamítnutí a audit všech rozhodnutí; nepodporované nástroje se nepřidávají |
| FR-CHG-01 až 06/08; FR-VCS-01 až 07 | R3 nad R2: výchozí uživatelské změny oddělené od agentních, obnovovací data, průběžný i konečný diff, návrat, konflikt, platnost ověření a omezené Git stavy. FR-VCS-06 je v R3 zákaz automatického branch/commit; jejich ovládání dodá R4 |
| FR-TOOL-04/05/06/10; FR-TERM-01/05/06 | R3 nad R2: průběžný procesní výstup, přesný příkaz, výsledek, zrušení stromu a návrat chyb do smyčky; relevance kontroly je samostatný důkaz |
| FR-COORD-01/02/08 až 10/14 | R3 zachovává R2 ochrany revize, hashů, zámků a provenience; zobrazí zastaralé ověření, nerozšiřuje produktovou koordinaci |
| FR-CTX-12 až 17 | Zachovat stávající R2 ochranu kontextu a viditelné odmítnutí. Jednotné pokrytí všech indexů, repo mapy a jednorázových výjimek dodá R4; R3 netvrdí celkové splnění |
| FR-LLM-06/07; AC-SF-07 | Výslovně předsunuto autorem do R3: trvalý chráněný klíč, test/nahrazení/odstranění a lokální secret scan |
| FR-LLM-09/13 | Upozornění před skutečným přenosem; podmíněné vědomé potvrzení bezplatného režimu podle FR-LLM-13 je povinné už v O1 |
| FR-ORCH-08/09; FR-PERM-08; FR-DESK-03 až 06; FR-UX-06 | R3 dodá potřebný snapshot/reconnect, historii, metadata běhu, dva motivy a základní klávesovou cestu. Kompletní nastavení/layouty, recovery a accessibility rozsah ŠF tím nejsou splněné |
| AC-O1-02/05 až 11/15/16/24 | R3 desktopové důkazy a zachované R2 regrese: referenční cyklus, audit, odmítnutí nebezpečného vstupu, cancel/timeout, návrat, reconnect, projektorová čitelnost a invalidace |
| FR-CHAT-12 až 14/19 až 21; FR-ORCH-11; AC-O1-17/18/31 | R4 podle roadmapy: finální @ reference a audit kontextu, strukturované otázky odlišné od oprávnění |
| FR-TS-01 až 08; FR-CTX-01 až 06; FR-TERM-04 | R4: TypeScript profil, relevantní kontroly, progresivní repo mapa a hlubší inicializace |
| FR-VCS-09 až 14/16/20/21 | R4: lokální Git pracovní panel a jeho stavové operace; agentní change-set diff v R3 tento panel nenahrazuje |
| FR-CHAT-06 až 10/15 až 18; FR-WORK; FR-TERM-02/03/07 až 11 | Navazující ŠF: pokračování starého chatu, přílohy, plné layouty, uživatelský terminál, spuštění/náhled a produktový Playwright vision-check. Vybrané pojistky proti duplicitám vznikají dříve v R3 |

Produktové nezařazení Playwright vision-checku do R3 nebrání použití
Playwrightu jako vývojového nástroje pro ověření samotného rendereru.
Zvolená lokální persistence i chráněné klíče jsou v souladu s PRD;
nevzniká změna schválené bezpečnostní hranice nebo oslabení O1 kritérií.
