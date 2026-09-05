# ADR 0003: Obecné relace pro diagnostiku a agentní běhy

## Stav

Přijato pro R1.

## Kontext

R0 ukládá diagnostickou relaci a její eventy. R1 potřebuje samostatně
identifikovat agentní běh a tool cally, aniž by vydával diagnostiku za agentní
relaci nebo rozdělil auditní historii do nekompatibilních tabulek.

## Rozhodnutí

Migrace 2 zavádí obecný kořen `sessions` s druhem `diagnostic` nebo `agent`.
`diagnostic_sessions` a `agent_runs` jsou subtype projekce nad stejnou
identitou. Tabulka `events` se znovu vytvoří s cizím klíčem do `sessions`, při
zachování ID, sekvence, obálky a payloadu R0. Přidávají se `agent_runs`,
`tool_calls` a potřebné indexy; zápisy běhu a tool callu s jejich událostí jsou
atomické v jedné SQLite transakci.

## Důsledky

R0 data zůstávají dostupná a R1 získá společnou, auditovatelnou historii bez
falešného sjednocení významu diagnostiky a agentního běhu. Odmítli jsme
samostatné event tabulky pro R0 a R1: zhoršily by jednotný event envelope,
migrace i následné dotazy napříč relacemi. Cena je jednorázové přestavění
cizího klíče v migraci a nutnost udržet subtype integritu.

## Ověření

Integrační testy migrují naplněnou R0 databázi na verzi 2, ověřují zachování
relací/eventů, validní foreign keys, idempotentní opakování a odmítnutí změny
checksumu. Testy agentního běhu a tool callu dokazují atomické vytvoření a
stavový přechod s kanonickým eventem.

## Navazující brána

R2 musí zachovat `sessions`, společný event envelope a atomický audit. Přidá-li
zápis, shell, diff nebo návrat, nesmí je ukládat bokem mimo tento mechanismus.
