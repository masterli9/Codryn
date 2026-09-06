# ADR 0005: W1 – guarded publication na Windows

## Stav

Přijato pro W4 adapter (6. září 2026).

## Kontext

R2 musí před každým produkčním zápisem prokázat ochranu intervalu mezi
poslední kontrolou hashe a publikováním obsahu. Samotné pořadí
`read → hash → temp → rename` takovou ochranu neposkytuje. Experiment proto
spouští skutečné PowerShell procesy jako kandidátního writera i konkurujícího
editora. Bariéry `loaded`, `checked`, `publish` a `reset` jsou explicitní;
náhodné čekání se nepoužívá.

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
- procesní pád před atomickým publikováním,
- výměnu junctionu a nadřazené složky,
- hardlink cíle.

Naměřený report při 100 iteracích (čtyři izolované dávky po 25 závodech):

```json
{
  "supported": true,
  "partialPublications": 0,
  "overwrittenExternalWrites": 0,
  "escapedPaths": 0
}
```

## Rozhodnutí

W1 přijímá mechanismus složený z těchto částí:

1. Cíl se otevře přes nativní overlapped handle s plným sdílením a ověří se,
   že má právě jeden hardlink. Na cíli se drží read-write oplock
   (`FSCTL_REQUEST_OPLOCK`); konkurující zápis je proto zablokován nebo
   odmítnut a guard dostane pozorovatelný break.
2. Skutečný rodič se otevře jako stabilní handle a jeho lexikální vnější
   adresář dostane read-only oplock. Tím se zachytí výměna junctionu nebo
   přejmenování rodiče, aniž by se blokovalo vlastní publikování.
3. Kandidát se zapisuje do temp souboru. Publikace používá
   `SetFileInformationByHandle(FileRenameInfoEx)` s absolutní cestou a příznaky
   `FILE_RENAME_REPLACE_IF_EXISTS | FILE_RENAME_POSIX_SEMANTICS`. Host odmítl
   relativní `FileRenameInfo` s `ERROR_INVALID_PARAMETER`, proto se W4 nesmí
   tvářit, že relativní variantu podporuje; absolutní cesta je bezpečná jen
   spolu s předchozí kanonickou kontrolou a adresářovými oplocky.
4. Race větev je fail-closed: při breaku se kandidát nepokouší o publikování,
   guard se uvolní a externí editor může dokončit. Čistý scénář zvlášť
   prokazuje, že `FileRenameInfoEx` bez konkurence uspěje.

Tento mechanismus je vstupem pro W4 `GuardedWriter`; W4 nesmí použít prostý
`read → hash → writeFile` ani původní cestový `MoveFileEx`. W5 zůstává závislé
na úspěšné implementaci a integračních testech W4.

## Důsledky a meze

- Bezpečný odmítnutý zápis je přípustný, ale neznamená podporovaný writer.
- Výsledek se nevztahuje na síťové, vyměnitelné ani jiné filesystemy mimo
  testované lokální Windows 11 prostředí; probe je záměrně host-integration.
- W4 musí před otevřením odmítnout UNC/device/ADS/reparse cíle a filesystemy,
  které tento mechanismus neprokáže; prostý `read → hash → writeFile` není
  povolená záložní cesta.
- Ukončení procesu není důkaz obnovy napájení; report proto uvádí pouze
  pozorovaný procesní pád.
- 100 závodů je kvůli host časovému rozpočtu rozděleno do čtyř izolovaných
  dávek; celkový počet závodů zůstává 100. Běh host testu na tomto stroji trvá
  přibližně 40 sekund, proto má explicitní 45s exec a 50s Vitest timeout.

## Ověřené platformní zdroje

- [Microsoft: FILE_RENAME_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_rename_info)
- [Microsoft: SetFileInformationByHandle](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfileinformationbyhandle)
- [Microsoft: Breaking oplocks](https://learn.microsoft.com/en-us/windows-hardware/drivers/ifs/breaking-oplocks)
