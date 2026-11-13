// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectMap } from '../src/renderer/components/project-map.js';
import { R3Client } from '../src/renderer/r3-client.js';
import { id } from './ui-fixtures.js';

afterEach(cleanup);

it('shows the progress of a deep scan and provides an independent cancel action', async () => {
  const client = new R3Client({ invoke: vi.fn(), onUpdate: () => () => undefined });
  const counts = { entries: 3, scanned: 4, instructions: 0 };
  vi.spyOn(client, 'call').mockImplementation((async (operation: string) => {
    switch (operation) {
      case 'context.map.activate': return { ...counts, mode: 'quick', state: 'ready' };
      case 'context.map.init': return { ...counts, mode: 'deep', state: 'indexing' };
      case 'context.map.cancel': return { ...counts, mode: 'deep', state: 'partial', reason: 'cancelled' };
      default: throw new Error('Unexpected ' + operation);
    }
  }) as typeof client.call);
  render(<ProjectMap client={client} projectId={id(100)} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Prohloubit mapu projektu' }));
  expect(await screen.findByText('Prohlubování mapy')).toBeTruthy();
  fireEvent.click(await screen.findByRole('button', { name: 'Zrušit prohlubování mapy' }));
  expect(await screen.findByText('Prohlubování mapy bylo zrušeno')).toBeTruthy();
});
