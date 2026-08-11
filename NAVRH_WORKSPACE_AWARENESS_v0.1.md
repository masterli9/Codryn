# Codryn – Workspace Awareness a Session Coordinator

| Položka | Hodnota |
| --- | --- |
| Verze návrhu | 0.1 |
| Datum | 11. srpna 2026 |
| Stav | Schválený kandidát pro zapracování do PRD v1.0 |
| Oblast | Souběžné relace, subagenti, Git/worktree, ochrana změn |

## 1. Produktová myšlenka

Codryn nemá pouze dovolit spustit více chatů nad stejným projektem. Má aktivním agentům poskytnout strukturované povědomí o tom, že ve stejném pracovním prostoru probíhá další práce, aby mohli svůj postup vědomě koordinovat.

Při zahájení nové zapisující relace backend zjistí ostatní aktivní relace v projektu a předá začínajícímu agentovi malý koordinační snapshot. Agent podle něj zvolí jednu z možností:

- pokračovat ve sdíleném workspace;
- upravit rozsah nebo pořadí své práce;
- počkat na jinou relaci;
- požádat uživatele o rozhodnutí;
- navrhnout vytvoření Git worktree.

Worktree není povinný. Ve výchozím režimu jej agent nesmí vytvořit bez souhlasu uživatele.

## 2. Problém

Uživatel dnes při paralelní práci ručně vysvětluje každému agentovi:

- že ve stejném projektu běží další chat;
- na jakém úkolu jiná relace pracuje;
- kterých souborů nebo subsystémů se pravděpodobně dotkne;
- zda má nový agent použít stejný workspace, počkat nebo vytvořit worktree.

Bez tohoto kontextu může nový agent vytvořit plán založený na zastaralém stavu, změnit sdílený kontrakt nebo přepsat práci druhé relace. Povinný worktree pro každý běh by konfliktům předcházel, ale u některých projektů přináší nepřijatelnou režii spojenou s instalací závislostí, lokálními daty a správou větví.

## 3. Terminologie

- **Relace/session:** uživatelem vytvořený chat s vlastním agentním během a historií.
- **Subagent:** agent vytvořený rodičovským agentem pro konkrétní omezený úkol.
- **Workspace:** konkrétní lokální projektová složka, nad kterou mohou pracovat relace.
- **Working intent:** stručná strukturovaná deklarace plánované práce relace.
- **Coordination snapshot:** aktuální přehled souběžných relací předaný agentovi.
- **Soft reservation:** nezávazné oznámení, že relace pravděpodobně použije soubor nebo oblast; nejde o zámek.
- **Hard safety check:** kontrola očekávaného hashe/revize před aplikací patchů.

## 4. Určení aktivní relace

Backend nesmí spoléhat pouze na čas poslední zprávy. Relace je relevantní pro koordinaci, pokud je v některém z těchto stavů:

- `running` – agent právě plánuje nebo používá nástroj;
- `waiting_for_approval` – běh může po rozhodnutí pokračovat;
- `recently_writing` – relace nedávno zapisovala a její úkol není uzavřený;
- `idle_with_changes` – agent neběží, ale změnová sada relace zůstává aktivní;
- `stopping` – probíhá ukončení nástroje nebo procesního stromu.

Stavy `completed`, `cancelled` a uzavřený `failed` se nepovažují za aktivní, jejich nevrácené změny však mohou být uvedeny jako stav pracovního stromu.

Stav `recently_writing` trvá pět minut od posledního úspěšného zápisu, pokud relace mezitím znovu nezačne běžet, čekat na schválení nebo zapisovat. Každý další zápis časovač obnoví. Po uplynutí pěti minut relace:

- přejde do `idle_with_changes`, pokud její nevrácená změnová sada stále ovlivňuje pracovní strom;
- přestane být aktivní pro koordinaci, pokud po ní žádné aktivní změny nezůstávají.

Pětiminutová hodnota je výchozí systémová politika O1, nikoliv odhad podle času poslední chatové zprávy. `idle_with_changes` zůstává v koordinačním snapshotu bez časového předstírání, že agent stále pracuje.

## 5. Working intent

Začínající agent vytvoří před první zapisující akcí deklaraci podobnou:

```json
{
  "mode": "write",
  "summary": "Přidat autentizační API endpointy",
  "expectedAreas": [
    "src/server/auth/**",
    "src/shared/user.ts"
  ],
  "sharedResources": [
    "package.json"
  ]
}
```

Working intent:

- může být nepřesný a průběžně se aktualizuje;
- slouží ke koordinaci, nikoliv jako bezpečnostní oprávnění;
- nesmí zabránit legitimnímu čtení jiné části projektu;
- při významném rozšíření zapisovaného rozsahu vyvolá nové posouzení překryvu.

## 6. Coordination snapshot

Začínající agent dostane pouze malý strukturovaný přehled, nikoliv celé cizí chaty:

```json
{
  "projectId": "project-1",
  "activeSessions": [
    {
      "sessionId": "session-42",
      "taskSummary": "Upravit autentizační backend",
      "state": "executing_tool",
      "intentAreas": ["src/server/auth/**", "src/shared/user.ts"],
      "changedFiles": ["src/server/auth/login.ts"],
      "branch": "main",
      "usesSeparateWorktree": false
    }
  ]
}
```

Snapshot musí mít čas a revizi. Agent jej nesmí považovat za neměnnou pravdu; backend jej obnoví před rizikovou změnou nebo při nové koordinační události.

### 6.1 Vznik `taskSummary`

V O1 Codryn vytvoří krátké `taskSummary` automaticky z aktuálního uživatelského zadání a strukturovaného plánu agenta. Shrnutí má mít nejvýše jednu až dvě věty, popisovat cíl práce a nesmí bezdůvodně obsahovat citlivé hodnoty ani celý obsah chatu. Při významné změně plánu jej agent aktualizuje. Uživatel vždy vidí aktuálně sdílenou podobu, může ji upravit nebo sdílení shrnutí pro konkrétní relaci vypnout.

Pozdější rozšíření může použít lehký lokální nebo API model k průběžné sumarizaci delšího chatu. Toto řešení má zvyšovat přesnost u dlouhých relací, nikoliv být podmínkou základní koordinace. Musí zachovat stejné limity rozsahu, viditelnost pro uživatele a pravidla ochrany citlivých údajů.

## 7. Vyhodnocení překryvu

Codryn rozlišuje orientačně tři úrovně:

### Nízký překryv

- odlišné deklarované oblasti;
- žádný společný měněný soubor;
- žádný společný package manager nebo stavová Git operace.

Agent je informován a může pokračovat.

### Možný překryv

- společné sdílené typy, konfigurace, testovací utility nebo lockfile;
- neúplná deklarace některé relace;
- jedna relace rozšiřuje pracovní rozsah.

Agent musí překryv zahrnout do plánu a může odeslat druhé relaci koordinační zprávu.

### Vysoký překryv

- obě relace plánují zápis do stejného souboru nebo úzké oblasti;
- jedna relace právě změnila očekávaný základ druhé;
- souběžná stavová Git operace;
- neslučitelné záměry nad stejným kontraktem.

Agent má navrhnout počkání, změnu rozsahu, uživatelské rozhodnutí nebo worktree. Codryn worktree bez výchozího uživatelského souhlasu nevytvoří.

## 8. Strukturované zprávy mezi relacemi

ŠF může podporovat malé typované zprávy:

- `intent_changed` – relace rozšířila nebo změnila plán;
- `shared_contract_change` – mění se sdílený typ/API;
- `file_planned` – relace plánuje změnit konkrétní soubor;
- `file_changed` – soubor byl změněn;
- `conflict_detected` – hash nebo patch již neodpovídá;
- `work_completed` – relevantní část práce skončila;
- `user_decision_needed` – koordinace potřebuje autoritu uživatele.

Zprávy nejsou volný chat agentů. Mají limit velikosti, auditní událost, zdrojovou relaci a čas.

## 9. Ochrana proti tichému přepsání

Workspace awareness pouze snižuje pravděpodobnost konfliktu. Každý cílený patch musí stále obsahovat očekávanou revizi nebo hash původního obsahu.

Pokud se soubor mezitím změnil:

1. patch se neaplikuje;
2. událost se označí jako konflikt;
3. agent dostane nový obsah nebo omezený diff;
4. agent změnu znovu analyzuje;
5. nový patch znovu projde oprávněními a validací.

Poslední zapisující relace nikdy nesmí tiše přepsat předchozí změnu pouze proto, že byla spuštěna později.

## 10. Serializované sdílené operace

Některé krátké operace se mají serializovat i ve sdíleném workspace:

- instalace, odebrání nebo aktualizace balíčků a každá operace měnící stejný lockfile;
- `git checkout`, `reset`, změna branche, merge, rebase a jiné operace měnící stav stejného worktree nebo sdílené Git reference;
- migrace stejné lokální projektové databáze.

Zámky jsou vázané na konkrétní zdroj, například Git worktree/repozitář, lockfile nebo databázi. Serializace má být co nejužší a nesmí blokovat běžné editace různých souborů, čtení ani nezávislé operace nad jiným zdrojem.

Spouštění a zastavování dev serverů se v O1 centrálně neserializuje. Bývá legitimní provozovat více serverů a jejich spolehlivé rozpoznávání podle názvu procesu by bylo nepřesné. Kolize portu nebo jiného runtime zdroje se proto zachytí jako běžný výsledek procesu a zobrazí se agentovi; koordinátor může pouze předat informaci o známém běžícím procesu, nikoliv jej automaticky zamknout či zastavit.

## 11. Subagenti

O1 musí umožnit rodičovskému agentovi vytvořit subagenta pro omezený úkol, například:

- analýzu frontendové oblasti;
- hledání relevantních symbolů;
- kontrolu testů;
- rešerši architektonické otázky;
- nezávislou revizi navržené změny.

Pravidla:

- subagent dostává konkrétní úkol a omezený kontext;
- dědí stejná nebo užší oprávnění než rodič;
- nemůže si sám rozšířit projektové hranice;
- jeho události, nástroje a výsledek mají vlastní ID a jsou viditelné ve stromu práce;
- rodič může subagenta zastavit a odpovídá za začlenění výsledku;
- subagent smí už v O1 přímo zapisovat do společného workspace;
- každý jeho zápis používá stejnou kontrolu očekávané revize nebo hashe jako zápis samostatné relace; při změně základu se patch zastaví a subagent musí nový obsah znovu analyzovat;
- změnová sada a každý zápis uchovávají identitu subagenta i rodičovské relace, aby byla dohledatelná provenance a bylo možné bezpečně vracet změny;
- souběžné stavové operace nad Gitem, lockfilem, balíčkovacím nástrojem nebo projektovou databází podléhají stejné úzké serializaci jako u samostatných relací; dev servery se centrálně neserializují.

## 12. UI

Projekt musí viditelně ukázat:

- počet aktivních relací;
- jejich stručný úkol a stav;
- zda používají společný workspace nebo worktree;
- plánované a skutečně změněné oblasti;
- varování před možným překryvem;
- koordinační zprávy a rozhodnutí;
- strom rodičovských agentů a subagentů.

Varování nemá blokovat nízkorizikovou práci. U vysokého překryvu musí být nepřehlédnutelné a navazovat na konkrétní akci.

## 13. Etapizace

### O1 minimum

- detekce více aktivních relací ve stejném projektu;
- coordination snapshot pro začínajícího agenta;
- základní working intent;
- automatické, uživatelsky kontrolovatelné `taskSummary` z aktuálního zadání a plánu agenta;
- seznam změněných souborů podle relace;
- ochrana patchů pomocí očekávané revize/hashů;
- strom subagentů a nejméně jeden skutečný delegovaný paralelní úkol;
- přímý zápis subagenta do společného workspace s auditní proveniencí a hashovou ochranou.

### ŠF rozšíření

- průběžná aktualizace `taskSummary` lehkým modelem u delších relací;
- průběžná aktualizace working intent;
- vyhodnocení nízkého/možného/vysokého překryvu;
- typované koordinační zprávy;
- doporučení pokračovat / počkat / změnit rozsah / worktree;
- volitelné vytvoření worktree po souhlasu uživatele;
- UI přehled souběžné práce a konfliktních oblastí.

### PŠ

- automatické politiky týmové koordinace;
- vzdálené relace na více zařízeních;
- pokročilé slučování výsledků více agentů;
- týmové role, rezervace a organizační pravidla.

## 14. Návrh akceptačních kritérií

1. Začínající relace obdrží do svého prvního plánovacího kroku přehled všech relevantních aktivních relací stejného projektu.
2. Coordination snapshot neobsahuje celé zprávy z cizího chatu, pouze povolené shrnutí a pracovní metadata.
3. Dvě relace mohou paralelně změnit různé soubory bez povinného worktree.
4. Patch založený na zastaralém hashi je ve 100 % konfliktových fixture odmítnut před zápisem.
5. Vysoký překryv vede k viditelnému varování a agent jej musí zohlednit před dalším zápisem.
6. Worktree se ve výchozím režimu nevytvoří bez uživatelského souhlasu.
7. Návrat změnové sady jedné relace nesmí odstranit pozdější změnu jiné relace; při nejistotě skončí konfliktem.
8. Subagent nikdy nezíská širší oprávnění než rodič a jeho tool cally jsou dohledatelné pod vlastním ID.
9. Subagent může v O1 přímo změnit soubor, ale patch založený na neaktuální revizi je odmítnut stejně jako patch samostatné relace.
10. U každé změny provedené subagentem lze dohledat subagenta, rodičovskou relaci, tool call a příslušnou změnovou sadu.
11. Uživatel před sdílením nebo během práce vidí `taskSummary`, může jej upravit či vypnout a jiná relace nedostane původní obsah cizího chatu.
12. Relace bez dalšího zápisu opustí `recently_writing` po pěti minutách; s nevrácenými změnami přejde do `idle_with_changes`, bez nich přestane být aktivní pro koordinaci.
13. Dvě relace nemohou současně provést konfliktní stavovou Git operaci, změnit stejný lockfile ani migrovat stejnou databázi; běžné editace a dev servery tento zámek nepoužívají.

## 15. Rizika

- **Zastaralý intent:** agent změní plán bez aktualizace; mitigace je sledování skutečných zápisů a nové vyhodnocení.
- **Falešný pocit bezpečí:** agenti jsou informovaní, ale konflikt stále může nastat; mitigace je hashová ochrana.
- **Tokenová režie:** příliš velké přehledy souběhu; mitigace je strukturovaný snapshot s limitem.
- **Únik obsahu mezi chaty:** soukromý chat se nesmí celý předat jinému; sdílí se jen projektová pracovní metadata a schválené shrnutí.
- **Koordinační smyčka:** agenti si posílají zprávy bez pokroku; mitigace je typovaný protokol, limity a eskalace uživateli.
- **Nejasná provenance:** změny více relací ve stejném souboru; mitigace je change set na úrovni tool callu, hash a auditní události.

## 16. Otevřené otázky před PRD v1.0

- Jak se zobrazí soft reservations, aby nepůsobily jako tvrdé zámky?
- Jak dlouho se uchovávají koordinační události a pracovní záměry?
- Jak se změří přínos oproti pouhému upozornění „běží další relace“?
- Je obdobná funkce dostupná v aktuálních konkurenčních nástrojích a jak přesně se liší?
