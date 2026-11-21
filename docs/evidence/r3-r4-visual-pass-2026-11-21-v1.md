# R3/R4 — cílený vizuální a klávesnicový průchod v1

Datum: 21. listopadu 2026
Typ: automatický offline průchod; nejde o osobní přijetí autora ani o úplné uzavření R3/R4.

## Použitý build

Spuštěn byl již existující zabalený Windows build přes Playwright Electron helper. Nové sestavení neproběhlo. Otisky se před během i po něm shodovaly s `.r3-artifacts/build.json`:

| Část | SHA-256 |
| --- | --- |
| Zdroj | `d2bde68019763b4056ae4a33553bffbb89d481c4e7ae6d2455e10604d8c752b7` |
| ASAR | `6418032f00a2f56e9e20a170a111ea2e1118325c099eda119bca5383fa2d19ad` |
| EXE | `5f25ea1bb867bab27c32f7d1fe833678ec4ddec878ffbd13f8dc061b450bd2c3` |

Runtime: Electron 43.4.0, Node 24.18.1, Windows (`win32`). Průchod používal nový lokální profil a syntetický non-Git projekt. Nebyl zadán API klíč ani odeslán požadavek poskytovateli.

## Postup a výsledek

Reprodukce z kořene repozitáře v tomto workspace:

```powershell
node .r3-artifacts/2026-11-21-visual/run.mjs
```

Skript před spuštěním ověří build proti uložené identitě a na konci ji ověří znovu. Vytvoří samostatný profil, otevře zabalenou aplikaci nad syntetickým projektem a uloží protokol i snímky do `.r3-artifacts/2026-11-21-visual/`.

- Úvodní plocha: 900×640, 1280×720 a 1440×900, světlý i tmavý motiv — 6 snímků.
- Po založení chatu: stabilní prázdný chat, 1280×720, oba motivy — 2 snímky. Před snímkem skript čeká na konec stavu „Načítání chatu…“.
- Klávesnice: Tab → Enter na „Otevřít projekt“, „Uložit chat“ a „Nastavení“. Každý ovladač měl viditelný focus-visible obrys 3 px. Escape zavřel nastavení a vrátil fokus na tlačítko, které jej otevřelo.
- Ve všech 8 snímcích se změřená šířka dokumentu i těla vešla do okna. Během běhu bylo 0 chyb stránky a 0 chyb konzole.

Soubory důkazu:

- [Úplný strojový protokol](../../.r3-artifacts/2026-11-21-visual/report.json)
- [Spustitelný QA skript](../../.r3-artifacts/2026-11-21-visual/run.mjs)
- [Úvodní plocha, světlá, 900×640](../../.r3-artifacts/2026-11-21-visual/no-project-900x640-light.png)
- [Úvodní plocha, tmavá, 900×640](../../.r3-artifacts/2026-11-21-visual/no-project-900x640-dark.png)
- [Prázdný chat, světlý, 1280×720](../../.r3-artifacts/2026-11-21-visual/empty-chat-1280x720-light.png)

První pokus měřil okno bez čekání na dokončení změny velikosti a zachytil starou šířku. Po doplnění čekání na stabilní rozměry opakování prošlo. Jde o opravu pozorovatele QA; nebyla zjištěna produkční chyba.

## Hranice důkazu

Helper nahrazuje systémový výběr složky a potvrzení zavření aplikace v hlavním Electron procesu. Tato systémová okna tedy nebyla ověřena. Snímek chatu dokládá prázdnou konverzaci nad fixture, ne pokračování R4 chatu.

Průchod nepokrývá klávesnicí celý pracovní tok, běžící příkaz a jeho stdout/stderr, skutečné zastavení, potvrzovací dialog zavření, uložení klíče přes restart, plnou Git/non-Git cestu, reference `@`, TypeScript dotazy, ověřovací cyklus ani živý model. Neověřuje čitelnost na autorově projektoru. Automatické screenshoty nenahrazují autorovo osobní přijetí a neuzavírají otevřené akceptační brány.

## Checklist generálky pro autora

Checklist je záměrně nezaškrtnutý. Záznam doplňte až při vlastním průchodu distribuční aplikace; pořiďte nový datovaný protokol s identitou buildu, rozlišením a screenshoty bez tajemství.

- [ ] Zaznamenat hash EXE/ASAR/zdroje a spustit skutečnou distribuční aplikaci.
- [ ] Otevřít skutečný systémový dialog složky; ověřit výběr i zrušení.
- [ ] Projít malý úkol ve fixture s Gitem i bez něj: čtení, změna, schválení potřebné kontroly, výsledek, diff a návrat. Ověřit zachování původních i vlastních změn.
- [ ] Ověřit zamítnutí akce a konflikt po novější ruční editaci; zkontrolovat srozumitelný důvod a zachování obsahu.
- [ ] Během čekajícího oprávnění obnovit renderer a ověřit, že akce neproběhne dvakrát.
- [ ] Při skutečně běžícím příkazu ověřit viditelný stdout i stderr před dokončením a backendem potvrzené zastavení.
- [ ] Ve skutečném dialogu zavření ověřit „Zůstat“ i „Zastavit a zavřít“ a že restart nic automaticky nepřehraje.
- [ ] Ověřit hlavní tok klávesnicí přes dialogy, Enter/Escape a návrat fokusu.
- [ ] Ve světlém i tmavém motivu projít prázdný, chybový, čekající, běžící, approval, výsledek a diff na 900×640, 1280×720 a 1440×900; doplnit skutečné rozlišení projektoru.
- [ ] V jednom R4 chatu položit navazující prompt; ověřit předchozí výměnu, čerstvý obsah změněného souboru, `@` referenci, relevantní TypeScript dotaz, ověřovací příkaz a lokální Git diff.
- [ ] Připravit offline záložní záznam pro každý živě předváděný krok; živý modelový eval evidovat zvlášť včetně počtu pokusů a povoleného rozpočtu.

**Osobní rozhodnutí autora:** dosud nepotvrzeno.
