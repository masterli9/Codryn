import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readProviderKey, providerChildEnvironment } from './r2-provider-key.mjs';

const args = process.argv.slice(2);
const value = flag => {const index=args.indexOf(flag);return index<0?undefined:args[index+1];};
const offline = args.includes('--offline');
const live = args.includes('--live');
const positive = flag => Number.isFinite(Number(value(flag))) && Number(value(flag)) > 0;
const authorized = live && !offline && args.includes('--confirm-paid-api') && readProviderKey('openai')
  && value('--consent-version') === 'openai-api-2026-11-14'
  && positive('--max-cost-usd') && positive('--max-requests') && Number(value('--max-requests')) <= 100
  && Number.isInteger(Number(value('--max-requests')))
  && positive('--input-usd-per-million') && positive('--output-usd-per-million')
  && /^https:\/\//u.test(value('--pricing-source') ?? '');
if ((!offline && !authorized) || (offline && live)) {
  process.stdout.write(JSON.stringify({ status: 'not_run', reason: 'Choose --offline, or provide an approved live budget, request cap, pricing, current consent and --confirm-paid-api.' }) + '\n');
  process.exitCode = 2;
} else {
  const child = spawnSync(process.execPath, [
    '--no-warnings', '--experimental-loader', pathToFileURL(resolve('apps/cli/src/typescript-resolution-loader.mjs')).href,
    '--experimental-transform-types', 'scripts/r4-model-eval-runner.ts', ...args
  ], { cwd: resolve('.'), windowsHide: true, shell: false, encoding: 'utf8',
    timeout: 15 * 60_000, maxBuffer: 256 * 1024, env: providerChildEnvironment('openai') });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.error || child.status !== 0) {
    process.stderr.write('R4 evaluation did not finish successfully. Inspect the safe report.\n');
    process.exitCode = child.status ?? 3;
  }
}
