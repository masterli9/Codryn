export const r2LeaseSql = `CREATE TABLE resource_leases (
  resource_key TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  fence INTEGER NOT NULL CHECK(fence > 0),
  expires_at INTEGER NOT NULL,
  effect_active INTEGER NOT NULL CHECK(effect_active IN (0,1))
) STRICT;`;
