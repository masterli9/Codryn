# Codryn – Workspace Intelligence a Session Coordinator

| Položka | Hodnota |
| --- | --- |
| Verze návrhu | 0.1 |
| Datum | 12. srpna 2026 |
| Stav | Schválený kandidát pro zapracování do PRD v1.0 |
| Oblast | Živý stav workspace, souběžné relace, kontext, ověřování a ochrana změn |

## 1. Produktová myšlenka

Codryn nemá pouze dovolit spustit více chatů nad stejným projektem. Má udržovat malý, strukturovaný a průběžně obnovovaný provozní model projektu, aby agent rozuměl nejen ostatním relacím, ale také aktuální revizi souborů, stavu Gitu, známým běžícím procesům, výsledkům ověření a změnám, které mohou zneplatnit jeho dosavadní kontext.

Workspace awareness je proto obecná **Workspace Intelligence Layer** orchestrátoru a harnessu. Koordinace relací a doporučení worktree jsou její první viditelný use-case, nikoliv její jediný účel. Stejná vrstva má podporovat výběr aktuálního kontextu, adaptivní ověřování, bezpečnější oprávnění, obnovu přerušené relace, provenienci změn a pozdější projektovou paměť.

Při zahájení nové zapisující relace backend zjistí ostatní aktivní relace v projektu a předá začínajícímu agentovi malý koordinační snapshot. Agent podle něj zvolí jednu z možností:

- pokračovat ve sdíleném workspace;
- upravit rozsah nebo pořadí své práce;
- počkat na jinou relaci;
- požádat uživatele o rozhodnutí;
- navrhnout vytvoření Git worktree.

Worktree není povinný. Ve výchozím režimu jej agent nesmí vytvořit bez souhlasu uživatele.

Codryn nemá v rámci této vrstvy autonomně řídit celý projekt, automaticky slučovat konfliktní změny ani rozhodovat za uživatele o rizikových operacích. Workspace Intelligence poskytuje fakta a omezená doporučení; bezpečnostní hranice nadále vynucuje harness a konečná rozhodnutí s významným dopadem zůstávají uživateli.

## 2. Problém

Uživatel dnes při paralelní práci ručně vysvětluje každému agentovi:

- že ve stejném projektu běží další chat;
- na jakém úkolu jiná relace pracuje;
- kterých souborů nebo subsystémů se pravděpodobně dotkne;
- zda má nový agent použít stejný workspace, počkat nebo vytvořit worktree.

Bez tohoto kontextu může nový agent vytvořit plán založený na zastaralém stavu, změnit sdílený kontrakt nebo přepsat práci druhé relace. Stejný problém ale nastává i bez druhého chatu: během dlouhého běhu se může změnit Git HEAD, ručně upravený soubor, konfigurace, výsledek testu nebo dostupnost lokální služby. Agent pak pokračuje s kontextem, který byl správný při načtení, ale již neodpovídá živému workspace.

Povinný worktree pro každý běh by části konfliktů předcházel, ale u některých projektů přináší nepřijatelnou režii spojenou s instalací závislostí, lokálními daty a správou větví. Samotný worktree navíc neřeší zastaralé výsledky ověření, sdílené externí zdroje, ruční zásahy uživatele ani závislosti mezi úkoly.

## 3. Terminologie

- **Relace/session:** uživatelem vytvořený chat s vlastním agentním během a historií.
- **Subagent:** agent vytvořený rodičovským agentem pro konkrétní omezený úkol.
- **Workspace:** konkrétní lokální projektová složka, nad kterou mohou pracovat relace.
- **Working intent:** stručná strukturovaná deklarace plánované práce relace.
- **Coordination snapshot:** koordinační část context projection obsahující aktuální přehled relevantních souběžných relací.
- **Soft reservation:** nezávazné oznámení, že relace pravděpodobně použije soubor nebo oblast; nejde o zámek.
- **Hard safety check:** kontrola očekávaného hashe/revize před aplikací patchů.
- **Workspace state:** backendem pozorovaná fakta o aktuální revizi projektu, souborech, Gitu, změnách, známých procesech a výsledcích ověření.
- **Workspace revision:** monotónně rostoucí interní revize stavu, která se změní při relevantní události; nenahrazuje hash konkrétního souboru ani Git commit.
- **Context projection:** omezený výřez workspace state a koordinačních metadat sestavený pro konkrétní krok agenta.
- **Context invalidation:** událost oznamující, že konkrétní část dříve získaného kontextu může být kvůli nové změně zastaralá.
- **Verification record:** strukturovaný výsledek typechecku, testu, buildu nebo jiné kontroly svázaný s konkrétní revizí a rozsahem.
- **Shared runtime resource:** známý proces nebo lokální zdroj, například dev server, port, test watcher či projektová databáze, který může ovlivnit více relací.

### 3.1 Vrstvy a odpovědnosti

Workspace Intelligence se skládá ze čtyř oddělených vrstev:

1. **Workspace State** uchovává pouze pozorovatelná fakta a jejich provenienci. Backend je zdroj pravdy; tvrzení agenta je záměr nebo odhad, nikoliv automaticky fakt.
2. **Work Intent** popisuje plánovaný rozsah relace nebo subagenta. Slouží pro koordinaci a může být nepřesný.
3. **Coordination Policy** vyhodnocuje překryv, invalidaci, potřebu čekání, úzkou serializaci, doporučení worktree a nutnost uživatelského rozhodnutí.
4. **Context Projection** předává konkrétnímu agentovi jen informace relevantní pro jeho aktuální krok, aby se celý provozní stav nevkládal do každého promptu.

Orchestrátor používá tyto vrstvy při plánování a skládání kontextu. Harness nadále samostatně validuje vstupy, oprávnění, pracovní adresář, timeout a očekávaný hash. UI zobrazuje stav a umožňuje zásah uživatele, ale není zdrojem pravdy.

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

## 6. Workspace snapshot a context projection

Backend udržuje širší workspace state, ale začínající agent dostane pouze malou kontextovou projekci relevantní pro svůj úkol, nikoliv celý event log ani celé cizí chaty:

```json
{
  "projectId": "project-1",
  "workspaceRevision": 184,
  "observedAt": "2026-08-12T12:00:00Z",
  "gitState": {
    "branch": "main",
    "head": "abc123",
    "workingTreeDirty": true
  },
  "recentRelevantChanges": [
    {
      "path": "src/shared/user.ts",
      "source": "session-42",
      "revision": 183
    }
  ],
  "verificationState": [
    {
      "kind": "typecheck",
      "status": "passed",
      "workspaceRevision": 182,
      "scope": ["src/server/auth/**"]
    }
  ],
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

Snapshot musí mít čas a revizi. Agent jej nesmí považovat za neměnnou pravdu; backend jej obnoví před rizikovou změnou, při relevantní události nebo před použitím dříve uloženého výsledku ověření. Projekce může vynechat nesouvisející procesy, relace i změny. Vynechání znamená „nebylo zahrnuto“, nikoliv „neexistuje“.

### 6.1 Vznik `taskSummary`

V O1 Codryn vytvoří krátké `taskSummary` automaticky z aktuálního uživatelského zadání a strukturovaného plánu agenta. Shrnutí má mít nejvýše jednu až dvě věty, popisovat cíl práce a nesmí bezdůvodně obsahovat citlivé hodnoty ani celý obsah chatu. Při významné změně plánu jej agent aktualizuje. Uživatel vždy vidí aktuálně sdílenou podobu, může ji upravit nebo sdílení shrnutí pro konkrétní relaci vypnout.

Pozdější rozšíření může použít lehký lokální nebo API model k průběžné sumarizaci delšího chatu. Toto řešení má zvyšovat přesnost u dlouhých relací, nikoliv být podmínkou základní koordinace. Musí zachovat stejné limity rozsahu, viditelnost pro uživatele a pravidla ochrany citlivých údajů.

### 6.2 Workspace revision a zdroje změn

Backend zvýší `workspaceRevision` při události, která může změnit rozhodování agenta, například při úspěšném zápisu souboru, rozpoznané ruční změně, změně Git HEAD nebo branche, dokončení stavové Git operace, změně lockfilu či dokončení migrace. Samotný nový chatový text bez dopadu na projekt revizi nezvyšuje.

Každá změna, kterou provedl Codryn, nese zdrojovou relaci, případného subagenta, tool call, čas a change set. Ruční nebo externí změna může mít zdroj `external` a nemusí mít známého autora. `workspaceRevision` slouží k orientaci a invalidaci; zápis do konkrétního souboru vždy chrání jeho očekávaný hash nebo ekvivalentní revize obsahu.

### 6.3 Invalidace zastaralého kontextu

Orchestrátor eviduje, z jakých souborů, symbolů, Git revize a ověřovacích výsledků vznikl relevantní pracovní kontext relace. Při změně některého z těchto podkladů vytvoří `context_invalidated` s důvodem a dotčeným rozsahem.

Invalidace automaticky neruší celý běh. Před dalším krokem se použije nejmenší bezpečná reakce:

- nepodstatná změna pouze obnoví metadata snapshotu;
- změna čteného souboru nebo symbolu vyžádá jeho nové načtení;
- změna základu plánovaného patche zastaví zápis a vyžádá novou analýzu;
- změna sdíleného kontraktu může zneplatnit plán nebo výsledek ověření a vyvolat nové posouzení překryvu.

### 6.4 Výsledky ověření v živém stavu

Výsledek typechecku, testu, buildu nebo jiné kontroly se ukládá jako `verification record` s příkazem či nástrojem, stavem, časem, rozsahem, zdrojovou relací a `workspaceRevision`, nad níž proběhl. Úspěšný výsledek se nesmí prezentovat jako důkaz pro novější relevantně změněný stav bez nového posouzení.

Jiná relace může již existující výsledek použít jako kontext, pouze pokud backend doloží, že od jeho vzniku nedošlo k relevantní změně jeho vstupů. V opačném případě je záznam historická informace a kontrola se doporučí nebo spustí znovu podle pravidel oprávnění.

V ŠF může orchestrátor podle změněných oblastí, repo mapy a historie kontrol navrhnout nejmenší relevantní ověřovací sadu. Agent ani orchestrátor však nesmí vydávat návrh kontroly za skutečně provedené ověření.

### 6.5 Známé procesy a runtime zdroje

V ŠF Codryn eviduje procesy, které sám spustil a dosud spolehlivě sleduje, například dev server, test watcher nebo lokální službu. Záznam obsahuje vlastníka, příkaz bez tajemství, pracovní adresář, PID či interní handle, známý port, stav a způsob bezpečného ukončení.

Registr není úplným monitorem operačního systému. Externě spuštěný proces se označí pouze tehdy, když jej Codryn bezpečně rozpozná; jinak se případná kolize projeví jako běžný výsledek nástroje. Agent nesmí zastavit proces jiné relace nebo uživatele pouze podle názvu či portu bez odpovídajícího oprávnění a ověřené identity procesu.

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

### 7.1 Kontextové vyhodnocení rizika

Workspace state může být vstupem permission enginu nebo pozdějšího klasifikátoru rizika. Nemění pevné bezpečnostní hranice, ale může zvýšit rizikovost jinak běžné operace. Úprava `package.json` je například rizikovější, pokud jiná relace instaluje balíčky, vzniká nový lockfile nebo na původní konfiguraci závisí probíhající ověření.

Rozhodnutí musí uvést konkrétní fakta, která riziko ovlivnila. Workspace Intelligence nesmí sama rozšířit oprávnění relace, obejít povinné `ask` ani automaticky schválit operaci jen proto, že nebyl zjištěn konflikt.

## 8. Strukturované zprávy mezi relacemi

ŠF může podporovat malé typované zprávy:

- `intent_changed` – relace rozšířila nebo změnila plán;
- `shared_contract_change` – mění se sdílený typ/API;
- `file_planned` – relace plánuje změnit konkrétní soubor;
- `file_changed` – soubor byl změněn;
- `conflict_detected` – hash nebo patch již neodpovídá;
- `context_invalidated` – dříve získaný kontext se musí částečně nebo úplně obnovit;
- `dependency_declared` – úkol čeká na konkrétní výstup jiné relace;
- `dependency_ready` – požadovaný výstup nebo kontrakt je připraven;
- `verification_passed` – kontrola uspěla nad uvedenou revizí a rozsahem;
- `verification_failed` – kontrola selhala nad uvedenou revizí a rozsahem;
- `runtime_resource_changed` – změnil se stav známého procesu nebo sdíleného zdroje;
- `handoff_available` – jiná relace publikovala omezený výsledek vhodný k převzetí;
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

## 12. Další využití Workspace Intelligence

### 12.1 Závislosti mezi úkoly a předání výsledku

V ŠF může relace deklarovat, že její další krok závisí na omezeném výstupu jiné relace, například na novém API kontraktu, dokončené migraci nebo výsledku integračního testu. Závislost odkazuje na konkrétní artefakt, oblast nebo událost; nemá znamenat neurčité „čekej na celý chat“.

Po splnění závislosti dostane čekající relace nový context projection a znovu posoudí svůj plán. Převzetí výsledku není automatické slučování změn. Pokud se změnil soubor, z něhož vychází připravený patch, stále platí hashová kontrola a nová analýza.

### 12.2 Chytřejší plánování a delegace

Před vytvořením subagenta může orchestrátor použít workspace state k rozpoznání, zda je úkol skutečně nezávislý, zda již stejnou oblast neanalyzuje jiná relace a zda lze delegaci provést pouze ke čtení. Workspace Intelligence poskytne podklady, ale hlavní agent odpovídá za vymezení úkolu a začlenění výsledku.

Automatické rozdělování celých projektů, samostatné přidělování priorit a slučování více větví bez kontroly uživatele nejsou cílem školní verze.

### 12.3 Obnova přerušené relace

Při návratu ke starší relaci orchestrátor porovná její poslední známou revizi s aktuálním workspace state a vytvoří stručný rozdílový snapshot, například změnu Git HEAD, relevantně upravené soubory, zastaralá ověření a ukončené procesy. Agent nesmí pokračovat, jako by se stav projektu nezměnil.

Rozdílový snapshot není automatická sumarizace celé historie projektu. Obsahuje pouze fakta potřebná k bezpečnému obnovení daného úkolu a odkazy na podrobnější auditní události.

### 12.4 Vstup pro projektovou paměť

Ověřené události Workspace Intelligence mohou později aktualizovat repo mapu nebo LLM Wiki, například vazbu sdíleného kontraktu na testy, pravidlo o generovaném souboru nebo známý ověřovací příkaz. Projektová paměť musí odlišit deterministicky zjištěné skutečnosti, uživatelsky potvrzená pravidla a modelové inference.

Krátkodobý živý workspace state a dlouhodobá projektová paměť nejsou totožné. Proces, aktuální Git větev či dočasný výsledek testu patří do živého stavu; stabilní architektonické pravidlo může po validaci přejít do dlouhodobé paměti.

## 13. UI

Projekt musí podle rozsahu dané etapy viditelně ukázat:

- počet aktivních relací;
- jejich stručný úkol a stav;
- zda používají společný workspace nebo worktree;
- plánované a skutečně změněné oblasti;
- varování před možným překryvem;
- koordinační zprávy a rozhodnutí;
- strom rodičovských agentů a subagentů;
- aktuálnost kontextu a konkrétní invalidované podklady;
- stav ověření včetně revize, nad níž proběhlo;
- známé procesy a jejich vlastníka;
- závislosti mezi úkoly a připravené handoffy.

Varování nemá blokovat nízkorizikovou práci. U vysokého překryvu musí být nepřehlédnutelné a navazovat na konkrétní akci.

## 14. Etapizace

### O1 minimum

- základní Workspace State s monotónní `workspaceRevision`, časem pozorování, Git stavem a zdrojem změn;
- detekce více aktivních relací ve stejném projektu;
- omezený context projection pro začínajícího agenta;
- základní working intent;
- automatické, uživatelsky kontrolovatelné `taskSummary` z aktuálního zadání a plánu agenta;
- seznam změněných souborů podle relace;
- invalidace přímo čteného souboru nebo základu patche po relevantní změně;
- verification record navázaný na konkrétní revizi workspace a rozsah kontroly;
- ochrana patchů pomocí očekávané revize/hashů;
- strom subagentů a nejméně jeden skutečný delegovaný paralelní úkol;
- přímý zápis subagenta do společného workspace s auditní proveniencí a hashovou ochranou.

### ŠF rozšíření

- průběžná aktualizace `taskSummary` lehkým modelem u delších relací;
- průběžná aktualizace working intent;
- vyhodnocení nízkého/možného/vysokého překryvu;
- typované koordinační zprávy;
- cílená invalidace symbolů, sdílených kontraktů a výsledků ověření;
- doporučení nejmenší relevantní ověřovací sady podle změn a repo mapy;
- registr Codrynem spuštěných procesů a runtime zdrojů;
- omezené závislosti mezi úkoly a handoff konkrétního výsledku;
- workspace fakta jako vstup kontextového vyhodnocení rizika;
- rozdílový snapshot při obnově přerušené relace;
- doporučení pokračovat / počkat / změnit rozsah / worktree;
- volitelné vytvoření worktree po souhlasu uživatele;
- UI přehled souběžné práce a konfliktních oblastí.

### PŠ

- automatické politiky týmové koordinace;
- vzdálené relace na více zařízeních;
- pokročilé slučování výsledků více agentů;
- autonomní rozdělování a plánování rozsáhlých projektů;
- učení pokročilých projektových pravidel z dlouhodobé historie po explicitní validaci;
- týmové role, rezervace a organizační pravidla.

## 15. Návrh akceptačních kritérií

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
14. Každý context projection obsahuje čas a `workspaceRevision`; chybějící oblast se neinterpretuje jako důkaz její neexistence.
15. Změna souboru, z něhož vychází připravený patch, vytvoří invalidaci a patch se bez nového načtení a nového očekávaného hashe neaplikuje.
16. Výsledek ověření je dohledatelně svázán s revizí a rozsahem; po relevantní změně jej UI ani agent nesmí označit jako aktuální úspěšný důkaz.
17. Při obnovení relace nad novější revizí dostane agent rozdílový snapshot relevantních změn před pokračováním v zapisující práci.
18. Codryn nezastaví proces jiné relace nebo externí proces pouze podle shodného názvu či portu bez ověřené identity a odpovídajícího oprávnění.
19. Workspace state použitý při rozhodnutí o oprávnění je uveden v auditním důvodu a nikdy sám nerozšíří oprávnění relace.

## 16. Rizika

- **Zastaralý intent:** agent změní plán bez aktualizace; mitigace je sledování skutečných zápisů a nové vyhodnocení.
- **Falešný pocit bezpečí:** agenti jsou informovaní, ale konflikt stále může nastat; mitigace je hashová ochrana.
- **Tokenová režie:** příliš velké přehledy souběhu; mitigace je strukturovaný snapshot s limitem.
- **Únik obsahu mezi chaty:** soukromý chat se nesmí celý předat jinému; sdílí se jen projektová pracovní metadata a schválené shrnutí.
- **Koordinační smyčka:** agenti si posílají zprávy bez pokroku; mitigace je typovaný protokol, limity a eskalace uživateli.
- **Nejasná provenance:** změny více relací ve stejném souboru; mitigace je change set na úrovni tool callu, hash a auditní události.
- **Příliš široká invalidace:** každá změna restartuje plánování a zvyšuje cenu; mitigace je vazba kontextu na konkrétní soubory, symboly a revize a použití nejmenší bezpečné reakce.
- **Falešné znovupoužití ověření:** úspěšný test zůstane viditelný po změně vstupů; mitigace je vazba na revizi, rozsah a explicitní stav `stale`.
- **Neúplný runtime registr:** externí proces není znám nebo PID již patří jinému procesu; mitigace je evidence pouze ověřených procesů spuštěných Codrynem a opětovná kontrola identity před akcí.
- **Přetížení snapshotu:** živý stav naroste do velikosti celého event logu; mitigace je oddělení úplného backendového stavu od malé účelové context projection.
- **Záměna inference za fakt:** modelový odhad se zapíše jako skutečnost; mitigace je povinný typ zdroje `observed`, `user_confirmed` nebo `inferred` a odlišná důvěryhodnost.

## 17. Otevřené otázky před PRD v1.0

- Jak se zobrazí soft reservations, aby nepůsobily jako tvrdé zámky?
- Jak dlouho se uchovávají koordinační události a pracovní záměry?
- Které události přesně zvyšují globální `workspaceRevision` a které mají jen vlastní dílčí revizi?
- Jak se určí relevantní vstupy ověření bez falešného tvrzení, že starý výsledek je stále platný?
- Jak dlouho zůstává runtime resource považovaný za živý a jak se bezpečně ověřuje identita procesu po restartu aplikace?
- Které typy závislostí mezi úkoly patří do ŠF a které již znamenají příliš složitý projektový scheduler?
- Která ověřená workspace fakta mohou přejít do LLM Wiki a kdo jejich povýšení schválí?
- Jak se změří přínos oproti pouhému upozornění „běží další relace“?
- Je obdobná funkce dostupná v aktuálních konkurenčních nástrojích a jak přesně se liší?
