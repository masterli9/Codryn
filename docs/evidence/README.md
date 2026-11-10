# Evidence R3

[Prázdná JSON šablona](../evals/r3-desktop-template.json) odkazuje na [JSON Schema](r3-live-report.schema.json), strojový popis tvaru protokolu. Má `status:not_run` a `attempts:[]`; **není to passed report**. Je to dokumentační kontrakt, nikoli hotový live runner ani příkaz, který provede placené pokusy. Nepřepisujte staré měření R2 na desktopové.

Pro jeden GUI smoke vytvořte samostatný datovaný popis skutečných kroků; nepoužívejte status passed pětipokusové akceptace. Nové AC-O1-04 vyžaduje právě pět aktuálních pokusů a nejméně čtyři úspěšné. Před pokusy zaznamenejte aktuální source/ASAR/EXE hash, host, OpenAI Responses/gpt-6-luna, verzi souhlasu, celkový USD budget, způsob jeho vynucení a způsob vynucení timeoutu. GUI nabízí pouze limit kroků; ten sám není nákladový strop. Před placeným requestem musí být skutečné omezení vyřešené.

Každý pokus má jedinečné ID 1–5, čas, syntetickou fixture a Git/non-Git režim, zadání scénáře, timeout, limit kroků, vlastní budget, délku, výsledek, bezpečný důvod a vlastníka chyby (model/harness/provider/environment/unknown), usage a důkazové cesty. `usage.known:false` znamená null tokeny; neznámý náklad je null a nikdy se nevydává za nulový. Náklad je odhad s datovaným ceníkovým podkladem, nikoli potvrzení fakturace.

`assertions` zachycuje skutečně pozorované čtení/hledání, patch, approval, relevantní ověření, diff, návrat, permission/reload, stream před koncem a nepřítomnost klíče. Kontrolor musí navíc posoudit věcný úspěch, unikátnost ID, součet/rezervaci nákladů proti budgetu a aktuálnost všech důkazů. Samotná validace JSON nenahrazuje kontrolu tvrzení ani nezajišťuje finanční strop. Selhání ochrany klíče, permission/reload, streamu, bezpečného návratu či potvrzeného procesu je blokátor dokončení R3, i kdyby prostý počet úspěchů byl 4/5.

Nikdy nezapisujte klíč, raw HTTP hlavičky, soukromý projekt nebo hodnoty tajemství do JSON, screenshotů ani logů. Použijte syntetická data a bezpečné error kódy. Skutečné klíče se necommitují. Pro osobní zkušenost použijte [autorskou šablonu](r3-author-session-template.md); agent nezaškrtává [checklist](../r3-author-checklist.md).
