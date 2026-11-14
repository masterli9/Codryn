import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

it.skipIf(process.platform !== 'win32' || process.env.CODRYN_R4_TYPESCRIPT_PACKAGED !== '1')(
  'runs the fresh packaged Electron TypeScript worker and verifies its report', async () => {
    const { stdout } = await promisify(execFile)(process.execPath, ['scripts/verify-packaged-r4-typescript.mjs'], { timeout: 30000, windowsHide: true });
    expect(stdout.trim()).toMatch(/r4-typescript-worker-smoke\.json$/u);
  }, 35000
);
