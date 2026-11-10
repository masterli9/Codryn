# R3 E3 – průběžný výstup příkazu a živá odpověď modelu

Dne 8. listopadu 2026 jsme navázali na [vizuální průchod z 1. listopadu](2026-11-01-r3-e3-visual.md) a [živou sérii z 1. listopadu](../../evals/r3-desktop-2026-11-01.md). Samostatný průchod sleduje dvě mezery E3 v distribučním balíčku Windows. Lokální protokoly, izolované profily a snímky jsou v ignorovaném adresáři `.r3-artifacts/2026-11-08-e3-stream/`.

## Co se měří

- **Příkaz** běží v novém referenčním projektu. Připravený modelový scénář požádá o skutečný izolovaný příkaz. Jeho standardní výstup `stdout` a diagnostický výstup `stderr` mají odlišné textové značky. Obě značky musí být vidět v detailu běhu a být uložené na správném proudu ještě před existencí koncového výsledku. Pozorovatel porovná procesní identitu podle ID procesu a času jeho spuštění. Kontroluje pracovní proces, přímý příkaz a jeho potomka před snímkem i po něm.
- **Zastavení** vyvolá Tab a Enter na skutečném tlačítku „Zastavit“. Po doběhu se porovná koncový stav úlohy, fáze běhu, příznak `treeStopped` a původní identity všech tří procesů. Naplánovaný soubor potomka musí chybět i po době, kdy by ho stále běžící potomek vytvořil. Pozorovatel zachytí změny fáze a zkusí pořídit snímek přechodného stavu „Zastavování…“.
- **Model** dostane jedinou syntetickou textovou úlohu o koloběhu vody. Pozorovatel zaznamená částečnou odpověď přímo ve vykresleném chatu při označení „Codryn · píše…“ a dostupném zastavení. Porovná ji s delší konečnou odpovědí a s časy skutečných příchozích textových a koncových událostí poskytovatele. Při živém běhu měření žádnou událost úmyslně nezdržuje. Suchý běh projde produkčním adaptérem s in-memory testovací odpovědí bez sítě.

Systémové dialogy výběru testovací složky a zavření nahrazuje testovací ovladač v hlavním procesu. Používá skutečný distribuční Electron, uživatelské rozhraní, mezivrstvu preload, komunikaci s backendem a lokální databázi. Před i po běhu se kontroluje identita balíčku. Playwright řídí desktopový proces a klávesnici.

## Nákladový rámec

Opětovný audit tří dřívějších protokolů napočítal 70 požadavků s celkovým odhadem 0,0102730 USD a konzervativní rezervou 0,203958501 USD z autorem povolených 0,25 USD. Pro doplněk se použil konzervativně zaokrouhlený zůstatek 0,04604149 USD.

Standardní sazby GPT-6 Luna pro krátký kontext byly 8. listopadu ověřeny na oficiální modelové stránce. Vstup stojí 0,10 USD a výstup 0,50 USD za milion tokenů. Odhad nákladů vychází z tohoto ceníku. [OpenAI GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)

Testovací finanční brána omezuje živý běh na jedno odeslání na přesnou adresu Responses API, 120 sekund, 32 KiB těla a 4096 výstupních tokenů. Rozpočtový limit brány je 0,006 USD a maximální odhad z uvedených mezí je 0,0057344 USD. Rezervace se ukládá na disk před odesláním požadavku a soubor vytvořený výhradně pro živý průchod brání druhému spuštění. Klíč z místní `.env` se načte až při výslovném spuštění živého režimu a přes Nastavení se uloží do chráněného testovacího profilu. Protokol zapisuje časy, počty, rezervu a údaje o spotřebě. Po zavření se kontrolují soubory izolovaného běhu v UTF-8 i UTF-16LE.

## Příprava ovladače

Všech osm testů dříve kontrolované finanční brány prošlo znovu. Předběžná kontrola spočítala rozpočet a ověřila kanonickou cestu Node bez otevření profilu, bez čtení klíče a bez sítě.

První dva pokusy na původním balíčku B5 zůstávají uložené s neúspěšným výsledkem. Příkazový projekt postrádal povinné soubory reference pro demo a nedošel k založení běhu. Při suché zkoušce modelu se vykreslilo 357 průběžných a 551 finálních znaků bez odeslání síťového požadavku. Závěrečná kontrola ale zaměnila trvalý stav úlohy `finished` za fázi agenta `completed`. Ovladač doplnil referenční soubory a odlišil oba stavy.

Finální balíček se sestavil po opravě hlášení chyby v detailu změn. Identita zdrojů je `357c70756dce80a1698723e581f9aa695bd17b0bf58d8fe4e13333fbc94fea8b`, identita archivu aplikace je `6dcc3e710870279b7b0ce00fc0212a9e2e07db253ff8db90a1eaec20707319f9` a spustitelného souboru `6d0042cd63953a0a6b51f84d522204a7a60b8d1a43074676fd2cfda17bd7d97c`.

## Živý text GPT‑6 Luna

Suchý průchod `model-offline-jeRkxb` na finálním balíčku prošel. V chatu bylo 357 znaků 2260 ms před ukončením simulované odpovědi a 2528 ms před uloženým ukončením běhu. Konečný text měl 551 znaků a shodoval se s uloženou zprávou. Skutečných síťových požadavků bylo nula. Kontrola 49 souborů nenašla testovací klíč.

Živý průchod `model-live-q81kPZ` na témže balíčku prošel jediným požadavkem s HTTP 200. Poskytovatel poslal 748 textových úseků. Prvních **56 znaků** bylo vidět s označením „Codryn · píše…“ a dostupným zastavením **4691 ms před událostí dokončení odpovědi OpenAI** a 4787 ms před uloženým ukončením běhu. Částečný text byl začátkem delšího výsledku s **2157 znaky**. Konečný text souhlasil s uloženou zprávou a běh nepoužil žádný nástroj. Snímek `model-streaming-candidate.png` byl pořízen a zkontrolován v průběžném stavu. `model-completed.png` ukazuje konečný stav.

Poskytovatel vykázal 643 vstupních a 752 výstupních tokenů. Odhad nákladů je **0,0004403 USD**. Před voláním byla zapsaná skutečná rezerva **0,0027688 USD**, takže kumulativní rezerva vzrostla na **0,206727301 USD** a souhrnný odhad na **0,0107133 USD**. V 49 souborech zavřeného izolovaného běhu nebyl při kontrole v UTF-8 ani UTF-16LE nalezen klíč. Živý test zachytil jeden běh bez umělého pozdržení přenosu.

## Příkaz a klávesnicové zastavení

Průchod `command-AWOWpv` na finálním balíčku prošel. V detailu běhu byly současně vidět značky **E3 STDOUT** a **E3 STDERR**. U příkazu svítilo `running · probíhá` a chat zobrazoval „Ověřuje výsledek“. Identita pracovního procesu, přímého příkazu i jeho potomka souhlasila před snímkem i po něm. V databázi byly oba odpovídající proudy a dosud žádný koncový výsledek. Snímek `command-running-verifying.png` zachycuje oba proudy a fázi.

Ovladač přešel 35 stisky Tab na skutečné tlačítko „Zastavit“ se zřetelným 3px obrysem a stiskl Enter. Rozhraní zobrazilo „Zastaveno“ za 255 ms. Uložená úloha měla stav `finished`, fázi `cancelled` a příkaz potvrdil `treeStopped: true`. Nezávislá kontrola Windows nenašla žádnou ze tří původních procesních identit. Kontrolní soubor potomka chyběl i 254 ms po jeho naplánovaném termínu, 13 sekund od jeho startu. Zachovaly se snímky `stop-keyboard-focus.png` a `command-stopped.png`. Krátký stav „Zastavování…“ pozorovatel v rozhraní nezachytil.

Dva předchozí příkazové pokusy na finálním balíčku zůstaly v evidenci. První použil testovací soubor s jinou kontrolní hodnotou, než vyžaduje referenční demo. Druhý spustil proces, jehož vygenerovaný testovací skript měl syntaktickou chybu. Úspěšný pokus převzal přesné referenční soubory z repozitáře a předem zkontroloval syntaxi obou vygenerovaných skriptů.
