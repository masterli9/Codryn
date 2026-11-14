import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { build } from 'esbuild';
import { sourceHash, fileHash } from './r3-build-identity.mjs';

const datasetFile = new URL('../docs/evals/r4-ts-queries-v1.json', import.meta.url);
const fixture = new URL('../tests/support/fixtures/r4-ts-queries/', import.meta.url);
const hash = data => createHash('sha256').update(data).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function checkDataset(dataset, root) {
  if (dataset.schemaVersion !== 1 || dataset.typescriptVersion !== '6.0.3' || dataset.cases.length !== 20 ||
    new Set(dataset.cases.map(item => item.id)).size !== 20) throw new Error('R4_TYPESCRIPT_DATASET_INVALID');
  const actual = {};
  async function walk(relative) {
    for (const entry of await readdir(new URL(relative, root), { withFileTypes: true })) {
      const path = relative + entry.name;
      if (entry.isDirectory()) await walk(path + '/');
      else if (entry.isFile()) {
        // Keep fixture identity stable under Windows checkout line-ending conversion.
        actual[path] = hash((await readFile(new URL(path, root), 'utf8')).replaceAll('\r\n', '\n'));
      } else throw new Error('R4_TYPESCRIPT_FIXTURE_ALIAS');
    }
  }
  await walk('');
  if (!same(Object.entries(actual).sort(), Object.entries(dataset.fixtureFiles).sort()) ||
    !dataset.cases.every(item => item.rationale?.length && item.fixtureHash === actual[item.input.path])) throw new Error('R4_TYPESCRIPT_FIXTURE_CHANGED');
}

const sortItems = items => [...items].sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1] || a[2] - b[2]);
function normalized(kind, output) {
  const items = output.items.map(item => {
    const location = [item.path, item.line, item.column];
    if (kind === 'definition' || kind === 'exports') return [...location, item.name];
    if (kind === 'type' || kind === 'signature') return [...location, item.display];
    if (kind === 'imports') return [...location, item.relation, item.target];
    if (kind === 'diagnostics') return [...location, item.code, item.category];
    return location;
  });
  return { status: output.status, mode: output.mode, items: sortItems(items) };
}

export function validateResults(dataset, results) {
  if (results.length !== 20 || !results.every((item, i) => {
    const expected = dataset.cases[i];
    return item.id === expected.id && same(item.expected, expected.expected) && item.match === same(item.expected, item.observed) &&
      (item.match ? item.reason === null : typeof item.reason === 'string' && item.reason.length > 0);
  })) throw new Error('R4_TYPESCRIPT_RESULTS_INCOMPLETE');
  return results.filter(item => item.match).length;
}

async function run() {
  const dataset = JSON.parse(await readFile(datasetFile, 'utf8'));
  await checkDataset(dataset, fixture);
  const directory = await mkdtemp(join(tmpdir(), 'codryn-ts-eval-'));
  const clientFile = join(directory, 'client.mjs'), worker = join(directory, 'worker.cjs');
  try {
    await build({ entryPoints: ['backend/infrastructure/src/typescript/typescript-query-worker.ts'], outfile: worker,
      define: { 'import.meta.url': 'undefined' }, bundle: true, platform: 'node', format: 'cjs', logLevel: 'warning' });
    await build({ entryPoints: ['backend/infrastructure/src/typescript/typescript-query-client.ts'], outfile: clientFile,
      bundle: true, platform: 'node', format: 'esm', logLevel: 'warning' });
    const { TypeScriptQueryClient } = await import(pathToFileURL(clientFile).href);
    const root = await realpath(fileURLToPath(fixture));
    const client = new TypeScriptQueryClient(worker, { standardLibrary: resolve('node_modules/typescript/lib') });
    const results = [];
    try {
      for (const item of dataset.cases) {
        const actual = await client.query(root, item.input, 0, globalThis.AbortSignal.timeout(5500));
        const observed = normalized(item.input.kind, actual);
        const match = same(observed, item.expected);
        results.push({ id: item.id, expected: item.expected, observed, match, reason: match ? null : actual.reason ?? 'different_output' });
      }
    } finally { await client.close(); }
    const matches = validateResults(dataset, results);
    const filename = process.argv[2] ?? 'docs/evals/r4-ts-queries-report.json';
    await writeFile(filename, JSON.stringify({ schemaVersion: 1, sourceHash: await sourceHash(), workerHash: await fileHash(worker),
      datasetHash: hash(JSON.stringify(dataset)), typescriptVersion: dataset.typescriptVersion, required: 18, total: 20, matches, passed: matches >= 18,
      mismatches: results.filter(item => !item.match).map(item => item.id), results }, null, 2) + '\n');
    console.log(`TypeScript structural queries: ${matches}/20. ${filename}`);
    if (matches < 18) process.exitCode = 1;
  } finally { await rm(directory, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await run();
