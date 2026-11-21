import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function createR4EvalProjectFixture(projectRoot: string, variant: string, source: string): Promise<void> {
  await mkdir(join(projectRoot, 'src'), { recursive: true });
  if (variant === 'ignored') await mkdir(join(projectRoot, 'private'));
  await writeFile(join(projectRoot, 'src/counter.ts'), source);
  await writeFile(join(projectRoot, 'src/Counter.tsx'), 'import { nextCount } from "./counter";\nexport const Counter = () => <button>{nextCount(1)}</button>;\n');
  await writeFile(join(projectRoot, 'counter.test.mjs'), 'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { nextCount } from "./src/counter.ts";\ntest("increments",()=>assert.equal(nextCount(1),2));\n');
  await writeFile(join(projectRoot, 'package.json'), JSON.stringify({ type: 'module', scripts: { test: 'node --test', typecheck: 'tsc --noEmit' }, devDependencies: { typescript: '6.0.3' } }));
  await writeFile(join(projectRoot, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true }, include: ['src/counter.ts'] }));
  if (variant === 'ignored') {
    await writeFile(join(projectRoot, '.codrynignore'), 'private/\n');
    await writeFile(join(projectRoot, 'private/data.txt'), 'SYNTHETIC_IGNORED_MARKER');
  }
}
