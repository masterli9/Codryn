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
    async waitForAnyLine(expectedLines) {
      const line = lines.length > 0
        ? lines.shift()
        : closed
          ? (() => { throw new Error(`worker exited before ${expectedLines.join(' or ')}: ${JSON.stringify(closed)}`); })()
          : await new Promise((resolveLine, rejectLine) => waiters.push({ resolve: resolveLine, reject: rejectLine }));
      if (!expectedLines.includes(line)) {
        throw new Error(`unexpected worker barrier: ${line} (expected ${expectedLines.join(' or ')})`);
      }
      return line;
    },
    async waitForLine(expected) {
      return this.waitForAnyLine([expected]);
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

function startExternal(root, target, role, payload = 'EXTERNAL') {
  const marker = ownedPath(root, `external-${Math.random().toString(16).slice(2)}.outcome`);
  const attempt = ownedPath(root, `external-${Math.random().toString(16).slice(2)}.attempt`);
  const process = startWorker([
    '-Role', role,
    '-Target', target,
    '-Payload', payload,
    '-OutcomeMarker', marker,
    '-AttemptMarker', attempt
  ]);
  return {
    attempt,
    process,
    async wait() {
      const result = await process.done;
      return { ...result, outcome: await outcome(marker) };
    }
  };
}

async function runExternal(root, target, role, payload = 'EXTERNAL') {
  const external = startExternal(root, target, role, payload);
  await waitFor(external.attempt);
  return external.wait();
}

async function runAtomicScenario(root, name, target, {
  externalRole = null,
  payload = 'EXTERNAL',
  afterChecked = null,
  watchDirectories = true
} = {}) {
  const directory = dirname(target);
  await mkdir(directory, { recursive: true });
  const barrierDirectory = ownedPath(root, `.barriers/${name}`);
  await mkdir(barrierDirectory, { recursive: true });
  const candidate = 'AGENT-CANDIDATE';
  await writeFile(target, 'ORIGINAL-CONTENT', 'utf8');
  const loaded = join(barrierDirectory, `${name}.loaded`);
  const check = join(barrierDirectory, `${name}.check`);
  const checked = join(barrierDirectory, `${name}.checked`);
  const publish = join(barrierDirectory, `${name}.publish`);
  const outcomeMarker = join(barrierDirectory, `${name}.guarded.outcome`);
  const guardedArgs = [
    '-Role', 'atomic',
    '-Target', target,
    '-Candidate', candidate,
    '-LoadedMarker', loaded,
    '-CheckMarker', check,
    '-CheckedMarker', checked,
    '-PublishMarker', publish,
    '-OutcomeMarker', outcomeMarker
  ];
  if (!watchDirectories) guardedArgs.push('-NoDirectoryWatch');
  const guarded = startWorker(guardedArgs);
  await waitFor(loaded);
  await signal(check);
  await waitFor(checked);
  const externalControl = afterChecked ? await afterChecked({
    directory,
    target,
    startExternal: (role, externalPayload = payload) => startExternal(barrierDirectory, target, role, externalPayload)
  }) : (externalRole ? startExternal(barrierDirectory, target, externalRole, payload) : null);
  if (externalControl?.attempt) await waitFor(externalControl.attempt);
  await signal(publish);
  const guardedResult = await guarded.done;
  if (externalControl?.afterPublish) await externalControl.afterPublish();
  const external = externalControl?.wait ? await externalControl.wait() : externalControl;
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

async function runAtomicLoopRace(root, iterations, directoryName = 'race-loop') {
  const directory = ownedPath(root, directoryName);
  const barrierDirectory = ownedPath(root, `.barriers/${directoryName}`);
  await mkdir(directory, { recursive: true });
  await mkdir(barrierDirectory, { recursive: true });
  const target = join(directory, 'target.txt');
  await writeFile(target, 'ORIGINAL-CONTENT', 'utf8');
  const external = startStreamWorker([
    '-Role', 'external-stream',
    '-Target', target,
    '-Payload', 'EXTERNAL-CONTENT',
    '-Iterations', String(iterations)
  ]);
  const guarded = startStreamWorker([
    '-Role', 'atomic-stream',
    '-Target', target,
    '-Candidate', 'AGENT-CANDIDATE',
    '-BarrierDirectory', barrierDirectory,
    '-Iterations', String(iterations)
  ]);
  let overwritten = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    await external.waitForLine('ready');
    await guarded.waitForLine('loaded');
    guarded.send('check');
    await guarded.waitForLine('checked');
    external.send('write');
    await external.waitForLine('attempt');
    guarded.send('publish');
    await guarded.waitForLine('rejected');
    await guarded.waitForLine('done');
    guarded.send('reset');
    await guarded.waitForLine('released');
    const externalResult = { outcome: await external.waitForAnyLine(['applied', 'denied']) };
    if (externalResult.outcome === 'applied' && (await readFile(target, 'utf8')) === 'AGENT-CANDIDATE') overwritten += 1;
    await writeFile(target, 'ORIGINAL-CONTENT', 'utf8');
    if (iteration < iterations - 1) guarded.send('next');
  }
  await guarded.waitForLine('complete');
  const guardedResult = await guarded.done;
  await external.waitForLine('complete');
  return { overwritten, guarded: guardedResult };
}

async function runOpenWriterCase(root) {
  const directory = ownedPath(root, 'open-writer');
  await mkdir(directory, { recursive: true });
  const target = join(directory, 'target.txt');
  await writeFile(target, 'ORIGINAL-CONTENT', 'utf8');
  const barrierDirectory = ownedPath(root, '.barriers/open-writer');
  const loaded = join(barrierDirectory, 'loaded');
  const release = join(barrierDirectory, 'release');
  const outcomeMarker = join(barrierDirectory, 'guarded.outcome');
  await mkdir(barrierDirectory, { recursive: true });
  const holder = startWorker(['-Role', 'hold-open', '-Target', target, '-LoadedMarker', loaded, '-ReleaseMarker', release]);
  await waitFor(loaded);
  const guarded = startWorker([
    '-Role', 'atomic',
    '-Target', target,
    '-Candidate', 'AGENT-CANDIDATE',
    '-LoadedMarker', join(barrierDirectory, 'guarded-loaded'),
    '-CheckMarker', join(barrierDirectory, 'guarded-check'),
    '-CheckedMarker', join(barrierDirectory, 'guarded-checked'),
    '-PublishMarker', join(barrierDirectory, 'guarded-publish'),
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
  const barrierDirectory = ownedPath(root, '.barriers/handle-race');
  const loaded = join(barrierDirectory, 'loaded');
  const check = join(barrierDirectory, 'check');
  const checked = join(barrierDirectory, 'checked');
  const publish = join(barrierDirectory, 'publish');
  const outcomeMarker = join(barrierDirectory, 'guarded.outcome');
  await mkdir(barrierDirectory, { recursive: true });
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
  const external = await runExternal(barrierDirectory, target, 'external-in-place', 'EXTERNAL-CONTENT');
  await signal(publish);
  const guardedResult = await guarded.done;
  return {
    external,
    guarded: { ...guardedResult, outcome: await outcome(outcomeMarker) },
    final: await readFile(target, 'utf8')
  };
}

async function runAtomicCrashCase(root) {
  const directory = ownedPath(root, 'atomic-crash');
  await mkdir(directory, { recursive: true });
  const target = join(directory, 'target.txt');
  await writeFile(target, 'ORIGINAL-CONTENT', 'utf8');
  const writing = join(ownedPath(root, '.barriers/atomic-crash'), 'writing');
  await mkdir(dirname(writing), { recursive: true });
  const guarded = startWorker([
    '-Role', 'atomic-crash',
    '-Target', target,
    '-CandidateSize', '1000000',
    '-WritingMarker', writing,
    '-TimeoutMs', '10000'
  ]);
  await waitFor(writing);
  const result = await guarded.done;
  const bytes = await readFile(target);
  return {
    processCrashed: result.code !== 0,
    partial: bytes.length > 0 && bytes.length < 'ORIGINAL-CONTENT'.length,
    unchanged: bytes.toString('utf8') === 'ORIGINAL-CONTENT'
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
    root,
    'junction',
    join(junction, 'target.txt'),
    {
      afterChecked: async () => {
        const swap = (async () => {
          try {
            await execFileAsync('cmd.exe', ['/d', '/c', 'rmdir', junction], { windowsHide: true });
            await execFileAsync('cmd.exe', ['/d', '/c', 'mklink', '/J', junction, second], { windowsHide: true });
            return true;
          } catch {
            return false;
          }
        })();
        return {
          afterPublish: async () => {
            if (!(await swap)) {
              await execFileAsync('cmd.exe', ['/d', '/c', 'rmdir', junction], { windowsHide: true }).catch(() => {});
              await execFileAsync('cmd.exe', ['/d', '/c', 'mklink', '/J', junction, second], { windowsHide: true });
            }
          }
        };
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
    root,
    'parent',
    target,
    {
      afterChecked: async () => {
        const swap = (async () => {
          try {
            await rename(parent, moved);
            await mkdir(parent, { recursive: true });
            await writeFile(target, 'EXTERNAL-CONTENT', 'utf8');
            return true;
          } catch {
            return false;
          }
        })();
        return {
          afterPublish: async () => {
            if (!(await swap)) {
              await rename(parent, moved).catch(() => {});
              await mkdir(parent, { recursive: true });
              await writeFile(target, 'EXTERNAL-CONTENT', 'utf8');
            }
          }
        };
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
    const batchCount = Math.min(4, iterations);
    const baseBatchSize = Math.floor(iterations / batchCount);
    const extraBatches = iterations % batchCount;
    const raceResults = await Promise.all(
      Array.from({ length: batchCount }, (_, batch) => {
        const batchSize = baseBatchSize + (batch < extraBatches ? 1 : 0);
        return runAtomicLoopRace(root, batchSize, `race-loop-${batch}`);
      })
    );
    const overwritten = raceResults.reduce((total, result) => total + result.overwritten, 0);
    report.overwrittenExternalWrites += overwritten;
    report.cases.push({
      name: 'stale-hash-race-with-in-place-editor',
      passed: overwritten === 0
    });
    const successfulPublication = await runAtomicScenario(
      root,
      'successful-publication',
      ownedPath(root, 'successful-publication/target.txt'),
      { watchDirectories: false }
    );
    report.cases.push({
      name: 'uncontested-publication-succeeds',
      passed: successfulPublication.guarded.outcome === 'published' &&
        successfulPublication.final === 'AGENT-CANDIDATE'
    });
    const tempRename = await runAtomicRace(root, 'temp-rename', {
      afterChecked: ({ startExternal }) => startExternal('external-replace', 'EXTERNAL-CONTENT')
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
      afterChecked: async ({ target, startExternal }) => {
        const before = await stat(target);
        const external = startExternal('external-in-place', 'EXTERNAL-EDIT!!!');
        sameLengthTimestamp = before.mtimeMs;
        return {
          ...external,
          async wait() {
            const result = await external.wait();
            await utimes(target, before.atime, before.mtime);
            return result;
          }
        };
      }
    });
    report.overwrittenExternalWrites += Number(
      sameLength.external?.outcome === 'applied' && sameLength.final === 'AGENT-CANDIDATE'
    );
    const sameLengthWasSafe = sameLength.external?.outcome === 'denied'
      ? sameLength.final === 'ORIGINAL-CONTENT' || sameLength.final === 'AGENT-CANDIDATE'
      : sameLength.external?.outcome === 'applied' && sameLength.final === 'EXTERNAL-EDIT!!!';
    report.cases.push({
      name: 'same-length-and-restored-mtime',
      passed: sameLengthTimestamp !== undefined && sameLengthWasSafe
    });

    const openWriter = await runOpenWriterCase(root);
    report.cases.push({ name: 'existing-open-writer-is-rejected', passed: openWriter.rejected && openWriter.unchanged });
    const handleRace = await runHandleRaceCase(root);
    report.cases.push({ name: 'in-place-write-is-rejected', passed: handleRace.external.outcome === 'denied' });

    const crash = await runAtomicCrashCase(root);
    report.partialPublications += Number(crash.partial);
    report.cases.push({
      name: 'process-crash-before-atomic-publication-is-not-partial',
      passed: crash.processCrashed && !crash.partial && crash.unchanged
    });

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
