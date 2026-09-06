import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

interface ProcessProbeReport {
  supported: boolean;
  orphanCount: number;
  maxTerminationDelayMs: number;
  cases: { name: string; passed: boolean }[];
}

describe('R2 owned process tree probe', () => {
  it('owned process tree is gone within the O1 bound', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      ['scripts/spikes/r2-process-probe.mjs'],
      { timeout: 25_000, maxBuffer: 64 * 1024 }
    );
    const report = JSON.parse(stdout) as ProcessProbeReport;

    expect(report.supported).toBe(true);
    expect(report.orphanCount).toBe(0);
    expect(report.maxTerminationDelayMs).toBeLessThanOrEqual(2_000);
    expect(report.cases.every((testCase) => testCase.passed)).toBe(true);
  }, 30_000);
});
