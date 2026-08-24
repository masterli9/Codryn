import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const commands = [
  [npm, ['run', 'typecheck']],
  [npm, ['run', 'lint']],
  [npm, ['run', 'check:deps']],
  [npm, ['test']],
  [npm, ['run', 'test:r1-repeatability']],
  [npm, ['run', 'package']],
  [process.execPath, ['scripts/verify-packaged-r0.mjs']]
];

for (const [command, args] of commands) {
  console.log(`\n=== ${command} ${args.join(' ')} ===`);
  const windowsCommand = process.env.ComSpec ?? 'cmd.exe';
  const executable = process.platform === 'win32' && command === npm ? windowsCommand : command;
  const executableArgs = process.platform === 'win32' && command === npm
    ? ['/d', '/s', '/c', command, ...args]
    : args;
  const result = spawnSync(executable, executableArgs, { stdio: 'inherit', shell: false });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('\nR1 verification passed.');
