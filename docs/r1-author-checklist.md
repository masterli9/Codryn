# R1 – autorský checklist porozumění

Tyto položky vysvětluje autor vlastními slovy; nezaškrtává je implementátor.

- [ ] Vysvětlím rozdíl mezi modelovým adapterem, orchestrátorem, registrem a harnessem.
- [ ] Vysvětlím, proč fake adapter testuje skutečný harness, i když nenahrazuje live model.
- [ ] Vysvětlím, proč CLI nesmí vlastnit agentní pravidla.
- [ ] Vysvětlím, co přesně tvoří jeden krok a proč existuje limit.
- [ ] Vysvětlím, kdy je tool call validovaný, povolený a skutečně spuštěný.
- [ ] Vysvětlím, proč automaticky povolené čtení stále potřebuje audit oprávnění.
- [ ] Vysvětlím, jak realpath kontrola brání úniku přes symlink.
- [ ] Vysvětlím, proč event log neukládá plný obsah přečtených souborů.
- [ ] Vysvětlím, proč R1 `completed` neznamená `verified`.
- [ ] Vysvětlím, jak migrace zachová R0 data a proč agentní běh není diagnostická relace.
- [ ] Vysvětlím, proč se významová determinističnost porovnává bez UUID a časů.
- [ ] Vysvětlím, které konkrétní hranice musí zůstat stabilní pro R2.
