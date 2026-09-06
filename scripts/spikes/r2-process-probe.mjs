import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const waitMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
const powershell = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const probeDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(probeDirectory, '..', '..');
const worker = join(probeDirectory, 'r2-process-worker.ps1');
const baseArgs = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', worker];

async function waitForPath(path, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    try {
      await readFile(path);
      return true;
    } catch {
      await waitMs(5);
    }
  }
  return false;
}

function closeResult(child) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (code, signal) => {
      if (settled) return;
      settled = true;
      resolve({ code, signal });
    };
    child.once('close', settle);
    child.once('error', () => settle(null, 'error'));
  });
}

async function terminateWorker(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try { child.kill(); } catch { /* The close result records the failure. */ }
}

async function identitiesAreAlive(identities) {
  const valid = identities.filter((identity) => Number.isInteger(identity.pid) && /^\d+$/.test(identity.startTimeUtcTicks));
  if (valid.length === 0) return false;
  const checks = valid.map((identity) => [
    `$p = Get-Process -Id ([int]${identity.pid}) -ErrorAction SilentlyContinue`,
    `if ($null -ne $p -and $p.StartTime.ToUniversalTime().Ticks.ToString() -eq '${identity.startTimeUtcTicks}') { $alive = $true }`
  ]);
  const command = ['$alive = $false', ...checks.flat(), 'if ($alive) { exit 1 }; exit 0'].join('; ');
  try {
    await execFileAsync(powershell, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command
    ], { windowsHide: true, timeout: 1000, maxBuffer: 4096 });
    return false;
  } catch (error) {
    return error?.code === 1;
  }
}

async function readIdentities(directory) {
  const names = ['root', 'child', 'grandchild'];
  const identities = [];
  for (const name of names) {
    try {
      identities.push(JSON.parse(await readFile(join(directory, `${name}.json`), 'utf8')));
    } catch {
      // A missing identity means the worker failed before the ownership handshake.
    }
  }
  return identities;
}

async function runScenario(root, name, depth, crash = false) {
  const directory = join(root, name);
  await mkdir(directory, { recursive: true });
  const identityDirectory = join(directory, 'identities');
  await mkdir(identityDirectory, { recursive: true });
  const ready = join(directory, 'ready');
  const stop = join(directory, 'stop');
  const child = spawn(powershell, [
    ...baseArgs, '-Scenario', name, '-Root', directory,
    '-IdentityDirectory', identityDirectory, '-ReadyMarker', ready,
    '-StopMarker', stop, '-Depth', String(depth), '-TimeoutMs', '10000'
  ], { cwd: repositoryRoot, windowsHide: true, stdio: 'ignore' });
  const closed = closeResult(child);
  const handshake = await waitForPath(ready, 10000);
  const startedAt = Date.now();
  if (handshake) {
    if (crash) await terminateWorker(child);
    else await writeFile(stop, 'stop', 'ascii');
  } else {
    await terminateWorker(child);
  }
  const close = await Promise.race([
    closed,
    waitMs(3000).then(() => ({ code: null, signal: 'timeout' }))
  ]);
  if (close.signal === 'timeout') await terminateWorker(child);
  const identities = await readIdentities(identityDirectory);
  const deadline = Date.now() + 2000;
  let alive = identities;
  while (alive.length > 0 && Date.now() <= deadline) {
    if (!(await identitiesAreAlive(alive))) alive = [];
    else await waitMs(20);
  }
  return {
    passed: handshake && close.signal !== 'timeout' && alive.length === 0,
    orphanCount: alive.length,
    terminationDelayMs: Math.max(0, Date.now() - startedAt),
    identities,
    close
  };
}

async function runBatch(root, specifications) {
  const batchSpecifications = [];
  for (const specification of specifications) {
    const directory = join(root, specification.name);
    const identityDirectory = join(directory, 'identities');
    await mkdir(identityDirectory, { recursive: true });
    batchSpecifications.push({
      ...specification,
      root: directory,
      identityDirectory,
      readyMarker: join(directory, 'ready'),
      stopMarker: join(directory, 'stop'),
      doneMarker: join(directory, 'done')
    });
  }
  const configuration = join(root, 'batch.json');
  await writeFile(configuration, JSON.stringify(batchSpecifications), 'utf8');
  const child = spawn(powershell, [...baseArgs, '-BatchConfig', configuration], {
    cwd: repositoryRoot,
    windowsHide: true,
    stdio: 'ignore'
  });
  const closed = closeResult(child);
  const results = new Map();
  for (const specification of batchSpecifications) {
    const handshake = await waitForPath(specification.readyMarker, 10000);
    const startedAt = Date.now();
    if (handshake) await writeFile(specification.stopMarker, 'stop', 'ascii');
    const done = handshake && await waitForPath(specification.doneMarker, 3000);
    const identities = await readIdentities(specification.identityDirectory);
    const deadline = Date.now() + 2000;
    let alive = identities;
    while (alive.length > 0 && Date.now() <= deadline) {
      if (!(await identitiesAreAlive(alive))) alive = [];
      else await waitMs(20);
    }
    results.set(specification.name, {
      passed: handshake && done && alive.length === 0,
      orphanCount: alive.length,
      terminationDelayMs: Math.max(0, Date.now() - startedAt),
      identities
    });
    if (!handshake || !done) break;
  }
  const close = await Promise.race([
    closed,
    waitMs(3000).then(() => ({ code: null, signal: 'timeout' }))
  ]);
  if (close.signal === 'timeout') await terminateWorker(child);
  for (const specification of batchSpecifications) {
    if (results.has(specification.name)) continue;
    results.set(specification.name, {
      passed: false,
      orphanCount: 0,
      terminationDelayMs: 0,
      identities: []
    });
  }
  return results;
}

async function main() {
  const report = {
    supported: false,
    orphanCount: 0,
    maxTerminationDelayMs: 0,
    cases: []
  };
  if (process.platform !== 'win32') {
    report.cases.push({ name: 'windows-platform', passed: false });
    process.stdout.write(JSON.stringify(report));
    return;
  }

  const root = await mkdtemp(join(tmpdir(), 'codryn-r2-process-probe-'));
  try {
    const normalScenarios = [
      ['child', 1, false],
      ['grandchild', 2, false],
      ['early-parent-exit', 1, false],
      ['timeout', 2, false],
      ['cancel', 2, false],
      ['output-limit', 2, false],
      ['pid-reuse-first', 1, false],
      ['pid-reuse-second', 1, false]
    ];
    const normalResults = await runBatch(
      root,
      normalScenarios.map(([name, depth]) => ({ name, depth, scenario: name }))
    );
    for (const [name] of normalScenarios) {
      const result = normalResults.get(name);
      report.orphanCount += result.orphanCount;
      report.maxTerminationDelayMs = Math.max(report.maxTerminationDelayMs, result.terminationDelayMs);
      if (name === 'pid-reuse-first' || name === 'pid-reuse-second') continue;
      report.cases.push({ name, passed: result.passed });
    }

    const hostCrash = await runScenario(root, 'host-crash', 2, true);
    report.orphanCount += hostCrash.orphanCount;
    report.maxTerminationDelayMs = Math.max(report.maxTerminationDelayMs, hostCrash.terminationDelayMs);
    report.cases.push({ name: 'host-crash', passed: hostCrash.passed });

    const first = normalResults.get('pid-reuse-first');
    const second = normalResults.get('pid-reuse-second');
    const firstByPid = new Map(first.identities.map((identity) => [identity.pid, identity.startTimeUtcTicks]));
    const reusedWithSameIdentity = second.identities.some((identity) => firstByPid.get(identity.pid) === identity.startTimeUtcTicks);
    report.orphanCount += first.orphanCount + second.orphanCount;
    report.maxTerminationDelayMs = Math.max(report.maxTerminationDelayMs, first.terminationDelayMs, second.terminationDelayMs);
    report.cases.push({ name: 'pid-reuse-evidence', passed: first.passed && second.passed && !reusedWithSameIdentity });
    report.supported = report.cases.length === 8 && report.cases.every((testCase) => testCase.passed)
      && report.orphanCount === 0 && report.maxTerminationDelayMs <= 2000;
    process.stdout.write(JSON.stringify(report));
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
