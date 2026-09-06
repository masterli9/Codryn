# ADR 0006: R2 – vlastnictví stromu procesů přes Windows Job Object

## Stav

Přijato pro P3 `command.run@1` (6. září 2026). R0 `WindowsProcessRunner`
zůstává nezměněný a jeho `taskkill /T /F` není tímto ADR povýšen na bezpečnostní
hranici.

## Kontext

R2 může spustit schválený omezený příkaz pouze tehdy, když před zahájením
uživatelského kódu převezme vlastnictví celého podporovaného stromu a po
timeoutu, zrušení nebo limitu výstupu umí strom ukončit. Samotný vztah parent/
child ani `taskkill /T /F` neposkytují tento důkaz pro obecný shell.

## Rozhodnutí

P1 používá malý nativní helper `scripts/spikes/r2-process-job.cs` přes
PowerShell worker `scripts/spikes/r2-process-worker.ps1`:

1. helper vytvoří Job Object s `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`;
2. cílový proces vytvoří v režimu `CREATE_SUSPENDED`;
3. ještě před `ResumeThread` se ověří `AssignProcessToJobObject`;
4. při uzavření helperu se uzavře job handle, což ukončí celý podporovaný strom;
5. identita každého fixture procesu obsahuje PID, název a UTC start ticks, aby
   se kontrola po ukončení nezaměnila s novým procesem na recyklovaném PID.

Zdrojový proces i potomci jsou vytvořeni bez dědění standardních handle a
fixture handshake používá soubory `ready`, `stop`, `done` a identity JSON.
Batch worker kompiluje helper jednou pro sadu scénářů; pořadí je řízeno těmito
bariérami, nikoli odhadem pomocí `sleep`.

## Důkaz

Probe: `node scripts/spikes/r2-process-probe.mjs`.
Host test: `npm.cmd test -- backend/infrastructure/test/r2-process-probe.test.ts`.

Výsledek na Windows 11:

```json
{
  "supported": true,
  "orphanCount": 0,
  "maxTerminationDelayMs": 508,
  "cases": [
    "child", "grandchild", "early-parent-exit", "timeout",
    "cancel", "output-limit", "host-crash", "pid-reuse-evidence"
  ]
}
```

Host test dokončil 1 test bez chyb za 18,59 s. Probe obsahuje 8 reportovaných
případů; `pid-reuse-evidence` spouští dvě samostatné identity. Před vystavením
P3 musí stejný ownership adapter používat command runner, ne pouze tento
experiment.

## Omezení

- Job Object není sandbox: R2 stále neslibuje izolaci sítě, privilegií,
  breakaway procesů ani škodlivého příkazu mimo schválené bounds.
- `CREATE_BREAKAWAY_FROM_JOB`, administrativně vynucené breakaway a některé
  systémové procesy nejsou podporovaný strom; runner je musí uvést jako
  `termination_failed`, nikoli tvrdit úspěch.
- Důkaz platí pro lokální Windows 11 host a testované PowerShell fixture.
  Neplatí automaticky pro UNC, síťové filesystemy ani zabalený Electron host;
  ten je samostatnou P3 gate.
- Host crash je v probe simulován ukončením workeru; ověřuje uzavření job
  handle operačním systémem, nikoli obnovu napájení.

## Reference

- [Microsoft: Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)

Licence: `r2-process-job.cs` obsahuje pouze vlastní P/Invoke wrapper nad
Windows API; nepřebírá externí zdrojový kód ani runtime závislost.
