# Hranice architektury R0

```mermaid
flowchart LR
  Renderer["Renderer: diagnostická stránka"] --> Preload["Preload: validace + úzké API"]
  Preload -->|"r0:diagnostics:run"| Main["Electron main"]
  Main --> Core["backend/core: RunR0Diagnostics"]
  Smoke["--r0-smoke"] --> Core
  Core --> Ports["Core porty"]
  Ports --> Infra["backend/infrastructure"]
  Infra --> SQLite["SQLite + WAL"]
  Infra --> Process["Windows process runner"]
  Infra --> Git["lokální Git probe"]
  Shared["shared: serializovatelné kontrakty"] --> Renderer
  Shared --> Preload
  Shared --> Main
  Shared --> Core
  Shared --> Infra
```

Desktop tvoří frontend a bezpečnostně omezený Electron shell. Renderer nemá Node API a přes preload dostává jen validovanou diagnostickou operaci. `backend/core` obsahuje pravidla a orchestraci, zatímco `backend/infrastructure` provádí konkrétní práci s OS, SQLite a Gitem přes core porty. `shared` obsahuje pouze serializovatelné zprávy, schémata a typy. `test-support` je výhradně testovací workspace a produkční kód jej nesmí importovat.

Interaktivní IPC i headless `--r0-smoke` skládají stejnou instanci `RunR0Diagnostics`; liší se pouze vstupní adaptér.
