import { execFile, spawn } from 'node:child_process';
import { access, link, mkdir, mkdtemp, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const powershell = join(
  process.env.SystemRoot ?? 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe'
);
const worker = resolve(dirname(fileURLToPath(import.meta.url)), 'r2-write-worker.ps1');
const powerShellArgs = [
  '-NoLogo',
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  worker
];

function parseIterations(argv) {
  const index = argv.indexOf('--iterations');
  const value = index >= 0 ? Number.parseInt(argv[index + 1] ?? '', 10) : 100;
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000) {
    throw new Error('iterations must be an integer between 1 and 1000');
  }
  return value;
}

function ownedPath(root, name) {
  const path = resolve(root, name);
  const owned = resolve(root) + '\\';
  if (!path.startsWith(owned)) throw new Error('probe path escaped its temporary directory');
  return path;
}

async function signal(path) {
  await writeFile(path, 'ready', { flag: 'w', encoding: 'ascii' });
}

async function waitFor(path, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 2));
    }
  }
  throw new Error(`barrier timeout: ${path}`);
}

function startWorker(args) {
  const child = spawn(powershell, [...powerShellArgs, ...args], {
    cwd: resolve('.'),
    windowsHide: true,
    shell: false,
    stdio: ['ignore', 'ignore', 'pipe']
  });
  const stderr = [];
  child.stderr?.on('data', (chunk) => stderr.push(String(chunk)));
  const done = new Promise((resolveDone) => {
    child.once('close', (code, signalCode) => resolveDone({ code, signal: signalCode, stderr: stderr.join('') }));
    child.once('error', (error) => resolveDone({ code: null, signal: null, stderr: String(error) }));
  });
  return { child, done };
}

function startStreamWorker(args) {
  const child = spawn(powershell, [...powerShellArgs, ...args], {
    cwd: resolve('.'),
    windowsHide: true,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const stderr = [];
  const debug = (...values) => {
    if (process.env.CODRYN_PROBE_DEBUG === '1') console.error(...values);
  };
  child.stderr?.on('data', (chunk) => { stderr.push(String(chunk)); debug('worker stderr', String(chunk)); });
  const lines = [];
  const waiters = [];
  const reader = createInterface({ input: child.stdout });
  reader.on('line', (line) => {
    debug('worker line', JSON.stringify(line));
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(line);
    else lines.push(line);
  });
  let closed = null;
  const done = new Promise((resolveDone) => {
    child.once('close', (code, signalCode) => {
      closed = { code, signal: signalCode, stderr: stderr.join('') };
      debug('worker close', code, signalCode);
      for (const waiter of waiters.splice(0)) {
        waiter.reject(new Error(`worker exited before its response: ${JSON.stringify(closed)}`));
      }
      resolveDone(closed);
    });
    child.once('error', (error) => {
      closed = { code: null, signal: null, stderr: String(error) };
      for (const waiter of waiters.splice(0)) {
        waiter.reject(error);
      }
      debug('worker error', error);
      resolveDone(closed);
    });
  });
  return {
    child,
    done,
    send(command) { child.stdin?.write(`${command}\n`); },
    async waitForLine(expected) {
      if (closed) throw new Error(`worker exited before ${expected}: ${JSON.stringify(closed)}`);
      const line = lines.length > 0
        ? lines.shift()
        : await new Promise((resolveLine, rejectLine) => waiters.push({ resolve: resolveLine, reject: rejectLine }));
      if (line !== expected) throw new Error(`unexpected worker barrier: ${line} (expected ${expected})`);
    }
  };
}

async function outcome(path) {
  try {
    return (await readFile(path, 'ascii')).trim();
  } catch {
    return 'missing';
  }
}

async function runExternal(root, target, role, payload = 'EXTERNAL') {
  const marker = ownedPath(root, `external-${Math.random().toString(16).slice(2)}.outcome`);
  const process = startWorker([
    '-Role', role,
    '-Target', target,
    '-Payload', payload,
    '-OutcomeMarker', marker
  ]);
  const result = await process.done;
  return { ...result, outcome: await outcome(marker) };
}

async function runNodeExternal(root, target, role, payload = 'EXTERNAL') {
  try {
    if (role === 'external-replace') {
      const temporary = ownedPath(root, `node-external-${Math.random().toString(16).slice(2)}.tmp`);
      await writeFile(temporary, payload, 'utf8');
      await rename(temporary, target);
    } else {
      await writeFile(target, payload, 'utf8');
    }
    return { code: 0, signal: null, stderr: '', outcome: 'applied' };
  } catch (error) {
    return { code: null, signal: null, stderr: String(error), outcome: 'denied' };
  }
}

async function runAtomicScenario(root, name, target, { externalRole = null, payload = 'EXTERNAL', afterChecked = null } = {}) {
  const directory = dirname(target);
  await mkdir(directory, { recursive: true });
  const candidate = 'AGENT-CANDIDATE';
  await writeFile(target, 'ORIGINAL-CONTENT', 'utf8');
  const loaded = join(directory, `${name}.loaded`);
  const check = join(directory, `${name}.check`);
  const checked = join(directory, `${name}.checked`);
  const publish = join(directory, `${name}.publish`);
  const outcomeMarker = join(directory, `${name}.guarded.outcome`);
  const guarded = startWorker([
    '-Role', 'atomic',
    '-Target', target,
    '-Candidate', candidate,
    '-LoadedMarker', loaded,
    '-CheckMarker', check,
    '-CheckedMarker', checked,
    '-PublishMarker', publish,
    '-OutcomeMarker', outcomeMarker
  ]);
  await waitFor(loaded);
  await signal(check);
  await waitFor(checked);
  const external = afterChecked ? await afterChecked({ directory, target }) :
    (externalRole ? await runExternal(directory, target, externalRole, payload) : null);
  await signal(publish);
  const guardedResult = await guarded.done;
  return {
    external,
    guarded: { ...guardedResult, outcome: await outcome(outcomeMarker) },
    final: await readFile(target, 'utf8').catch(() => null)
  };
}

async function runAtomicRace(root, iteration, options = {}) {
  return runAtomicScenario(
    root,
    `race-${iteration}`,
    ownedPath(root, `race-${iteration}/target.txt`),
    { externalRole: 'external-in-place', ...options }
  );
}

async function runAtomicLoopRace(root, iterations) {
  const directory = ownedPath(root, 'race-loop');
  await mkdir(directory, { recursive: true });
  const target = join(directory, 'target.txt');
  await writeFile(target, 'ORIGINAL-CONTENT', 'utf8');
  const guarded = startStreamWorker([
    '-Role', 'atomic-stream',
    '-Target', target,
    '-Candidate', 'AGENT-CANDIDATE',
    '-Iterations', String(iterations)
  ]);
  let overwritten = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    await guarded.waitForLine('loaded');
    guarded.send('check');
    await guarded.waitForLine('checked');
    await writeFile(target, 'EXTERNAL-CONTENT', 'utf8');
    guarded.send('publish');
    await guarded.waitForLine('done');
    if ((await readFile(target, 'utf8')) === 'AGENT-CANDIDATE') overwritten += 1;
    await writeFile(target, 'ORIGINAL-CONTENT', 'utf8');
    guarded.send('reset');
  }
  await guarded.waitForLine('complete');
  const guardedResult = await guarded.done;
  return { overwritten, guarded: guardedResult };
}

async function runOpenWriterCase(root) {
  const directory = ownedPath(root, 'open-writer');
  await mkdir(directory, { recursive: true });
  const target = join(directory, 'target.txt');
  await writeFile(target, 'ORIGINAL-CONTENT', 'utf8');
  const loaded = join(directory, 'loaded');
  const release = join(directory, 'release');
  const outcomeMarker = join(directory, 'guarded.outcome');
  const holder = startWorker(['-Role', 'hold-open', '-Target', target, '-LoadedMarker', loaded, '-ReleaseMarker', release]);
  await waitFor(loaded);
  const guarded = startWorker([
    '-Role', 'atomic',
    '-Target', target,
    '-Candidate', 'AGENT-CANDIDATE',
    '-LoadedMarker', join(directory, 'guarded-loaded'),
    '-CheckMarker', join(directory, 'guarded-check'),
    '-CheckedMarker', join(directory, 'guarded-checked'),
    '-PublishMarker', join(directory, 'guarded-publish'),
    '-OutcomeMarker', outcomeMarker
  ]);
  const guardedResult = await guarded.done;
  await signal(release);
  await holder.done;
  return {
    rejected: guardedResult.code !== 0,
    unchanged: (await readFile(target, 'utf8')) === 'ORIGINAL-CONTENT',
    detail: guardedResult.stderr
  };
}

async function runHandleRaceCase(root) {
  const directory = ownedPath(root, 'handle-race');
  await mkdir(directory, { recursive: true });
  const target = join(directory, 'target.txt');
  await writeFile(target, 'ORIGINAL-CONTENT', 'utf8');
  const loaded = join(directory, 'loaded');
  const check = join(directory, 'check');
  const checked = join(directory, 'checked');
  const publish = join(directory, 'publish');
  const outcomeMarker = join(directory, 'guarded.outcome');
  const guarded = startWorker([
    '-Role', 'in-place',
    '-Target', target,
    '-Candidate', 'AGENT-CANDIDATE',
    '-LoadedMarker', loaded,
    '-CheckMarker', check,
    '-CheckedMarker', checked,
    '-PublishMarker', publish,
    '-OutcomeMarker', outcomeMarker
  ]);
  await waitFor(loaded);
  await signal(check);
  await waitFor(checked);
  const external = await runNodeExternal(directory, target, 'external-in-place', 'EXTERNAL-CONTENT');
  await signal(publish);
  const guardedResult = await guarded.done;
  return {
    external,
    guarded: { ...guardedResult, outcome: await outcome(outcomeMarker) },
    final: await readFile(target, 'utf8')
  };
}

async function runInPlaceCrashCase(root) {
  const directory = ownedPath(root, 'in-place-crash');
  await mkdir(directory, { recursive: true });
  const target = join(directory, 'target.txt');
  await writeFile(target, 'ORIGINAL-CONTENT', 'utf8');
  const loaded = join(directory, 'loaded');
  const check = join(directory, 'check');
  const checked = join(directory, 'checked');
  const publish = join(directory, 'publish');
  const writing = join(directory, 'writing');
  const proceed = join(directory, 'continue');
  const outcomeMarker = join(directory, 'outcome');
  const guarded = startWorker([
    '-Role', 'in-place',
    '-Target', target,
    '-CandidateSize', '1000000',
    '-LoadedMarker', loaded,
    '-CheckMarker', check,
    '-CheckedMarker', checked,
    '-PublishMarker', publish,
    '-WritingMarker', writing,
    '-ContinueMarker', proceed,
    '-OutcomeMarker', outcomeMarker,
    '-CrashAfterPartial'
  ]);
  await waitFor(loaded);
  await signal(check);
  await waitFor(checked);
  await signal(publish);
  await waitFor(writing);
  await guarded.done;
  const bytes = await readFile(target);
  return {
    partial: bytes.length > 0 && bytes.length < 1_000_000,
    emptyOrOriginal: bytes.length === 0 || bytes.toString('utf8') === 'ORIGINAL-CONTENT'
  };
}

async function runJunctionCase(root) {
  const directory = ownedPath(root, 'junction-swap');
  await mkdir(directory, { recursive: true });
  const first = join(directory, 'first');
  const second = join(directory, 'second');
  const junction = join(directory, 'link');
  await mkdir(first, { recursive: true });
  await mkdir(second, { recursive: true });
  await writeFile(join(first, 'target.txt'), 'ORIGINAL-CONTENT', 'utf8');
  await writeFile(join(second, 'target.txt'), 'EXTERNAL-CONTENT', 'utf8');
  await execFileAsync('cmd.exe', ['/d', '/c', 'mklink', '/J', junction, first], { windowsHide: true });
  const result = await runAtomicScenario(
    directory,
    'junction',
    join(junction, 'target.txt'),
    {
      afterChecked: async () => {
        await execFileAsync('cmd.exe', ['/d', '/c', 'rmdir', junction], { windowsHide: true });
        await execFileAsync('cmd.exe', ['/d', '/c', 'mklink', '/J', junction, second], { windowsHide: true });
        return null;
      }
    }
  );
  const firstContent = await readFile(join(first, 'target.txt'), 'utf8');
  const secondContent = await readFile(join(second, 'target.txt'), 'utf8');
  return {
    escaped: secondContent === 'AGENT-CANDIDATE' || firstContent !== 'ORIGINAL-CONTENT',
    result
  };
}

async function runRenamedParentCase(root) {
  const directory = ownedPath(root, 'renamed-parent');
  const parent = join(directory, 'parent');
  const moved = join(directory, 'parent-moved');
  await mkdir(parent, { recursive: true });
  const target = join(parent, 'target.txt');
  const result = await runAtomicScenario(
    directory,
    'parent',
    target,
    {
      afterChecked: async () => {
        await rename(parent, moved);
        await mkdir(parent, { recursive: true });
        await writeFile(target, 'EXTERNAL-CONTENT', 'utf8');
        return null;
      }
    }
  );
  return {
    escaped: result.final === 'AGENT-CANDIDATE' || await readFile(join(moved, 'target.txt'), 'utf8') !== 'ORIGINAL-CONTENT',
    result
  };
}

async function runHardlinkCase(root) {
  const directory = ownedPath(root, 'hardlink');
  await mkdir(directory, { recursive: true });
  const target = join(directory, 'target.txt');
  const alias = join(directory, 'alias.txt');
  await writeFile(target, 'ORIGINAL-CONTENT', 'utf8');
  await link(target, alias);
  const result = await runAtomicScenario(root, 'hardlink', target);
  const targetContent = await readFile(target, 'utf8');
  const aliasContent = await readFile(alias, 'utf8');
  return {
    rejected: result.guarded.code !== 0 && targetContent === 'ORIGINAL-CONTENT' && aliasContent === 'ORIGINAL-CONTENT',
    diverged: targetContent !== aliasContent,
    result
  };
}

async function main() {
  const iterations = parseIterations(process.argv.slice(2));
  const report = {
    supported: false,
    partialPublications: 0,
    overwrittenExternalWrites: 0,
    escapedPaths: 0,
    cases: []
  };
  if (process.platform !== 'win32') {
    report.cases.push({ name: 'windows-platform', passed: false });
    process.stdout.write(JSON.stringify(report));
    return;
  }

  const root = await mkdtemp(join(tmpdir(), 'codryn-r2-write-probe-'));
  try {
    const raceResults = await runAtomicLoopRace(root, iterations);
    const overwritten = raceResults.overwritten;
    report.overwrittenExternalWrites += overwritten;
    report.cases.push({
      name: 'stale-hash-race-with-in-place-editor',
      passed: overwritten === 0
    });
    const tempRename = await runAtomicRace(root, 'temp-rename', {
      afterChecked: ({ directory, target }) => runNodeExternal(directory, target, 'external-replace', 'EXTERNAL-CONTENT')
    });
    const tempRenameOverwritten = tempRename.external?.outcome === 'applied' &&
      tempRename.final === 'AGENT-CANDIDATE';
    report.overwrittenExternalWrites += Number(tempRenameOverwritten);
    report.cases.push({
      name: 'temp-and-rename-editor',
      passed: !tempRenameOverwritten
    });

    let sameLengthTimestamp;
    const sameLength = await runAtomicRace(root, 'same-length', {
      afterChecked: async ({ directory, target }) => {
        const before = await stat(target);
        const external = await runNodeExternal(directory, target, 'external-in-place', 'EXTERNAL-EDIT!!');
        await utimes(target, before.atime, before.mtime);
        sameLengthTimestamp = before.mtimeMs;
        return external;
      }
    });
    report.overwrittenExternalWrites += Number(
      sameLength.external?.outcome === 'applied' && sameLength.final === 'AGENT-CANDIDATE'
    );
    report.cases.push({
      name: 'same-length-and-restored-mtime',
      passed: sameLengthTimestamp !== undefined && sameLength.external?.outcome !== 'applied'
    });

    const openWriter = await runOpenWriterCase(root);
    report.cases.push({ name: 'existing-open-writer-is-rejected', passed: openWriter.rejected && openWriter.unchanged });
    const handleRace = await runHandleRaceCase(root);
    report.cases.push({ name: 'in-place-write-is-rejected', passed: handleRace.external.outcome === 'denied' });

    const crash = await runInPlaceCrashCase(root);
    report.partialPublications += Number(crash.partial);
    report.cases.push({ name: 'crash-during-publication-is-not-partial', passed: !crash.partial });

    const junction = await runJunctionCase(root);
    report.escapedPaths += Number(junction.escaped);
    report.cases.push({ name: 'junction-swap-preserves-target-identity', passed: !junction.escaped });
    const renamedParent = await runRenamedParentCase(root);
    report.escapedPaths += Number(renamedParent.escaped);
    report.cases.push({ name: 'renamed-parent-preserves-target-identity', passed: !renamedParent.escaped });
    const hardlink = await runHardlinkCase(root);
    report.escapedPaths += Number(hardlink.diverged);
    report.cases.push({ name: 'hardlink-target-is-rejected', passed: hardlink.rejected });

    report.supported = report.cases.length >= 8 &&
      report.cases.every((testCase) => testCase.passed) &&
      report.partialPublications === 0 &&
      report.overwrittenExternalWrites === 0 &&
      report.escapedPaths === 0;
    process.stdout.write(JSON.stringify(report));
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
