import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { typescriptQueryInputSchema } from '@codryn/shared';
import { ContextPathPolicy } from '../src/filesystem/context-path-policy.js';
import { executeTypeScriptQuery } from '../src/typescript/typescript-query-engine.js';

it('blocks ignored and aliased inputs and limits semantic output for blocked dependencies or invalid config', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'codryn-ts-security-')));
  try {
    const outside = join(root, 'outside'), project = join(root, 'project');
    await mkdir(outside); await mkdir(project); await mkdir(join(project, 'node_modules', 'sealed'), { recursive: true });
    await writeFile(join(outside, 'tsconfig.json'), '{"compilerOptions":{"strict":true}}');
    await symlink(outside, join(project, 'alias'), 'junction');
    await writeFile(join(project, 'node_modules', 'sealed', 'index.d.ts'), 'export type Hidden = "SECRET_CANARY";');
    await writeFile(join(project, 'app.ts'), 'import type { Hidden } from "sealed";\nexport let result: Hidden;\n');
    await writeFile(join(project, 'ignored.ts'), 'export const hidden = "PRIVATE";');
    await writeFile(join(project, '.codrynignore'), 'ignored.ts\n');
    const policy = await ContextPathPolicy.fromProjectRoot(project);
    const query = (query: object) => executeTypeScriptQuery(typescriptQueryInputSchema.parse({ path: 'app.ts', ...query }), { root: project, policy, expectedRevision: 1, signal: AbortSignal.timeout(5000) });
    await writeFile(join(project, 'tsconfig.json'), '{"extends":"./alias/tsconfig.json","include":["*.ts"]}');
    expect(await query({ kind: 'type', symbol: 'result' })).toMatchObject({ status: 'limited', mode: 'fallback', items: [], reason: 'invalid_config' });
    expect(await query({ kind: 'exports' })).toMatchObject({ status: 'limited', mode: 'fallback', items: [{ name: 'result' }] });
    await writeFile(join(project, 'tsconfig.json'), '{"compilerOptions":{"moduleResolution":"bundler","module":"esnext"},"include":["*.ts"]}');
    expect(await query({ kind: 'type', symbol: 'result' })).toMatchObject({ status: 'limited', mode: 'configured', items: [], reason: 'dependency_unavailable' });
    expect(await query({ kind: 'exports', path: 'ignored.ts' })).toMatchObject({ status: 'unsupported', items: [] });
    expect(await query({ kind: 'exports', path: 'node_modules/sealed/index.d.ts' })).toMatchObject({ status: 'unsupported', items: [] });
    expect(await query({ kind: 'exports', path: 'alias/tsconfig.json' })).toMatchObject({ status: 'unsupported', items: [] });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 20000);
