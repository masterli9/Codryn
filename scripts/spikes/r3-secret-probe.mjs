import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { build } from 'esbuild';
const exec = promisify(execFile), require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temporary = await mkdtemp(join(tmpdir(), 'codryn-r3-dpapi-'));
const profile = join(temporary, 'profile'), bundle = join(temporary, 'probe.cjs');
if (!temporary.startsWith(resolve(tmpdir()) + '\\') && !temporary.startsWith(resolve(tmpdir()) + '/')) throw new Error('R3_PROBE_CLEANUP_BOUNDARY');
let passed = false;
try {
  await build({ entryPoints: [join(root, 'scripts/spikes/r3-secret-probe.cjs')], outfile: bundle, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], logLevel: 'silent' });
  const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
  const reports = [];
  for (const phase of ['store', 'reopen', 'remove']) {
    const result = await exec(require('electron'), [bundle], { cwd: root, timeout: 10000, windowsHide: true, maxBuffer: 65536, env: { ...environment, CODRYN_SECRET_PROBE_ROOT: profile, CODRYN_SECRET_PROBE_PHASE: phase } });
    reports.push(JSON.parse(result.stdout.trim()));
    if (result.stdout.includes(['codryn', 'synthetic', 'secret', 'probe', '2026'].join('-')) || result.stderr.includes(['codryn', 'synthetic', 'secret', 'probe', '2026'].join('-'))) throw new Error('R3_SECRET_PROBE_LEAK');
    if (phase === 'store' || phase === 'reopen') {
      const scan = async (directory) => { for (const entry of await readdir(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) await scan(path); else if ((await readFile(path)).includes(Buffer.from(['codryn', 'synthetic', 'secret', 'probe', '2026'].join('-')))) throw new Error('R3_SECRET_PROBE_LEAK'); } };
      await scan(profile);
    }
  }
  const [store, reopen, remove] = reports;
  passed = process.platform === 'win32' && store?.phase === 'store' && store.encryption === true && store.replacePreserved === true && store.deniedPlaintextFallback === true && reopen?.phase === 'reopen' && reopen.restartDecrypt === true && reopen.corruptRejected === true && remove?.phase === 'remove' && remove.removed === true;
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, platform: process.platform, encryption: store?.encryption === true, restartDecrypt: reopen?.restartDecrypt === true, replacePreserved: store?.replacePreserved === true, deniedPlaintextFallback: store?.deniedPlaintextFallback === true, corruptRejected: reopen?.corruptRejected === true, removed: remove?.removed === true, passed })}\n`);
} catch {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, platform: process.platform, passed: false, code: 'R3_SECRET_PROBE_FAILED' })}\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
  if (!passed) process.exitCode = 1;
}
