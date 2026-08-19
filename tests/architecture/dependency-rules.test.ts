import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { cruise } from 'dependency-cruiser';
import { describe, expect, it } from 'vitest';
import boundaryConfig from '../../dependency-cruiser.config.mjs';

const manifests = [
  ['apps/desktop/package.json', '@codryn/desktop'],
  ['backend/core/package.json', '@codryn/core'],
  ['backend/infrastructure/package.json', '@codryn/infrastructure'],
  ['shared/package.json', '@codryn/shared'],
  ['tests/support/package.json', '@codryn/test-support']
] as const;

const workspaceRoot = process.cwd();

async function createFixture(parentDirectory: string) {
  const parent = join(workspaceRoot, parentDirectory);
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, 'dependency-rules-'));

  return { directory, file: join(directory, 'index.ts') };
}

async function dependencyViolations(file: string) {
  const result = await cruise([relative(workspaceRoot, file)], {
    ...boundaryConfig.options,
    validate: true,
    ruleSet: { forbidden: boundaryConfig.forbidden }
  });

  if (typeof result.output === 'string') {
    throw new Error('Expected dependency-cruiser to return a structured result.');
  }

  return result.output.summary.violations;
}

describe('workspace boundaries', () => {
  it.each(manifests)('%s is a private workspace named %s', async (file, name) => {
    const manifest = JSON.parse(await readFile(file, 'utf8')) as {
      name: string;
      private: boolean;
    };
    expect(manifest).toMatchObject({ name, private: true });
  });
});

describe('production dependency boundaries', () => {
  it('rejects a nested core-to-desktop import with the core boundary rule', async () => {
    const root = await mkdtemp(join(workspaceRoot, 'tests', 'dependency-rules-'));
    const coreDirectory = join(root, 'backend/core');
    const desktopDirectory = join(root, 'apps/desktop');
    try {
      await mkdir(coreDirectory, { recursive: true });
      await mkdir(desktopDirectory, { recursive: true });
      await writeFile(join(desktopDirectory, 'index.ts'), 'export const desktop = true;\n');
      await writeFile(join(coreDirectory, 'index.ts'), "import { desktop } from '../../apps/desktop/index';\nvoid desktop;\n");
      const violations = await dependencyViolations(join(coreDirectory, 'index.ts'));
      expect(violations).toContainEqual(expect.objectContaining({
        rule: expect.objectContaining({ name: 'core-must-not-import-infrastructure' })
      }));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    'node:sqlite',
    'node:child_process',
    'node:fs/promises',
    'simple-git'
  ])('rejects a core import of %s', async (moduleSpecifier) => {
    const fixture = await createFixture('backend/core/test');

    try {
      await writeFile(fixture.file, `import '${moduleSpecifier}';\n`);
      const violations = await dependencyViolations(fixture.file);

      expect(violations).toContainEqual(
        expect.objectContaining({
          rule: expect.objectContaining({
            name: 'core-must-not-import-runtime-adapters'
          })
        })
      );
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it('declares Electron as a forbidden core runtime adapter', () => {
    const rule = boundaryConfig.forbidden.find(({ name }) => name === 'core-must-not-import-runtime-adapters');
    expect(rule).toBeDefined();
    expect(new RegExp(rule?.to.path ?? '')).toMatchObject(expect.any(RegExp));
    expect(new RegExp(rule?.to.path ?? '').test('electron')).toBe(true);
  });

  it('rejects a renderer import of a main-process module', async () => {
    const rendererFixture = await createFixture('apps/desktop/src/renderer/test');
    const fixtureName = basename(rendererFixture.directory);
    const mainDirectory = join(
      workspaceRoot,
      'apps/desktop/src/main/test',
      fixtureName
    );

    try {
      await mkdir(mainDirectory, { recursive: true });
      await writeFile(join(mainDirectory, 'main-only.ts'), 'export {};\n');
      await writeFile(
        rendererFixture.file,
        `import '../../../main/test/${fixtureName}/main-only';\n`
      );
      const violations = await dependencyViolations(rendererFixture.file);

      expect(violations).toContainEqual(
        expect.objectContaining({
          rule: expect.objectContaining({ name: 'renderer-must-use-preload' })
        })
      );
    } finally {
      await rm(rendererFixture.directory, { recursive: true, force: true });
      await rm(mainDirectory, { recursive: true, force: true });
    }
  });

  it('keeps renderer imports from shared allowed', async () => {
    const fixture = await createFixture('apps/desktop/src/renderer/test');

    try {
      await writeFile(fixture.file, "import '@codryn/shared';\n");
      const violations = await dependencyViolations(fixture.file);

      expect(violations).not.toContainEqual(
        expect.objectContaining({
          rule: expect.objectContaining({ name: 'renderer-must-use-preload' })
        })
      );
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });
});
