import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileHash, verifyBuild } from './r3-build-identity.mjs';
import { runGate } from './r3-run-gate.mjs';

const build = await verifyBuild();
const root = resolve('.r3-artifacts');
await mkdir(root, { recursive: true });
const profile = await realpath(await mkdtemp(join(root, 'r4-ts-worker-')));
const resources = join(dirname(build.executable), 'resources');
const relativeWorker = join('app.asar.unpacked', '.webpack', 'main', 'typescript-query-worker.js');
const workerHash = await fileHash(join(resources, relativeWorker));
await runGate(build.executable, ['--r4-ts-smoke', `--r4-ts-user-data-dir=${profile}`], { timeoutMs: 20000, env: { ELECTRON_RUN_AS_NODE: undefined } });
const filename = join(profile, 'r4-typescript-worker-smoke.json');
const report = JSON.parse(await readFile(filename, 'utf8'));
const targetHash = await fileHash(join(resources, 'r4-ts-queries', 'src', 'main.ts'));
if (report.schemaVersion !== 1 || report.passed !== true || report.workerHash !== workerHash || report.asarHash !== build.asarHash ||
  report.targetHash !== targetHash || report.result?.targetHash !== targetHash || report.result?.items?.[0]?.name !== 'duplicate') {
  throw new Error('R4_TYPESCRIPT_PACKAGED_EVIDENCE_INVALID');
}
await writeFile(filename, JSON.stringify({ ...report, build }, null, 2) + '\n');
console.log(filename);
