import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const storageModule = `export interface CountStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function saveCount(storage: CountStorage, value: number): void {
  // TODO: persist the count.
}

export function loadCount(storage: CountStorage): number {
  // TODO: return the persisted count when available.
  return 0;
}
`;

const repairTests = `
test("increments 1", () => assert.equal(nextCount(1), 2));
test("increments 0", () => assert.equal(nextCount(0), 1));
test("increments a negative count", () => assert.equal(nextCount(-3), -2));
`;

const storageTests = `
import { readFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";

async function storageWorker() {
  const { stripTypeScriptTypes } = require("node:module");
  const { createContext, runInContext, SourceTextModule } = require("node:vm");
  const { parentPort, workerData } = require("node:worker_threads");
  const source = stripTypeScriptTypes(workerData.source, { mode: "transform" });
  const stores = new Map();
  const reads = [];
  for (const step of workerData.steps) {
    const context = createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
    runInContext("for (const name of ['Array', 'Map', 'Object', 'Number', 'String', 'JSON']) {" +
      "const intrinsic = globalThis[name];" +
      "Object.defineProperty(globalThis, name, { value: intrinsic, writable: false, configurable: false });" +
      "if (intrinsic.prototype) Object.freeze(intrinsic.prototype); Object.freeze(intrinsic); }", context);
    const target = new SourceTextModule(source, { context });
    const entries = stores.get(step.store) ?? [];
    const write = Object.hasOwn(step, "value");
    const driver = new SourceTextModule([
      'import { loadCount, saveCount } from "storage-target";',
      'const entries = new Map(' + JSON.stringify(entries) + ');',
      'const storage = { getItem: key => entries.get(key) ?? null,',
      '  setItem: (key, value) => { entries.set(String(key), String(value)); } };',
      write ? 'saveCount(storage, ' + JSON.stringify(step.value) + ');' : 'const value = loadCount(storage);',
      write ? 'export const result = JSON.stringify([...entries]);' : 'export const result = value;'
    ].join("\\n"), { context });
    await target.link(() => { throw new Error("The storage module has no external dependencies."); });
    await driver.link(() => target);
    await driver.evaluate({ timeout: 1000 });
    const result = driver.namespace.result;
    if (write) stores.set(step.store, JSON.parse(result));
    else reads.push(typeof result === "number" ? result : null);
  }
  parentPort.postMessage(reads);
}

async function countReads(steps) {
  const source = await readFile(new URL("./src/counter-storage.ts", import.meta.url), "utf8");
  const worker = new Worker("(" + storageWorker.toString() + ")().catch(() => { process.exitCode = 1; });", {
    eval: true, execArgv: ["--experimental-vm-modules", "--no-warnings"], workerData: { source, steps }
  });
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Storage test did not finish.")), 7000);
      worker.once("message", result => { clearTimeout(timer); resolve(result); });
      worker.once("error", error => { clearTimeout(timer); reject(error); });
      worker.once("exit", code => {
        clearTimeout(timer);
        reject(new Error("Storage test worker stopped before returning results (" + code + ")."));
      });
    });
  } finally {
    await worker.terminate();
  }
}

test("an empty store has the default count", async () => {
  assert.deepEqual(await countReads([{store: 0}]), [0]);
});

test("a new reader can load a previously stored count", async () => {
  assert.deepEqual(await countReads([{store: 0, value: 37}, {store: 0}]), [37]);
});

test("saving replaces the count and keeps different stores independent", async () => {
  assert.deepEqual(await countReads([
    {store: 0, value: 4}, {store: 1, value: 9}, {store: 0, value: 0}, {store: 0}, {store: 1}
  ]), [0, 9]);
});
`;

export async function createR4EvalProjectFixture(projectRoot: string, variant: string, source: string): Promise<void> {
  await mkdir(join(projectRoot, 'src'), { recursive: true });
  if (variant === 'ignored') await mkdir(join(projectRoot, 'private'));
  const hasStorageTask = variant === 'storage-question';
  await writeFile(join(projectRoot, 'src/counter.ts'), source);
  await writeFile(join(projectRoot, 'src/Counter.tsx'), 'import { nextCount } from "./counter";\nexport const Counter = () => <button>{nextCount(1)}</button>;\n');
  if (hasStorageTask) await writeFile(join(projectRoot, 'src/counter-storage.ts'), storageModule);
  const counterTests = variant === 'repair-git' ? repairTests : 'test("increments",()=>assert.equal(nextCount(1),2));\n';
  await writeFile(join(projectRoot, 'counter.test.mjs'), 'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { nextCount } from "./src/counter.ts";\n' + counterTests + (hasStorageTask ? storageTests : ''));
  await writeFile(join(projectRoot, 'package.json'), JSON.stringify({ type: 'module', scripts: { test: 'node --test', typecheck: 'tsc --noEmit' }, devDependencies: { typescript: '6.0.3' } }));
  const include = hasStorageTask ? ['src/counter.ts', 'src/counter-storage.ts'] : ['src/counter.ts'];
  await writeFile(join(projectRoot, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true }, include }));
  if (variant === 'ignored') {
    await writeFile(join(projectRoot, '.codrynignore'), 'private/\n');
    await writeFile(join(projectRoot, 'private/data.txt'), 'SYNTHETIC_IGNORED_MARKER');
  }
}
