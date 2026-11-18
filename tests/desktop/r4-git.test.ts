import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createR2Project } from '@codryn/test-support';
import { createR3Profile, launchR3Desktop } from '../support/src/r3-desktop.js';

it('stages and reviews a file, then creates an explicitly confirmed local commit', async () => {
  const fixture = await createR2Project('git');
  let desktop: Awaited<ReturnType<typeof launchR3Desktop>> | undefined;
  const git = (...args: string[]) => execFileSync('git', args, { cwd: fixture.root, windowsHide: true, timeout: 5000, encoding: 'utf8' }).trim();
  try {
    git('config', 'user.name', 'Codryn Test');
    git('config', 'user.email', 'test@example.invalid');
    await writeFile(join(fixture.root, 'desktop-proof.txt'), 'Local staged data\n');
    desktop = await launchR3Desktop({
      executable: process.env.CODRYN_PACKAGED_EXE ?? 'apps/desktop/out/Codryn-win32-x64/Codryn.exe',
      profileRoot: await createR3Profile('r4-git'), projectRoot: fixture.root
    });
    const page = desktop.window;
    await page.getByRole('button', { name: 'Otevřít projekt', exact: true }).click();
    const newChat = page.getByRole('dialog', { name: 'Nový chat' });
    await newChat.getByRole('textbox', { name: 'Název chatu' }).fill('Git zkouška');
    await newChat.getByRole('button', { name: 'Uložit chat', exact: true }).click();
    await newChat.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Lokální Git', exact: true }).click();
    const panel = page.getByRole('dialog', { name: 'Lokální Git' });
    await panel.getByRole('button', { name: 'Přidat do indexu desktop-proof.txt' }).click();
    await panel.getByRole('button', { name: 'Odebrat z indexu desktop-proof.txt' }).waitFor();
    await panel.getByRole('button', { name: /· desktop-proof\.txt/ }).click();
    await panel.getByText('+Local staged data', { exact: false }).waitFor();
    await panel.getByRole('textbox', { name: 'Zpráva commitu' }).fill('Desktop Git proof');
    await panel.getByRole('button', { name: 'Vytvořit commit' }).click();
    expect(git('log', '-1', '--format=%s')).not.toBe('Desktop Git proof');
    await panel.getByRole('button', { name: 'Potvrdit commit' }).click();
    await expect.poll(() => git('log', '-1', '--format=%s'), { timeout: 15_000 }).toBe('Desktop Git proof');
    expect(git('show', 'HEAD:desktop-proof.txt')).toBe('Local staged data');
  } finally {
    await desktop?.close();
    await fixture.close();
  }
}, 90_000);
