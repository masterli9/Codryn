# ADR 0005: W1 – guarded publication na Windows

## Stav

Zamítnuto pro první implementaci R2 (6. září 2026).

## Kontext

R2 musí před každým produkčním zápisem prokázat ochranu intervalu mezi
poslední kontrolou hashe a publikováním obsahu. Samotné pořadí
`read → hash → temp → rename` takovou ochranu neposkytuje. Experiment proto
spouští skutečný PowerShell proces jako kandidátní writer a proces Node jako
konkurující editor. Bariéry `loaded`, `checked`, `publish` a `reset` jsou
explicitní; náhodné čekání se nepoužívá.

## Experiment

Spuštění:

```text
node scripts/spikes/r2-write-probe.mjs --iterations 100
```

Protokol ověřil lokální dočasný adresář na Windows 11 a tyto případy:

- in-place editor po poslední kontrole,
- temp-and-rename editor,
- změnu stejné délky s obnoveným časem změny,
- otevřený konkurenční writer,
- handle s omezeným sdílením,
- pád během in-place publikování,
- výměnu junctionu a nadřazené složky,
- hardlink cíle.

Naměřený report při 100 iteracích:

```json
{
  "supported": false,
  "partialPublications": 1,
  "overwrittenExternalWrites": 102,
  "escapedPaths": 1
}
```

## Rozhodnutí

Kandidátní temp-nahrazení přes nativní `MoveFileEx` s příznaky pro nahrazení
a zápis přes cache je atomické z hlediska celého souboru, ale není podmíněné
stejnou identitou a obsahem cíle. V závodě přepsalo externí změnu. Handle
otevřený s `FileShare.Read` odmítl konkurenční zápis, avšak varianta, která
publikuje přes tentýž handle in-place, zanechala po pádu částečný soubor.
Nahrazení linky navíc změnilo vztah hardlinku.

Proto se tento mechanismus nesmí použít jako produkční `GuardedWriter`.
W4 a W5 se nespouštějí. Probe a tento ADR zůstávají jako reprodukovatelný
negativní důkaz; další pokus musí dodat prokazatelnou handle/oplock nebo jinou
platformní primitivu a zopakovat všechny případy včetně crash scénáře.

## Důsledky a meze

- Bezpečný odmítnutý zápis je přípustný, ale neznamená podporovaný writer.
- Výsledek se nevztahuje na síťové, vyměnitelné ani jiné filesystemy mimo
  testované lokální prostředí.
- Ukončení procesu není důkaz obnovy napájení; report proto uvádí pouze
  pozorovaný procesní pád.
- W2 a W3 mohou pokračovat jako čisté kontrakty a persistentní podklad, ale
  nesmí publikovat soubor bez nové úspěšné W1 brány.
