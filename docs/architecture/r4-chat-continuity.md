# Návaznost projektového chatu v R4

Po trvalém přijetí zadání vyhledá backend jeho uživatelskou zprávu podle ID požadavku a ověří vlastnictví chatu. SQLite vrátí nejvýše devět starších dokončených běhů téhož chatu. Z každého vezme původní zadání a dokončenou odpověď z koncového kroku. Tím se vynechají průběžné komentáře, přerušené nebo neúspěšné odpovědi a výsledky nástrojů. Chybějící odpověď z koncového kroku zastaví přípravu běhu před voláním modelu.

Výběr začíná u nejnovější dokončené výměny. Po odstranění chráněné hodnoty klíče se do kontextu vejde nejvýše osm dvojic a celkem 32 KiB textu v UTF-8. Pokud se další dvojice nevejde, skončí výběr na tomto místě. Pokud se nevejde už nejnovější dvojice, pokračuje běh bez předchozího rozhovoru a aktivita uvede důvod.

OpenAI dostane instrukci ověřit aktuální stav souborů, potom předchozí zprávy v chronologickém pořadí s původní rolí, nové zadání a aktuální projektový kontext. Výsledky nástrojů se přidávají průběžně jen z aktuálního běhu. Načítání aktuálních souborů dál podléhá pravidlům projektu.

Událost `conversation.context_selected` ukládá ID vybraných zpráv, počet zpráv a bajtů, příznak zkrácení a důvod. Odeslaná historie se započítává také do společného rozpočtu kontextu a jeho auditu. Aktivita v aplikaci ukazuje počet použitých zpráv a případné zkrácení. Upozornění k přenosu dat do OpenAI zahrnuje historii a vyžaduje potvrzení nové verze.
