# Ověřování TypeScript projektu v R4

Backend prohledá kořenový manifest a kořenovou konfiguraci TypeScriptu s nejvýše osmi konfiguračními soubory po 64 KiB. Do kompilátorového parseru předává jen obsah předem povolených konfigurací a seznam položek uvnitř kanonického kořene. Podporuje relativní dědění konfigurace. Konfigurace z externího balíčku, projektové reference a režimy, které zapisují stav kompilátoru, mají omezenou podporu.

Nabídka určuje přesný příkaz pro přibalený TypeScript 6.0.3 a podporovaný testovací runner. Node testy používají výstup TAP. Pro `vitest run` se nabízí jen existující lokální CLI s výstupem JSON. Příkazy se spouštějí přes stejné oprávnění a časově omezený runner jako v R3. Návrh sám příkaz nespouští. Codryn při rozpoznání ani ověřování neinstaluje závislosti.

Backend před i po příkazu znovu ověří přesnou shodu, konfiguraci, pravidla ignorování, pozorovaný stav projektu a vstupy. Selhání testu se vrátí modelu jako výsledek příkazu. Prázdný, neúplný nebo neplatný výstup nevytvoří úspěšný záznam. Úspěšný běh vyžaduje aktuální kontrolu typů i testů a pokrytí všech provedených změn. Rozsah prvního profilu je konzervativní a zahrnuje povolené zdrojové a běžné konfigurační soubory, manifesty, lockfile a testy. Změna nezávislého souboru mimo tento rozsah zachová platnost. Plná analýza závislostí projektu a přesnější dopady rozsahů patří do navazujících plánů.

TypeScript CLI je v zabalené aplikaci v `resources/typescript/bin/tsc`, přístupný systémovému Node mimo archiv ASAR. `node scripts/verify-packaged-r4-project-checks.mjs` ověří identitu balíčku, verzi TypeScriptu a výsledek přímé kontroly platného i chybného zdrojového souboru.
