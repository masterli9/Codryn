import type { R0CheckResult } from '@codryn/shared';
import styles from './styles.css';

const style = document.createElement('style');
style.textContent = styles;
document.head.append(style);

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Chybí prvek diagnostického rozhraní: ${id}`);
  }
  return element as T;
}

const runButton = requireElement<HTMLButtonElement>('run-diagnostics');
const overallStatus = requireElement<HTMLParagraphElement>('overall-status');
const results = requireElement<HTMLTableSectionElement>('results');

const statusLabels: Record<R0CheckResult['status'], string> = {
  pass: 'PROŠLO',
  fail: 'SELHALO',
  skipped: 'PŘESKOČENO'
};

function appendCell(row: HTMLTableRowElement, text: string): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.textContent = text;
  row.append(cell);
  return cell;
}

function renderCheck(check: R0CheckResult): void {
  const row = document.createElement('tr');
  row.dataset.status = check.status;
  appendCell(row, check.checkId);
  const statusCell = appendCell(row, statusLabels[check.status]);
  statusCell.className = `status status--${check.status}`;
  appendCell(row, check.code);
  appendCell(row, check.message);
  appendCell(row, `${check.durationMs} ms`);
  results.append(row);
}

runButton.addEventListener('click', () => {
  void (async () => {
    runButton.disabled = true;
    overallStatus.textContent = 'Kontrola probíhá…';
    results.replaceChildren();

    try {
      const response = await window.codryn.runR0Diagnostics({
        requestId: crypto.randomUUID(),
        requestedAt: new Date().toISOString()
      });

      if (!response.ok) {
        overallStatus.textContent = `${response.error.code}: ${response.error.message}`;
        return;
      }

      for (const check of response.report.checks) {
        renderCheck(check);
      }
      overallStatus.textContent = response.report.overallStatus === 'passed'
        ? 'R0 prošlo: všechny kontroly jsou v pořádku.'
        : 'R0 selhalo: podrobnosti jsou v tabulce.';
    } catch {
      overallStatus.textContent = 'R0_INTERNAL_ERROR: Diagnostiku R0 se nepodařilo dokončit.';
    } finally {
      runButton.disabled = false;
    }
  })();
});
