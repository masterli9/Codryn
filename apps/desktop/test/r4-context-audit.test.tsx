// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RunDetail } from '../src/renderer/components/run-detail.js';
import { R3Client } from '../src/renderer/r3-client.js';
import { snapshot } from './ui-fixtures.js';

afterEach(cleanup);

it('shows context source counts and omission reasons in the normal run detail', () => {
  const client = new R3Client({ invoke: vi.fn(), onUpdate: () => () => undefined });
  render(<RunDetail client={client} detail={null} busy={false} refresh={async () => {}} close={() => {}}
    snapshot={{ ...snapshot(), contextAudit: { totalBytes: 16, sources: [
      { source: 'user_text', used: 1, omitted: 0, truncated: 0, reasons: [] },
      { source: 'chat_history', used: 0, omitted: 1, truncated: 0, reasons: ['stale'] },
      { source: 'project_reference', used: 1, omitted: 0, truncated: 0, reasons: [] },
      { source: 'loaded_excerpt', used: 1, omitted: 0, truncated: 1, reasons: ['excerpt_limit'] },
      { source: 'repo_map', used: 0, omitted: 1, truncated: 0, reasons: ['partial'] }
    ] } }} />);

  const audit = within(screen.getByRole('region', { name: 'Kontext běhu' }));
  expect(audit.getByText('16 B použitého obsahu')).toBeTruthy();
  expect(audit.getByText('Reference @')).toBeTruthy();
  expect(audit.getByText('Výřez souboru')).toBeTruthy();
  expect(audit.getByText('Podklad je zastaralý.')).toBeTruthy();
  expect(audit.getByText('Mapa projektu je neúplná.')).toBeTruthy();
});
