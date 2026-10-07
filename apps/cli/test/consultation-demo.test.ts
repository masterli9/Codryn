import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runConsultationDemo } from '../../../scripts/consultation-demo.js';

describe('consultation demo with real R2 services', () => {
  it.each(['allow_once', 'deny'] as const)('shows real evidence for %s and returns the original file', async (decision) => {
    const output: string[] = [];
    const result = await runConsultationDemo({
      write: (line) => output.push(line),
      pause: async () => {},
      approve: async () => decision
    });
    try {
      expect(result.beforeExitCode).toBe(1);
      expect(result.commandStarted).toBe(decision === 'allow_once');
      expect(result.result.verification.status).toBe(decision === 'allow_once' ? 'verified' : 'unverified');
      expect(result.returnedToBaseline).toBe(true);
      expect(await readFile(join(result.projectRoot, 'sum.mjs'), 'utf8')).toContain('return a - b');
      expect(output.join('\n')).toContain('sum.mjs:1');
      expect(output.join('\n')).toContain('return a + b');
      expect(output.join('\n')).toContain(decision === 'allow_once' ? 'TEST PROŠEL' : 'PŘÍKAZ SE NESPUSTIL');
    } finally {
      await rm(result.demoRoot, { recursive: true, force: true });
    }
  }, 60_000);
});
