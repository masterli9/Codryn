import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const windowsCommand = process.env.ComSpec ?? 'cmd.exe';
const executable = process.platform === 'win32' ? windowsCommand : npm;
const args = process.platform === 'win32'
  ? ['/d', '/s', '/c', npm, 'test', '--', 'tests/r1/repeatability.test.ts']
  : ['test', '--', 'tests/r1/repeatability.test.ts'];
const result = spawnSync(executable, args, {
  cwd: process.cwd(), shell: false, stdio: 'inherit'
});
if (result.error !== undefined) throw result.error;
process.exitCode = result.status ?? 1;
