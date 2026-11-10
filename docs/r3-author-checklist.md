# R3 — osobní průchod autora

Tento checklist je osobní potvrzení autora, nikoli automatický test. Všechny položky začínají nezaškrtnuté. Agent je za autora nevyplňuje. Automatické výsledky jsou oddělené v [akceptaci](r3-acceptance.md); záznam průchodu použije [šablonu](evidence/r3-author-session-template.md).

Datum: __________  Autor: __________  Windows/obrazovka: __________
Source/ASAR/EXE hash: __________  Profil a syntetický projekt: __________

- [ ] Spustil jsem skutečný distribuční `Codryn.exe` a zaznamenal přesnou build identitu.
- [ ] Otevřel jsem složku skutečným systémovým folder dialogem; zrušení dialogu nic nezměnilo.
- [ ] Nad Git fixture jsem prošel zprávu, čtení/hledání, rozhodnutí oprávnění patche (může být automaticky povolené pravidlem), ruční approval testu, výstup, diff a návrat. Původní index/HEAD i moje vlastní změny zůstaly zachované.
- [ ] Stejnou cestu jsem prošel v nové non-Git fixture a návrat obnovil původní obsah.
- [ ] Zákaz schválení neprovedl požadovanou akci; důvod je čitelný v aktivitě.
- [ ] Novější ruční editace/stale potvrzení návratu se neztratilo; rozumím konfliktu a postupu další kontroly.
- [ ] Reload během čekání na approval zachoval stav; jediná odpověď vedla nejvýše k jedinému spuštění.
- [ ] Při skutečně běžícím příkazu byl stdout/stderr viditelný před koncem. Zastavení bylo backendem potvrzené.
- [ ] Ve skutečném close dialogu jsem ověřil Zůstat i Zastavit a zavřít. Restart nic automaticky nepřehrál.
- [ ] Bezpečně uložený klíč po úplném restartu zůstal dostupný; ověřil jsem nahrazení a odstranění bez zachycení hodnoty do screenshotu/protokolu. Pokud používám syntetický klíč, neoznačuji tím live autentizaci.
- [ ] Přímá nastavení a návrat k aktivnímu běhu fungují; test připojení není zaměněný za souhlas s projektem.
- [ ] Hlavní cestu jsem dokončil klávesnicí, včetně dialogů a návratu fokusu; zaznamenal jsem konkrétní překážky.
- [ ] Ve světlém i tmavém motivu jsou prázdno, chyba, čekání, running, approval, výsledek a diff čitelné; přiložil jsem skutečné screenshoty bez tajemství.
- [ ] Ověřil jsem 900×640, 1280×720 a 1440×900 a skutečnou předváděcí obrazovku; text, fokus a kritické akce jsou dostupné.
- [ ] Rozumím limitu referenčního profilu oproti R4 a umím vysvětlit jednu cestu UI → backend → oprávnění → změna → ověření → návrat.
- [ ] Pro každý živý předváděný krok mám připravenou offline zálohu a lokální záznam; demo modelové volby označuji jako připravené.

Živá zkouška: samostatný datovaný protokol; jeden smoke není AC-O1-04. Nové tvrzení desktop 4/5 vyžaduje pět aktuálních pokusů, nejméně čtyři úspěšné, přesný build, rozpočet, timeout a usage. [Prázdná šablona](evals/r3-desktop-template.json) není výsledek. Čistá instalace a dvouminutové AC-O1-01 patří do R5.

Osobní rozhodnutí autora po průchodu: **dosud nepotvrzeno**.
Nálezy / blokátory / odkazy: __________
