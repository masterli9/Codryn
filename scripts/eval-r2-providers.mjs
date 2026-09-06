import { writeFile } from 'node:fs/promises';

const output = process.argv.includes('--output') ? process.argv[process.argv.indexOf('--output') + 1] : null;
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: 'offline-contract-only',
  candidates: [
    { provider: 'openai', model: 'unselected', trials: [], status: 'not_run' },
    { provider: 'gemini', model: 'unselected', trials: [], status: 'not_run' }
  ],
  liveGate: { status: 'unverified', reason: 'An explicit live run and cost profile are required.' }
};
if (output !== null && typeof output === 'string' && output.length > 0) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report)}\n`);
