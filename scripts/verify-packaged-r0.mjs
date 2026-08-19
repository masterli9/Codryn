import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';

if (process.platform !== 'win32') throw new Error('Packaged R0 verification requires Windows.');
const executable = resolve('apps/desktop/out/Codryn-win32-x64/Codryn.exe');
if (!existsSync(executable)) throw new Error('Packaged Codryn.exe is missing.');
const root = resolve('.r0-artifacts');
await mkdir(root, { recursive: true });
const profile = await mkdtemp(join(root, 'packaged-'));

const exitCode = await new Promise((resolveExit, reject) => {
  const child = spawn(executable, ['--r0-smoke', `--r0-user-data-dir=${profile}`], {
    shell: false,
    windowsHide: true,
    stdio: 'inherit'
  });
  const timer = setTimeout(() => {
    spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true });
    reject(new Error('Packaged R0 smoke timed out.'));
  }, 60_000);
  child.once('error', reject);
  child.once('exit', (code) => { clearTimeout(timer); resolveExit(code); });
});
if (exitCode !== 0) throw new Error(`Packaged R0 smoke exited ${String(exitCode)}.`);

const reportPath = join(profile, 'r0-report.json');
const report = JSON.parse(await readFile(reportPath, 'utf8'));
if (report.schemaVersion !== 1 || report.overallStatus !== 'passed' || report.checks?.length !== 11 || report.checks.some((check) => check.status !== 'pass')) {
  throw new Error('Packaged R0 report did not contain eleven passing checks.');
}
if (!existsSync(join(profile, 'codryn.sqlite')) || !existsSync(join(profile, 'logs', 'codryn.log.jsonl'))) {
  throw new Error('Packaged R0 artifacts are incomplete.');
}
if (!(await readdir(join(profile, 'backups'))).some((name) => name.endsWith('.sqlite'))) {
  throw new Error('Packaged R0 backup is missing.');
}
console.log(reportPath);
