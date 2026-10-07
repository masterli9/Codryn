# R2: identita projektu a starší historie

Composition root váže otevřený projekt na jeho kanonický kořen získaný přes
`realpath` (na Windows bez rozlišení velikosti písmen). SQLite ukládá tuto
hodnotu do unikátního `workspaces.root_identity` a při dalším otevření vrací
stejné `projectId`. Návrat změn ověřuje vlastníka sady proti tomuto aktuálnímu
projektu ještě před čtením souborů, změnou stavu nebo zápisem. Také obnova
odmítá požadavek na jiné `projectId`.

Starší implementace ukládala do `root_identity` pouze náhodné UUID totožné
s `projectId`. Takový řádek neobsahuje důvěryhodnou vazbu na cestu. Zejména
u non-Git projektu nelze bezpečně odvodit původní kořen podle stejného názvu
souboru, shodného hashe, obsahu nebo umístění společné databáze.

Proto se staré řádky automaticky nepřiřazují a nemažou. Nové otevření vytvoří
samostatnou vazbu kanonického kořene; následující otevření ji již obnoví.
Historické sady a audit zůstanou zachované, ale jejich privilegovaný návrat
přes novou vazbu projektu bude odmítnut. Případný budoucí převod staré historie
vyžaduje explicitní, důvěryhodné přiřazení vlastníka; nejde o automatickou
migraci podle podobnosti dat.

Tuto kompatibilitu ověřuje test `preserves legacy UUID-only identities
without guessing their project root` ve `verification-store.test.ts`.

Známý ověřovací profil R2 používá manifest `sum.test.mjs` a `sum.mjs`.
Oba soubory musí být skutečně zahrnuté v dokončeném skenu a povolené
aktuálními pravidly kontextu. Neúplný sken, ignorovaný soubor, citlivá cesta
nebo cíl přeskočený pozorovatelem nemohou vytvořit relevantní ověřovací důkaz.
Manifest je pouze přechodná metadata živého skenu; samotný uložený snapshot
bez nového pozorování není podkladem pro zahájení ověřování.
