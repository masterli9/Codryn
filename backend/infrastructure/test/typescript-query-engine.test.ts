import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { typescriptQueryInputSchema } from '@codryn/shared';
import { ContextPathPolicy } from '../src/filesystem/context-path-policy.js';
import { executeTypeScriptQuery } from '../src/typescript/typescript-query-engine.js';

it('resolves alias definitions, references and signatures with small exact positions', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'codryn-ts-query-')));
  try {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'tsconfig.json'), '{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","types":[]},"include":["src"]}');
    await writeFile(join(root, 'src', 'lib.ts'), 'export function identity<T>(value: T): T { return value; }\n');
    await writeFile(join(root, 'src', 'app.ts'), 'import { identity as id } from "./lib.js";\nexport const value = id(1);\n');
    const policy = await ContextPathPolicy.fromProjectRoot(root);
    const query = (input: object) => executeTypeScriptQuery(typescriptQueryInputSchema.parse({ path: 'src/app.ts', ...input }), { root, policy, expectedRevision: 1, signal: AbortSignal.timeout(5000) });
    expect(await query({ kind: 'definition', line: 2, column: 22 })).toMatchObject({ status: 'ok', items: [{ path: 'src/lib.ts', line: 1, column: 17, name: 'identity' }] });
    expect(await query({ kind: 'references', symbol: 'id' })).toMatchObject({ status: 'ok', items: expect.arrayContaining([
      expect.objectContaining({ path: 'src/app.ts', line: 2, column: 22 }), expect.objectContaining({ path: 'src/lib.ts', line: 1, column: 17 })
    ]) });
    expect(await query({ kind: 'signature', symbol: 'id' })).toMatchObject({ status: 'ok', items: [{ display: '<T>(value: T): T' }] });
    expect(await query({ kind: 'imports' })).toMatchObject({ status: 'ok', items: [{ relation: 'import', target: 'src/lib.ts' }] });
    expect(await query({ kind: 'type', symbol: 'value' })).toMatchObject({ status: 'ok', items: [{ display: '1' }] });
    expect(await query({ kind: 'exports' })).toMatchObject({ status: 'ok', items: [{ name: 'value', line: 2, column: 14 }] });
    await writeFile(join(root, 'src', 'app.ts'), 'export const value: number = "other";\n');
    expect(await query({ kind: 'diagnostics' })).toMatchObject({ status: 'ok', items: [{ code: 2322, line: 1, column: 14 }] });
    await writeFile(join(root, 'src', 'app.ts'), 'export const many = 1;\n' + 'void many;\n'.repeat(100));
    const references = await query({ kind: 'references', symbol: 'many', maxResults: 50 });
    expect(references.truncated).toBe(true);
    expect(references.items).toHaveLength(50);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 20000);
