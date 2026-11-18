# Trvalé otázky R4

Otázka ukládá bezpečný bod smyčky po dokončené modelové odpovědi. SQLite v jedné transakci uloží otázku, omezenou historii s redakcí, počet kroků, sadu změn, identitu odpovědí adaptéru a stav čekání. Runtime potom uvolní prostředky poskytovatele. Desktopový úkol zůstane rozpracovaný.

Odpověď je vázaná na otázku, běh, chat a identifikátor požadavku. První platná odpověď vyhraje. Opakování shodného požadavku vrátí shodné přijetí a odlišná odpověď se odmítne. Obnovení atomicky převezme uložený bod, připraví aktuální kontext a označí stará data nástrojů jako zastaralá. Původní sada změn a počítadlo kroků pokračují. Další riziková operace prochází obvyklou kontrolou oprávnění.

Po restartu zůstane nezodpovězená otázka dostupná. Restart po přijetí odpovědi mimo tento bezpečný bod označí úkol jako přerušený s požadavkem bezpečné obnovy. Následující modelový tah ani hotové nástroje se automaticky neopakují. Uživatel může zahájit nový úkol. Tím je přiznaná nejistá hranice přijetí odpovědi a vzdáleného volání.

Rozšíření mají deklarativní manifesty. Výběr interního katalogu přidá omezené instrukce a zúží nabídku nástrojů. Plánování dovolí čtení. Ověřování dovolí čtení a samostatně povolené příkazy. Manifest nemá spustitelný vstupní bod.

Obnovení po otázce znovu čte aktuální projekt. Doplnění podle plánu z 18. listopadu 2026 nově připravuje kontext i před každým dalším modelovým tahem. Staré zdrojové výsledky vyžadují současný důkaz čerstvosti. Identita otázky a potvrzené výsledky uživatelských rozhodnutí zůstávají zachované.
