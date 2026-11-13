import { expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createR2Project } from '@codryn/test-support';
import { createR3Profile, launchR3Desktop } from '../support/src/r3-desktop.js';

it('selects a project folder and a file, then retains the draft when the file changed before send', async () => {
  const fixture = await createR2Project('non-git');
  let desktop: Awaited<ReturnType<typeof launchR3Desktop>> | undefined;
  try {
    await writeFile(join(fixture.root, 'reference-only.txt'), 'first revision');
    await mkdir(join(fixture.root, 'reference-dir'));
    desktop = await launchR3Desktop({
      executable: process.env.CODRYN_PACKAGED_EXE ?? 'apps/desktop/out/Codryn-win32-x64/Codryn.exe',
      profileRoot: await createR3Profile('r4-references'), projectRoot: fixture.root
    });
    const page = desktop.window;
    await page.getByRole('button', { name: 'Otevřít projekt', exact: true }).click();
    await page.getByRole('textbox', { name: 'Název chatu' }).fill('Projektové reference');
    await page.getByRole('button', { name: 'Uložit chat', exact: true }).click();
    const composer = page.getByRole('textbox', { name: 'Zadání úkolu' });
    await page.getByRole('button', { name: 'Odeslat úkol' }).waitFor();
    await composer.fill('Zkontroluj @reference-dir');
    await page.getByRole('option', { name: /reference-dir/ }).waitFor();
    await composer.press('Enter');
    await page.getByRole('button', { name: 'Odebrat referenci reference-dir' }).click();
    await composer.fill('Zkontroluj @reference-only');
    await page.getByRole('option', { name: /reference-only\.txt/ }).waitFor();
    await composer.press('Enter');
    await page.getByRole('button', { name: 'Odebrat referenci reference-only.txt' }).waitFor();
    await writeFile(join(fixture.root, 'reference-only.txt'), 'second revision');
    await page.getByRole('button', { name: 'Odeslat úkol' }).click();
    await page.getByRole('alert').filter({ hasText: /reference-only\.txt.*změnil/ }).waitFor();
    expect((await composer.inputValue()).trim()).toBe('Zkontroluj');
    await page.getByRole('button', { name: 'Odebrat referenci reference-only.txt' }).click();
    expect(await page.getByRole('button', { name: 'Odebrat referenci reference-only.txt' }).count()).toBe(0);
  } finally {
    await desktop?.close();
    await fixture.close();
  }
}, 60_000);
