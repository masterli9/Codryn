# Strukturní dotazy TypeScriptu v R4

`typescript.query@1` je čtecí nástroj v existujícím katalogu agenta. Přijímá projektově relativní cestu a druh dotazu. Pro definice, reference, typy a signatury přijímá i jméno nebo pozici. Další dotazy vracejí exporty, diagnostické kódy a hrany importu či reexportu. Výstup má nejvýše 50 položek, 400 znaků na textové pole a 32 KiB. Rozsahy jsou jedničkové a konce jsou uvedené jako první znak za rozsahem.

Host TypeScriptu sestaví nový program v paměti z povolených souborů a omezené konfigurace. Rozlišení modulů vidí pouze soubory načtené přes kanonický kořen a platnou politiku kontextu a standardní knihovny přibaleného TypeScriptu 6.0.3. Ignorované `node_modules` a aliasy mimo kořen nemají přístup do programu. Při chybějících deklaracích je sémantická odpověď omezená. Neplatná nebo chybějící konfigurace umožní syntaktický přehled exportů z cílového souboru. Diagnostika vrací kód, kategorii a rozsah. Tím se vyhne odeslání úryvků a cest z textu hlášení.

Samostatné pracovní vlákno končí po výsledku, zrušení, chybě nebo pěti sekundách. Načtení projektových vstupů má strop 5 000 položek, 64 MiB a 1 MiB na soubor. Backend ověřuje revizi pracovního prostoru, otisk, cílový hash a politiku před a po dotazu. Při změně zahodí položky a vrátí stav `stale`. Běžné čtení a hledání souborů zůstává dostupné po chybě pracovního vlákna.

Pevná sada pokrývá běžný TypeScript, komponentu TSX ve stylu Reactu a konvenci Next.js `app/page.tsx`. Zahrnuje přejmenovaný export, generickou signaturu a úmyslné typové chyby. Úplné rozlišení závislostí frameworků při blokovaných deklaracích má omezenou podporu. Balíček obsahuje samostatný soubor workeru a ověřovací fixture. Zkoušku balíčku spouští `npm.cmd run test:r4-typescript-packaged`.
