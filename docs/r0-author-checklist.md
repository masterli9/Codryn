# R0 author checklist

Autor musí bez čtení zdroje řádek po řádku vlastními slovy vysvětlit:

1. Rozdíl mezi Electron rendererem, preloadem a main procesem.
2. Proč frontend nedostává obecné Node API ani obecné IPC API.
3. Rozdíl mezi `backend/core` a `backend/infrastructure`.
4. Proč je `node:sqlite` skryté za backend rozhraním.
5. Co mění WAL a proč není záloha.
6. Proč se session a úvodní event zapisují v jedné transakci.
7. Jak checksumy migrací brání nechtěnému přepsání historie.
8. Jak se závody timeoutu a limitu výstupu vypořádají právě jednou.
9. Proč `taskkill` není sandbox.
10. Proč Git fixture nemůže kontaktovat síťový remote.
11. Proč lze bezpečně reportovat kategorii credential helperu, ale ne hodnotu credentialu.
12. Jak se stejný `RunR0Diagnostics` dostane do testů, IPC a packaged smoke režimu.

Implementační milník není předaný, dokud autor všech dvanáct bodů nevysvětlí.
