// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Composer } from '../src/renderer/components/composer.js';

afterEach(cleanup);
const revision = { contentHash: 'a'.repeat(64), policyRevision: 'b'.repeat(64) };
const file = { ...revision, path: 'src/App.tsx', kind: 'file' as const };
const directory = { ...revision, path: 'src', kind: 'directory' as const };
const page = { items: [file, directory], nextOffset: null, limited: false };

function enterReference(text: string) {
  const input = screen.getByRole('textbox', { name: 'Zadání úkolu' });
  fireEvent.change(input, { target: { value: text, selectionStart: text.length, selectionEnd: text.length } });
  return input;
}

it('selects with the keyboard, removes a chip, and sends structured references', async () => {
  const send = vi.fn().mockResolvedValue(undefined);
  const searchReferences = vi.fn().mockResolvedValue(page);
  render(<Composer chatId="a" busy={false} archived={false} send={send} searchReferences={searchReferences} />);
  const input = enterReference('Zkontroluj @');
  await screen.findByRole('option', { name: /App.tsx/ });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.getByRole('button', { name: 'Odebrat referenci src' })).toBeTruthy();
  enterReference('Zkontroluj @App');
  await screen.findByRole('option', { name: /App.tsx/ });
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: 'Odebrat referenci src' }));
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(send).toHaveBeenCalledWith('Zkontroluj', expect.any(String), undefined, [file]));
});

it('dismisses the picker with Escape and ignores delayed results from the previous chat', async () => {
  let resolve: (value: typeof page) => void = () => undefined;
  const searchReferences = vi.fn().mockImplementationOnce(() => new Promise<typeof page>(done => { resolve = done; })).mockResolvedValue(page);
  const props = { busy: false, archived: false, send: vi.fn(), searchReferences };
  const view = render(<Composer chatId="a" {...props} />);
  enterReference('@App');
  await waitFor(() => expect(searchReferences).toHaveBeenCalled());
  view.rerender(<Composer chatId="b" {...props} />);
  await act(async () => resolve(page));
  expect(screen.queryByRole('listbox', { name: 'Soubory a složky projektu' })).toBeNull();
  const input = enterReference('@src');
  await screen.findByRole('option', { name: /App.tsx/ });
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).toBeNull();
});

it('restores reference chips for an editable retry and reuses the same request after a lost answer', async () => {
  const send = vi.fn().mockRejectedValueOnce(new Error('Ztracená odpověď')).mockResolvedValue(undefined);
  const retryDraft = { id: 'first', chatId: 'a', text: 'Zkontroluj', retryOfRequestId: 'previous', references: [directory] };
  const props = { busy: false, archived: false, send, retryDraft };
  const view = render(<Composer chatId="a" {...props} />);
  expect(screen.getByRole('button', { name: 'Odebrat referenci src' })).toBeTruthy();
  view.rerender(<Composer chatId="b" {...props} />);
  expect(screen.queryByRole('button', { name: 'Odebrat referenci src' })).toBeNull();
  view.rerender(<Composer chatId="a" {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Odeslat úkol' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Odeslat úkol' }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  expect(send.mock.calls[0]).toEqual(['Zkontroluj', expect.any(String), 'previous', [directory]]);
  expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
});

it('requires a separate sensitive-file confirmation and binds it to the request that is sent', async () => {
  const sensitive = { ...file, path: '.env.local' };
  const permitReference = vi.fn().mockResolvedValue(sensitive);
  const send = vi.fn().mockResolvedValue(undefined);
  const searchReferences = vi.fn().mockResolvedValue({ items: [], nextOffset: null, limited: false });
  render(<Composer chatId="a" busy={false} archived={false} send={send} searchReferences={searchReferences} permitReference={permitReference} />);
  enterReference('Zkontroluj @.env.local');
  fireEvent.click(await screen.findByRole('button', { name: 'Povolit citlivý soubor' }));
  expect(screen.getByText(/může obsahovat klíče/)).toBeTruthy();
  expect(permitReference).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Povolit pro toto odeslání' }));
  await screen.findByRole('button', { name: 'Odebrat referenci .env.local' });
  fireEvent.click(screen.getByRole('button', { name: 'Odeslat úkol' }));
  const granted = permitReference.mock.calls[0];
  expect(granted).toEqual(['a', expect.any(String), { path: '.env.local', kind: 'sensitive' }]);
  expect(send).toHaveBeenCalledWith('Zkontroluj', granted?.[1], undefined, [sensitive]);
});
