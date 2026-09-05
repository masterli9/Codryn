# R1 – autorský checklist porozumění

Tyto položky vysvětluje autor vlastními slovy; nezaškrtává je implementátor.

- [x] Vysvětlím rozdíl mezi modelovým adapterem, orchestrátorem, registrem a harnessem.
- [x] Vysvětlím, proč fake adapter testuje skutečný harness, i když nenahrazuje live model.
- [x] Vysvětlím, proč CLI nesmí vlastnit agentní pravidla.
- [x] Vysvětlím, co přesně tvoří jeden krok a proč existuje limit.
- [x] Vysvětlím, kdy je tool call validovaný, povolený a skutečně spuštěný.
- [x] Vysvětlím, proč automaticky povolené čtení stále potřebuje audit oprávnění.
- [x] Vysvětlím, jak realpath kontrola brání úniku přes symlink.
- [x] Vysvětlím, proč event log neukládá plný obsah přečtených souborů.
- [x] Vysvětlím, proč R1 `completed` neznamená `verified`.
- [x] Vysvětlím, jak migrace zachová R0 data a proč agentní běh není diagnostická relace.
- [x] Vysvětlím, proč se významová determinističnost porovnává bez UUID a časů.
- [x] Vysvětlím, které konkrétní hranice musí zůstat stabilní pro R2.
