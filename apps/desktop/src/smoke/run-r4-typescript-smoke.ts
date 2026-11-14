import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createDesktopTypeScriptQueryClient } from '../composition-root.js';

export async function runR4TypeScriptSmoke(profile: string, fixture: string, resources: string) {
  const client = createDesktopTypeScriptQueryClient();
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  try {
    const root = await realpath(fixture);
    const result = await client.query(root, { kind: 'definition', path: 'src/main.ts', symbol: 'twice', maxResults: 20 }, 7, AbortSignal.timeout(7500));
    const targetHash = hash(await readFile(join(root, 'src', 'main.ts')));
    const workerHash = hash(await readFile(join(resources, 'app.asar.unpacked', '.webpack', 'main', 'typescript-query-worker.js')));
    const previousNoAsar = process.noAsar;
    let asarHash: string;
    process.noAsar = true;
    try { asarHash = hash(readFileSync(join(resources, 'app.asar'))); }
    finally { process.noAsar = previousNoAsar; }
    const passed = result.status === 'ok' && result.revision === 7 && result.targetHash === targetHash &&
      result.items.length === 1 && result.items[0]?.path === 'src/math.ts' && result.items[0]?.line === 1 &&
      result.items[0]?.column === 17 && result.items[0]?.name === 'duplicate';
    await writeFile(join(profile, 'r4-typescript-worker-smoke.json'), JSON.stringify({ schemaVersion: 1, passed, asarHash, workerHash, targetHash, result }, null, 2) + '\n');
    return passed;
  } finally { await client.close(); }
}
