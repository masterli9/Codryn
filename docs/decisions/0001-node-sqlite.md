# ADR 0001: node:sqlite pro R0

## Stav

Přijato pro R0.

## Kontext

R0 potřebuje lokální, auditovatelnou perzistenci bez ORM a bez dalšího nativního balíčku.

## Rozhodnutí

Používáme `node:sqlite` výhradně v infrastrukturním adaptéru za porty z core. SQL migrace jsou ruční, verzované a chráněné kontrolním součtem. Databáze běží ve WAL režimu s předpokladem jednoho aplikačního zapisovače. ORM nepřidáváme.

## Důsledky

Core nezná SQLite ani SQL. Adaptér lze nahradit bez změny pravidel core. WAL zlepšuje souběh, ale není záloha; R0 proto vytváří a obsahově ověřuje samostatnou kopii.

## Ověření

Integrační testy dokazují bezpečnostní PRAGMA, idempotentní migrace, odmítnutí změněného checksumu, atomický zápis session + úvodního eventu a ověřenou zálohu.

## Navazující brána

Další etapa musí znovu posoudit single-writer předpoklad před přidáním paralelních zapisovačů.
