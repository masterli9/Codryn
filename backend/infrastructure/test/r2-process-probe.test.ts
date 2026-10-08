import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

interface ProcessProbeReport {
  supported: boolean;
  orphanCount: number;
  unknownIdentityCount: number;
  maxTerminationDelayMs: number;
  cases: { name: string; passed: boolean }[];
}

describe('R2 owned process tree probe', () => {
  async function loadIdentityOracle() {
    const probePath = '../../../scripts/spikes/r2-process-probe.mjs';
    return await import(probePath) as {
      identitiesAreAlive: (
        identities: { pid: number; startTimeUtcTicks: string }[],
        execute?: (...args: unknown[]) => Promise<unknown>,
      ) => Promise<boolean>;
      readIdentities: (directory: string, depth: number) => Promise<{
        identities: unknown[];
        evidenceComplete: boolean;
        unknownIdentityCount: number;
      }>;
      fillIncompleteBatchResults: (results: Map<string, unknown>, specifications: { name: string; depth: number }[]) => Map<string, unknown>;
    };
  }

  it('marks missing or malformed identity evidence as unknown', async () => {
    const { readIdentities } = await loadIdentityOracle();
    const directory = await mkdtemp(`${tmpdir()}\\codryn-r2-identity-test-`);
    try {
      await writeFile(`${directory}\\root.json`, '{malformed', 'utf8');
      const evidence = await readIdentities(directory, 1);
      expect(evidence.identities).toHaveLength(0);
      expect(evidence.evidenceComplete).toBe(false);
      expect(evidence.unknownIdentityCount).toBe(2);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('marks unprocessed batch cases incomplete instead of claiming zero orphan evidence', async () => {
    const { fillIncompleteBatchResults } = await loadIdentityOracle();
    const results = new Map<string, unknown>([['first', { passed: true }]]);
    fillIncompleteBatchResults(results, [{ name: 'first', depth: 1 }, { name: 'second', depth: 2 }]);
    expect(results.get('second')).toMatchObject({ passed: false, orphanCount: 0, unknownIdentityCount: 3, evidenceComplete: false });
  });

  it('treats an absent PID as safely terminated without running the identity checker', async () => {
    const { identitiesAreAlive } = await loadIdentityOracle();
    const alive = await identitiesAreAlive([{ pid: 2_147_483_647, startTimeUtcTicks: '1' }], async () => {
      throw new Error('identity checker must not run for ESRCH');
    });
    expect(alive).toBe(false);
  });

  it('requires the recorded start identity when a PID still exists', async () => {
    const { identitiesAreAlive } = await loadIdentityOracle();
    const execute = async (...args: unknown[]) => {
      expect(args[0]).toMatch(/powershell/i);
      expect((args[1] as string[]).join(' ')).toContain("639249720301144065");
      return { stdout: '', stderr: '' };
    };
    await expect(identitiesAreAlive([{ pid: process.pid, startTimeUtcTicks: '639249720301144065' }], execute)).resolves.toBe(false);
  });

  it('keeps a process alive when the identity checker reports a match', async () => {
    const { identitiesAreAlive } = await loadIdentityOracle();
    const alive = await identitiesAreAlive([{ pid: process.pid, startTimeUtcTicks: '1' }], async () => {
      throw Object.assign(new Error('identity match'), { code: 1 });
    });
    expect(alive).toBe(true);
  });

  it('does not count a timed-out identity check as proof that a live process is gone', async () => {
    const { identitiesAreAlive } = await loadIdentityOracle();
    const alive = await identitiesAreAlive([{ pid: process.pid, startTimeUtcTicks: '1' }], async () => {
      throw Object.assign(new Error('identity checker timed out'), { code: null, killed: true, signal: 'SIGTERM' });
    });
    expect(alive).toBe(true);
  });

  it('fails closed when the identity checker exits with an unexpected error', async () => {
    const { identitiesAreAlive } = await loadIdentityOracle();
    const alive = await identitiesAreAlive([{ pid: process.pid, startTimeUtcTicks: '1' }], async () => {
      throw Object.assign(new Error('identity checker failed'), { code: 2 });
    });
    expect(alive).toBe(true);
  });

  it('owned process tree is gone within the O1 bound', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      ['scripts/spikes/r2-process-probe.mjs'],
      { timeout: 45_000, maxBuffer: 64 * 1024 }
    );
    const report = JSON.parse(stdout) as ProcessProbeReport;

    expect(report.supported).toBe(true);
    expect(report.orphanCount).toBe(0);
    expect(report.unknownIdentityCount).toBe(0);
    expect(report.maxTerminationDelayMs).toBeLessThanOrEqual(2_000);
    expect(report.cases.every((testCase) => testCase.passed)).toBe(true);
  }, 50_000);
});
