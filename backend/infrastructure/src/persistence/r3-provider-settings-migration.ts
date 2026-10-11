export const r3ProviderSettingsSql=`CREATE TABLE provider_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),mode TEXT NOT NULL CHECK(mode IN ('demo','openai')),
  max_steps INTEGER NOT NULL CHECK(max_steps BETWEEN 1 AND 32),key_version INTEGER NOT NULL CHECK(key_version>=0),
  tested_at TEXT,test_result TEXT NOT NULL CHECK(test_result IN ('not_tested','passed','failed')),
  consent_version TEXT
) STRICT;
INSERT INTO provider_settings VALUES(1,'demo',16,0,NULL,'not_tested',NULL);`;
