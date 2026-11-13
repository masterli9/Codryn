import { build } from 'esbuild';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RepoMapBuilder, runRepoMapWorker } from '../src/context/repo-map-builder.js';
import { RepoMapStore } from '../src/context/repo-map-store.js';
import { createR3Infrastructure } from '../src/create-r3-infrastructure.js';
import { openDesktopDatabase } from '../src/persistence/open-desktop-database.js';
import { SqliteWorkspaceStore } from '../src/persistence/sqlite-workspace-store.js';

const projectId = '10000000-0000-4000-8000-000000000001';
let temporary: string;
let root: string;
let profile: string;
let workerDirectory: string;
let worker: string;
let handle: Awaited<ReturnType<typeof openDesktopDatabase>>;

async function put(path: string, contents: string): Promise<void> {
  await writeFile(join(root, path), contents);
}

beforeAll(async () => {
  workerDirectory = await mkdtemp(join(tmpdir(), 'codryn-map-worker-'));
  worker = join(workerDirectory, 'worker.cjs');
  await build({
    entryPoints: ['backend/infrastructure/src/context/repo-map-worker.ts'],
    outfile: worker,
    platform: 'node',
    format: 'cjs',
    bundle: true
  });
});

afterAll(async () => {
  if (workerDirectory) await rm(workerDirectory, { recursive: true, force: true });
});

beforeEach(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'codryn-map-'));
  root = join(temporary, 'project');
  profile = join(temporary, 'profile');
  await mkdir(join(root, 'src'), { recursive: true });
  handle = await openDesktopDatabase(profile);
  await new SqliteWorkspaceStore(handle.database).open(root, projectId);
  await put('src/Zebra.ts', 'export function Zebra() {}');
  await put('src/App.tsx', "import { Zebra } from './Zebra';\nexport const App = () => <Zebra/>;");
  await put('src/App.test.ts', 'export const fixture = 1;');
  await put('tsconfig.json', '{}');
  await put('README.md', '# Project');
  await put('AGENTS.md', 'Run typecheck.\n');
  await put('.env.local', 'PRIVATE_TEST_VALUE=example');
  await put('.codrynignore', 'src/private.ts');
  await put('src/private.ts', 'export const privateSymbol = 1;');
});

afterEach(async () => {
  handle?.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

const start = () => new RepoMapBuilder(new RepoMapStore(handle.database), request => runRepoMapWorker(worker, request));
const signal = () => AbortSignal.timeout(5_000);

describe('repo map', () => {
  it('builds deterministically in a worker and retains an atomic generation across database reopen', async () => {
    const map = start();
    const scanning = map.start(projectId, root, signal());
    expect(scanning.status.state).toBe('indexing');
    expect(await scanning.done).toMatchObject({ state: 'ready' });
    handle.close();
    handle = await openDesktopDatabase(profile);
    const store = new RepoMapStore(handle.database);
    const stored = store.current(projectId);
    expect(stored?.items.map(item => item.path)).toEqual([
      '.codrynignore', 'AGENTS.md', 'README.md', 'src', 'src/App.test.ts', 'src/App.tsx', 'src/Zebra.ts', 'tsconfig.json'
    ]);
    expect(stored?.items.find(item => item.path === 'src/App.tsx')).toMatchObject({
      kind: 'file', role: 'source', symbols: ['App'], imports: ['src/Zebra.ts'], freshness: 'current',
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(stored?.items.find(item => item.path === 'src/App.test.ts')?.role).toBe('test');
    expect(stored?.items.find(item => item.path === 'tsconfig.json')?.role).toBe('config');
  });

  it('reports the entry limit instead of traversing beyond the bounded scan', async () => {
    const map = new RepoMapBuilder(new RepoMapStore(handle.database), request => runRepoMapWorker(worker, {
      ...request, limits: { ...request.limits, entries: 3 }
    }));
    expect(await map.start(projectId, root, signal()).done).toMatchObject({
      state: 'partial', reason: 'limit', scanned: 3
    });
  });

  it('does not publish a worker generation when a source changes before publication', async () => {
    const store = new RepoMapStore(handle.database);
    const map = new RepoMapBuilder(store, async request => {
      const result = await runRepoMapWorker(worker, request);
      await put('src/App.tsx', 'export const Changed = 1;');
      return result;
    });
    expect(await map.start(projectId, root, signal()).done).toMatchObject({ state: 'partial', reason: 'changed' });
    expect(store.current(projectId)).toBeNull();
  });

  it('opens a project while a scan is pending and rejects map actions for an inactive project', async () => {
    let ran = false;
    const host = await createR3Infrastructure({
      userDataPath: join(temporary, 'desktop'),
      runtimeFactory: () => async () => { throw new Error('unexpected run'); },
      repoMapWorker: request => {
        ran = true;
        return new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }));
      }
    });
    try {
      const project = await host.projects.open(root, signal());
      expect(ran).toBe(true);
      expect(host.contextMap.status(project.id)).toMatchObject({ state: 'indexing' });
      expect(() => host.contextMap.status(projectId)).toThrow('R3_NOT_FOUND');
      expect(await host.shutdown(signal())).toEqual({ stopped: true });
    } finally {
      host.close();
    }
  });

  it('ranks explicit paths and symbols deterministically and omits a stale dependent', async () => {
    const map = start();
    await map.start(projectId, root, signal()).done;
    expect((await map.deepen(projectId, 'Change App', ['src/Zebra.ts'], signal())).items.slice(0, 2))
      .toMatchObject([{ path: 'src/Zebra.ts', reason: 'explicit_path' }, { path: 'src/App.tsx', reason: 'symbol' }]);
    await put('src/Zebra.ts', 'export const replacement = 1;');
    expect(await map.deepen(projectId, 'Change App', [], signal())).toMatchObject({
      omitted: expect.arrayContaining([{ path: 'src/App.tsx', reason: 'changed' }])
    });
  });

  it('records project instruction provenance during deep init and reads only current excerpts', async () => {
    const map = start();
    await map.start(projectId, root, signal()).done;
    const init = map.init(projectId, signal());
    expect(map.init(projectId, signal())).toBe(init);
    expect(await init.done).toMatchObject({ state: 'ready', mode: 'deep', instructions: 1 });
    const instructions = await map.instructions(projectId, signal());
    expect(instructions).toMatchObject([{
      path: 'AGENTS.md', authority: 'project_rules', contentHash: expect.stringMatching(/^[a-f0-9]{64}$/), text: 'Run typecheck.\n'
    }]);
    await put('.codrynignore', 'AGENTS.md');
    expect(await map.instructions(projectId, signal())).toEqual([]);
  });
});
