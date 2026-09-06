import { createHash, randomUUID } from 'node:crypto';
import { cp, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { changeVerifyReturnScenario, createR2Infrastructure } from '@codryn/infrastructure';

export interface R2SmokeReport {
  readonly schemaVersion: 1;
  readonly database: 'pass' | 'fail';
  readonly guardedWrite: 'pass' | 'fail';
  readonly processTree: 'pass' | 'fail';
  readonly returnedToBaseline: boolean;
}

export async function runR2Smoke(userDataPath: string, fixtureSource: string, runtimeExecutable = process.execPath): Promise<R2SmokeReport> {
  const fixtureRoot = join(userDataPath, 'r2-fixture');
  await cp(fixtureSource, fixtureRoot, { recursive: true, force: true });
  const sumPath = join(fixtureRoot, 'sum.mjs');
  const before = await readFile(sumPath);
  const infrastructure = await createR2Infrastructure({
    projectRoot: fixtureRoot,
    userDataPath,
    scenario: {
      ...changeVerifyReturnScenario({
        expectedHash: createHash('sha256').update(before).digest('hex'),
        projectRoot: fixtureRoot,
        runtimeExecutable
      })
    },
    permissionResponder: async () => 'allow_once'
  });
  try {
    const result = await infrastructure.agentLoop.executeR2({
      requestId: randomUUID(),
      projectRoot: fixtureRoot,
      task: 'Oprav sum a ověř opravu.',
      contextReferences: [],
      maxSteps: 8
    }, new AbortController().signal);
    const setId = result.changeSetId;
    const reverted = setId === null ? { status: 'conflicted' as const } : await infrastructure.changes.revert.execute({ setId, requestId: randomUUID() }, new AbortController().signal);
    const restored = await readFile(sumPath);
    const report: R2SmokeReport = {
      schemaVersion: 1,
      database: existsSync(join(userDataPath, 'codryn.sqlite')) ? 'pass' : 'fail',
      guardedWrite: result.status === 'completed' && result.changeSetId !== null ? 'pass' : 'fail',
      processTree: result.verification.status === 'verified' ? 'pass' : 'fail',
      returnedToBaseline: reverted.status === 'reverted' && Buffer.compare(before, restored) === 0
    };
    const destination = join(userDataPath, 'r2-report.json');
    await writeFile(`${destination}.tmp`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await rename(`${destination}.tmp`, destination);
    return report;
  } finally {
    infrastructure.close();
  }
}
