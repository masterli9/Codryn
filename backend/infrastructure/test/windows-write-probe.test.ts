import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

type WriteProbeReport = {
  supported: boolean;
  partialPublications: number;
  overwrittenExternalWrites: number;
  escapedPaths: number;
  cases: { name: string; passed: boolean }[];
};

describe('R2 guarded publication probe', () => {
  it('write probe never overwrites a competing editor', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      ['scripts/spikes/r2-write-probe.mjs', '--iterations', '100'],
      { timeout: 45_000, maxBuffer: 64 * 1024 }
    );
    const report = JSON.parse(stdout) as WriteProbeReport;

    expect(report.supported).toBe(true);
    expect(report.partialPublications).toBe(0);
    expect(report.overwrittenExternalWrites).toBe(0);
    expect(report.escapedPaths).toBe(0);
    expect(report.cases.length).toBeGreaterThanOrEqual(8);
    expect(report.cases.every((testCase) => testCase.passed)).toBe(true);
  }, 50_000);
});
