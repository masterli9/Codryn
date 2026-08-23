import { rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { r0DiagnosticReportSchema, r0DiagnosticRequestSchema, type R0DiagnosticReport } from '@codryn/shared';
import type { ApplicationServices } from '../composition-root.js';

export async function runR0Smoke(
  services: ApplicationServices,
  userDataPath: string
): Promise<R0DiagnosticReport> {
  const request = r0DiagnosticRequestSchema.parse({
    requestId: randomUUID(),
    requestedAt: new Date().toISOString()
  });
  const report = r0DiagnosticReportSchema.parse(await services.runR0Diagnostics.execute(request));
  const destination = join(userDataPath, 'r0-report.json');
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await rename(temporary, destination);
  return report;
}
