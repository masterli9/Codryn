import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileHash, verifyBuild } from './r3-build-identity.mjs';

const build = await verifyBuild();
const tsc = join(dirname(build.executable), 'resources', 'typescript', 'bin', 'tsc');
if (await realpath(tsc) !== tsc) throw new Error('R4_TYPESCRIPT_RUNTIME_ALIAS');
const artifacts = resolve('.r3-artifacts');
await mkdir(artifacts, { recursive: true });
const project = await mkdtemp(join(artifacts, 'packaged-ts-check-'));
const run = promisify(execFile), options = { cwd: project, timeout: 15000, windowsHide: true };
try {
  const { stdout } = await run(process.execPath, [tsc, '--version'], options);
  const version = stdout.trim();
  if (!/^Version 6\.0\.3$/u.test(version)) throw new Error('R4_TYPESCRIPT_RUNTIME_VERSION');
  await writeFile(join(project, 'tsconfig.json'), '{"compilerOptions":{"strict":true,"types":[]},"files":["probe.ts"]}');
  const source = join(project, 'probe.ts');
  await writeFile(source, 'export const probe: number = 1;\n');
  await run(process.execPath, [tsc, '--noEmit', '-p', join(project, 'tsconfig.json')], options);
  await writeFile(source, 'export const probe: number = "invalid";\n');
  let diagnosed = false;
  try { await run(process.execPath, [tsc, '--noEmit', '-p', join(project, 'tsconfig.json')], options); }
  catch (error) { diagnosed = error.code === 2 && String(error.stdout).includes('TS2322'); }
  if (!diagnosed) throw new Error('R4_TYPESCRIPT_RUNTIME_DIAGNOSTIC');
  const report = { build, tsc, tscHash: await fileHash(tsc), version, checkedGoodAndBadTypes: true };
  await writeFile(join(artifacts, 'r4-project-checks-packaged.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(join(artifacts, 'r4-project-checks-packaged.json'));
} finally {
  await rm(project, { recursive: true, force: true });
}
