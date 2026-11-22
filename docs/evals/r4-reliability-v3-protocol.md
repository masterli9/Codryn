# Protokol opakovatelnosti R4 v3

Protokol se uzavírá před prvním placeným požadavkem série. Sada má tři syntetické TypeScript scénáře, každý poběží dvakrát se stejným modelem `gpt-6-luna` přes OpenAI Responses API. Každý pokus používá vlastní lokální projekt, profil a chat. Všechny pokusy běží sériově. Výjimkou uvnitř jednoho pokusu je navazující chat, kde dva běhy záměrně použijí jeden chat. [Zafixovaná sada v3](../../tests/support/r4-eval/dataset-v3.json)

## Podmínky úspěchu

| Scénář | Doklad |
| --- | --- |
| `storage-question` | Otázka o rozsahu ukládání před první změnou, pevná volná odpověď uživatele a obnova stejného běhu. Změní se jen modul ukládání, po posledním zápisu proběhnou samostatně schválené typy a všechny čtyři původní testy. Testy ověřují výchozí nulu, trvalost po novém načtení modulu, přepis hodnoty a nezávislost úložišť. Formulaci otázky rozpoznává textová heuristika. |
| `repair-git` | Schválený původní test se dokončí před prvním zápisem s očekávaným chybným výsledkem `nextCount(1)` a se všemi třemi pojmenovanými selháními. Změní se jen modul čítače. Po posledním zápisu musí zvlášť projít schválené typy a úplný původní test pro kladnou, nulovou a zápornou hodnotu. Backend musí doložit rozsah obou kontrol i ověřené dokončení. |
| `continuation-current` | První běh odpoví přesnou původní hodnotou. Ovladač mezi zadáními změní dvě hodnoty zdrojového souboru. Druhé zadání odkazuje na předchozí zadání v témže chatu bez opakování názvu symbolu nebo hodnoty. Poslední vstup druhého běhu obsahuje předchozí dvojici zpráv a aktuální zdrojový důkaz z dodaného kontextu nebo nástroje. Závěrečná odpověď obsahuje pouze správnou novou hodnotu. Soubory zachovají ruční změnu a agent je nezapíše. |

## Pořadí a stropy

Každý slot má strop 0,054 USD a 12 požadavků na API. Ovladač povoluje až 24 kroků agentní smyčky na jedno zadání, nejvýše 240 sekund na scénář včetně obou tahů navazujícího chatu a nejvýše 4 096 výstupních tokenů na požadavek. Dosažení libovolného stropu se započte do výsledku slotu. Původní v2 scénář ukládání měl stejných 24 kroků a 240 sekund, ale vyšší strop 24 požadavků a 0,15 USD.

| Slot | Scénář | Prefix reportu v `docs/evals/` |
| --- | --- | --- |
| 1 | `storage-question` | `r4-live-reliability-v3-01-storage` |
| 2 | `repair-git` | `r4-live-reliability-v3-02-repair` |
| 3 | `continuation-current` | `r4-live-reliability-v3-03-continuation` |
| 4 | `storage-question` | `r4-live-reliability-v3-04-storage` |
| 5 | `repair-git` | `r4-live-reliability-v3-05-repair` |
| 6 | `continuation-current` | `r4-live-reliability-v3-06-continuation` |

Ke každému prefixu náleží `<prefix>-2026-11-22.json` a `<prefix>-2026-11-22-diagnostics.json`. Každý pokus před startem ověří, že oba názvy jsou volné. Nevyužitý strop se nepřevádí a slot se neopakuje. Chybějící report znamená neúspěšný slot a započtení plných 0,054 USD. Neznámá spotřeba v hotovém reportu se účtuje celou rezervací příslušného běhu. Budoucí další pokusy by byly samostatnou sérií.

Před prvním živým slotem jsme opravili původně plánovaných 0,06 USD na shodných 0,054 USD pro všech šest slotů. Oficiální ceník uvádí běžný vstup 0,10 USD, čtení cache 0,01 USD, zápis cache 0,125 USD a výstup 0,50 USD za milion tokenů. Výchozí doba cache je 30 minut, bez příplatku za delší dobu, kterou tento adaptér nevyžaduje. Horní odhad i každá nová rezervace nyní účtují všechny vstupní tokeny sazbou 0,125 USD a výstup sazbou 0,50 USD. Reasoning je součást výstupu. Nejde o fakturaci ani rozpad skutečných typů cache. [Ceník](https://developers.openai.com/api/docs/models/gpt-6-luna) · [Pravidla cache](https://developers.openai.com/api/docs/guides/prompt-caching)

Původní historický základ 0,2348362 USD používal vstupní sazbu 0,10 USD, a proto nebyl horní mezí pro cache writes. Původní reporty neměníme. Ze všech známých běhů před v2 přičítáme k 0,0838565 USD částku 561 205 × 0,025 / 1 000 000: opravený horní odhad je 0,097886625 USD. U přerušeného běhu ponecháváme celou rezervaci a přeceníme pouze vstupní díl: 0,1091421 + (0,1091421 − 23 × 4 096 × 0,50 / 1 000 000) × 0,25 = 0,124651625 USD. Stejným postupem zachováváme celou rezervaci v2: 0,0418376 + (0,0418376 − 9 × 4 096 × 0,50 / 1 000 000) × 0,25 = 0,047689 USD. Historický konzervativní základ je tedy 0,27022725 USD. Šest stropů po 0,054 USD znamená celkové plánované maximum 0,59422725 USD pod autorizovanými 0,60 USD. Strojový rozpis je v [cenovém auditu](r4-reliability-v3-pricing-audit.json).

Všech šest slotů zůstává ve jmenovateli. Souhrn uvede počet splněných opakování každého scénáře, konečný stav, požadavky, čas, podíl platných argumentů a počet volání obsloužených backendem. Obsloužené volání může vrátit očekávané selhání příkazu, jehož návratový kód má samostatnou metriku. Výsledek platí pro tento malý soubor opakovaných případů a uvedené stropy. Celkový podíl není odhadem obecné spolehlivosti GPT‑6 Luna nebo Codrynu.

## Zmrazení před placenou sérií

Po cenové opravě prošel hostitelský offline průchod 3/3 bez placených požadavků. První report s příponou `pricing-final` vznikl bez diagnostiky kvůli chybnému přepínači ovladače a zůstává zachován; opakování `pricing-audited` ukládá i diagnostiku. [Závěrečný report](r4-offline-reliability-v3-pricing-audited-2026-11-22.json) · [Diagnostika](r4-offline-reliability-v3-pricing-audited-2026-11-22-diagnostics.json)

Dataset má SHA-256 `dea9315b966b36d4e7edc310785c8cf6eadf551707ea19fcd30d51ee56fccc30`, produktový zdroj `2d119a4616c7caa351c5e78531d616b0cf11ac1558e295c06772d10d55bdc89e`. [Zmrazená identita](r4-reliability-v3-frozen-identity.json) zaznamenává samostatně všech 11 otisků ovladače, fixture, vyhodnocovačů, rozpočtu a schématu. Tyto soubory, prompty, očekávání a limity se mezi sloty nemění. Před prvním placeným slotem se tento protokol a přesné soubory commitují a odešlou na autorizovanou větev.
