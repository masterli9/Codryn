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
const diagnostic = (event, details) => {
  if (process.env.CODRYN_PROCESS_PROBE_DIAGNOSTICS === '1') process.stderr.write(`${JSON.stringify({ event, ...details })}\n`);
};

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

export async function identitiesAreAlive(identities, execute = execFileAsync) {
  const checkStartedAt = Date.now();
  const valid = identities.filter((identity) => Number.isInteger(identity.pid) && identity.pid > 0 && /^\d+$/.test(identity.startTimeUtcTicks));
  if (valid.length !== identities.length) return true;
  const existing = valid.filter((identity) => {
    try {
      process.kill(identity.pid, 0);
      return true;
    } catch (error) {
      // Only ESRCH proves absence. Access errors still require an identity check.
      return error?.code !== 'ESRCH';
    }
  });
  if (existing.length === 0) return false;
  const checks = existing.map((identity) => [
    `$p = Get-Process -Id ([int]${identity.pid}) -ErrorAction SilentlyContinue`,
    `if ($null -ne $p -and $p.StartTime.ToUniversalTime().Ticks.ToString() -eq '${identity.startTimeUtcTicks}') { $alive = $true }`
  ]);
  const command = ["$ErrorActionPreference = 'Stop'", 'try { $alive = $false', ...checks.flat(), 'if ($alive) { exit 1 }; exit 0 } catch { exit 2 }'].join('; ');
  try {
    await execute(powershell, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command
    ], { windowsHide: true, timeout: 1000, maxBuffer: 4096 });
    return false;
  } catch (error) {
    diagnostic('identity-check-error', { elapsedMs: Date.now() - checkStartedAt, code: error?.code, killed: error?.killed, signal: error?.signal });
    // A failed/expired checker is not evidence of termination.
    return true;
  }
}

export async function readIdentities(directory, depth) {
  const names = ['root'];
  if (depth >= 1) names.push('child');
  if (depth >= 2) names.push('grandchild');
  const identities = [];
  let unknownIdentityCount = 0;
  for (const name of names) {
    try {
      const identity = JSON.parse(await readFile(join(directory, `${name}.json`), 'utf8'));
      if (!Number.isInteger(identity?.pid) || identity.pid <= 0 || typeof identity.processName !== 'string' || identity.processName.length === 0 || !/^\d+$/.test(identity.startTimeUtcTicks)) {
        unknownIdentityCount++;
        continue;
      }
      identities.push(identity);
    } catch {
      unknownIdentityCount++;
    }
  }
  return { identities, evidenceComplete: unknownIdentityCount === 0 && identities.length === names.length, unknownIdentityCount };
}

async function runScenario(root, name, depth, crash = false) {
  const scenarioStartedAt = Date.now();
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
  diagnostic('handshake', { name, handshake, elapsedMs: Date.now() - scenarioStartedAt });
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
  const identityEvidence = await readIdentities(identityDirectory, depth);
  const identities = identityEvidence.identities;
  const deadline = Date.now() + 2000;
  let alive = identities;
  while (alive.length > 0 && Date.now() <= deadline) {
    if (!(await identitiesAreAlive(alive))) alive = [];
    else await waitMs(20);
  }
  const result = {
    passed: handshake && close.signal !== 'timeout' && identityEvidence.evidenceComplete && alive.length === 0,
    orphanCount: alive.length,
    unknownIdentityCount: identityEvidence.unknownIdentityCount,
    evidenceComplete: identityEvidence.evidenceComplete,
    terminationDelayMs: Math.max(0, Date.now() - startedAt),
    identities,
    close
  };
  diagnostic('scenario', { name, elapsedMs: Date.now() - scenarioStartedAt, ...result });
  return result;
}

export function fillIncompleteBatchResults(results, specifications) {
  for (const specification of specifications) {
    if (results.has(specification.name)) continue;
    results.set(specification.name, {
      passed: false,
      orphanCount: 0,
      unknownIdentityCount: specification.depth + 1,
      evidenceComplete: false,
      terminationDelayMs: 0,
      identities: []
    });
  }
  return results;
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
    stdio: ['ignore', 'ignore', 'pipe']
  });
  child.stderr.on('data', (chunk) => diagnostic('worker-stderr', { text: chunk.toString() }));
  const closed = closeResult(child);
  const results = new Map();
  for (const specification of batchSpecifications) {
    const scenarioStartedAt = Date.now();
    const handshake = await waitForPath(specification.readyMarker, 10000);
    diagnostic('handshake', { name: specification.name, handshake, elapsedMs: Date.now() - scenarioStartedAt });
    const startedAt = Date.now();
    if (handshake) await writeFile(specification.stopMarker, 'stop', 'ascii');
    const done = handshake && await waitForPath(specification.doneMarker, 3000);
    const identityEvidence = await readIdentities(specification.identityDirectory, specification.depth);
    const identities = identityEvidence.identities;
    const deadline = Date.now() + 2000;
    let alive = identities;
    while (alive.length > 0 && Date.now() <= deadline) {
      if (!(await identitiesAreAlive(alive))) alive = [];
      else await waitMs(20);
    }
    results.set(specification.name, {
      passed: handshake && done && identityEvidence.evidenceComplete && alive.length === 0,
      orphanCount: alive.length,
      unknownIdentityCount: identityEvidence.unknownIdentityCount,
      evidenceComplete: identityEvidence.evidenceComplete,
      terminationDelayMs: Math.max(0, Date.now() - startedAt),
      identities
    });
    diagnostic('scenario', { name: specification.name, done, elapsedMs: Date.now() - scenarioStartedAt, ...results.get(specification.name) });
    if (!handshake || !done) break;
  }
  const close = await Promise.race([
    closed,
    waitMs(3000).then(() => ({ code: null, signal: 'timeout' }))
  ]);
  if (close.signal === 'timeout') await terminateWorker(child);
  diagnostic('batch-close', close);
  return fillIncompleteBatchResults(results, batchSpecifications);
}

async function main() {
  const report = {
    supported: false,
    orphanCount: 0,
    unknownIdentityCount: 0,
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
      report.unknownIdentityCount += result.unknownIdentityCount;
      report.maxTerminationDelayMs = Math.max(report.maxTerminationDelayMs, result.terminationDelayMs);
      if (name === 'pid-reuse-first' || name === 'pid-reuse-second') continue;
      report.cases.push({ name, passed: result.passed });
    }

    const hostCrash = await runScenario(root, 'host-crash', 2, true);
    report.orphanCount += hostCrash.orphanCount;
    report.unknownIdentityCount += hostCrash.unknownIdentityCount;
    report.maxTerminationDelayMs = Math.max(report.maxTerminationDelayMs, hostCrash.terminationDelayMs);
    report.cases.push({ name: 'host-crash', passed: hostCrash.passed });

    const first = normalResults.get('pid-reuse-first');
    const second = normalResults.get('pid-reuse-second');
    const firstByPid = new Map(first.identities.map((identity) => [identity.pid, identity.startTimeUtcTicks]));
    const reusedWithSameIdentity = second.identities.some((identity) => firstByPid.get(identity.pid) === identity.startTimeUtcTicks);
    report.orphanCount += first.orphanCount + second.orphanCount;
    report.unknownIdentityCount += first.unknownIdentityCount + second.unknownIdentityCount;
    report.maxTerminationDelayMs = Math.max(report.maxTerminationDelayMs, first.terminationDelayMs, second.terminationDelayMs);
    report.cases.push({ name: 'pid-reuse-evidence', passed: first.passed && second.passed && !reusedWithSameIdentity });
    report.supported = report.cases.length === 8 && report.cases.every((testCase) => testCase.passed)
      && report.orphanCount === 0 && report.unknownIdentityCount === 0 && report.maxTerminationDelayMs <= 2000;
    process.stdout.write(JSON.stringify(report));
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
