import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';

if (process.platform !== 'win32') throw new Error('Packaged R2 verification requires Windows.');
const executable = resolve(process.env.CODRYN_PACKAGED_EXE ?? 'apps/desktop/out/Codryn-win32-x64/Codryn.exe');
if (!existsSync(executable)) throw new Error('Packaged Codryn.exe is missing.');
const artifacts = resolve('.r2-artifacts');
await mkdir(artifacts, { recursive: true });
const profile = await mkdtemp(join(artifacts, 'packaged-'));

const exitCode = await new Promise((resolveExit, reject) => {
  const child = spawn(executable, ['--disable-gpu', '--r2-smoke', `--r2-user-data-dir=${profile}`], { shell: false, windowsHide: true, stdio: 'inherit' });
  const timer = setTimeout(() => { child.kill(); reject(new Error('Packaged R2 smoke timed out.')); }, 60_000);
  child.once('error', reject);
  child.once('exit', (code) => { clearTimeout(timer); resolveExit(code); });
});
if (exitCode !== 0) throw new Error(`Packaged R2 smoke exited ${String(exitCode)}.`);
const reportPath = join(profile, 'r2-report.json');
const report = JSON.parse(await readFile(reportPath, 'utf8'));
if (report.schemaVersion !== 1 || report.database !== 'pass' || report.guardedWrite !== 'pass' || report.processTree !== 'pass' || report.returnedToBaseline !== true) throw new Error('Packaged R2 report did not contain passing native-boundary checks.');
console.log(reportPath);
