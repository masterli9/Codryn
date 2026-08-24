import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['test', '--', 'tests/r1/repeatability.test.ts'], {
  cwd: process.cwd(), shell: false, stdio: 'inherit'
});
process.exitCode = result.status ?? 1;
