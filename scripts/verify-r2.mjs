import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const checks = [
  [npm, ['run', 'typecheck']],
  [npm, ['run', 'lint']],
  [npm, ['run', 'check:deps']],
  [npm, ['test']],
  [npm, ['run', 'test:r1-repeatability']],
  [npm, ['run', 'test:r2-repeatability']],
  [npm, ['run', 'package']],
  [process.execPath, ['scripts/verify-packaged-r0.mjs']],
  [process.execPath, ['scripts/verify-packaged-r2.mjs']]
];
const timeoutMs = 10 * 60 * 1000;

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const executable = process.platform === 'win32' && command === npm ? (process.env.ComSpec ?? 'cmd.exe') : command;
    const executableArgs = process.platform === 'win32' && command === npm ? ['/d', '/s', '/c', command, ...args] : args;
    const child = spawn(executable, executableArgs, { stdio: 'inherit', shell: false, windowsHide: true });
    const timer = setTimeout(() => { child.kill(); rejectRun(new Error(`${command} ${args.join(' ')} timed out.`)); }, timeoutMs);
    child.once('error', rejectRun);
    child.once('exit', (code) => { clearTimeout(timer); if (code === 0) resolveRun(); else rejectRun(new Error(`${command} ${args.join(' ')} exited ${String(code)}.`)); });
  });
}

for (const [command, args] of checks) {
  process.stdout.write(`\n=== ${command} ${args.join(' ')} ===\n`);
  await run(command, args);
}
process.stdout.write('\nR2 local verification passed. Live provider verification remains separate.\n');
