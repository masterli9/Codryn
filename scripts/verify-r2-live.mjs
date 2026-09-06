import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const valueAfter = (flag) => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
const blocked = {
  schemaVersion: 1,
  status: 'blocked',
  reason: 'Live verification is opt-in and requires provider, model, positive cost cap, pricing profile and a session-only key.',
  attempts: []
};
if (!args.includes('--live')) {
  process.stdout.write(`${JSON.stringify(blocked)}\n`);
  process.exit(2);
}
const provider = valueAfter('--provider');
const model = valueAfter('--model');
const maxCost = Number(valueAfter('--max-cost-usd'));
const inputPrice = Number(valueAfter('--input-usd-per-million'));
const outputPrice = Number(valueAfter('--output-usd-per-million'));
const pricingSource = valueAfter('--pricing-source');
const key = process.env.R2_PROVIDER_API_KEY;
if ((provider !== 'openai' && provider !== 'gemini') || model === undefined || model.length === 0
  || !Number.isFinite(maxCost) || maxCost <= 0 || !Number.isFinite(inputPrice) || inputPrice <= 0
  || !Number.isFinite(outputPrice) || outputPrice <= 0 || pricingSource === undefined || !/^https:\/\//.test(pricingSource)
  || typeof key !== 'string' || key.length === 0) {
  process.stdout.write(`${JSON.stringify(blocked)}\n`);
  process.exit(2);
}

const loader = resolve('apps/cli/src/typescript-resolution-loader.mjs');
const runner = resolve('scripts/r2-live-runner.ts');
if (!existsSync(loader) || !existsSync(runner)) {
  process.stdout.write(`${JSON.stringify({ ...blocked, status: 'unverified', reason: 'Live runner is not available.' })}\n`);
  process.exit(3);
}
const childArgs = [
  '--no-warnings', '--experimental-loader', loader, '--experimental-transform-types', runner,
  '--provider', provider, '--model', model, '--max-cost-usd', String(maxCost),
  '--input-usd-per-million', String(inputPrice), '--output-usd-per-million', String(outputPrice),
  '--pricing-source', pricingSource, '--series', 'live'
];
const reasoning = valueAfter('--reasoning-effort');
if (reasoning !== undefined) childArgs.push('--reasoning-effort', reasoning);
const result = spawnSync(process.execPath, childArgs, {
  cwd: process.cwd(),
  shell: false,
  windowsHide: true,
  encoding: 'utf8',
  maxBuffer: 1024 * 1024
});
if (result.error !== undefined) {
  process.stdout.write(`${JSON.stringify({ ...blocked, status: 'unverified', reason: 'Live runner failed to start.' })}\n`);
  process.exit(3);
}
if (result.stdout.length > 0) process.stdout.write(result.stdout);
if (result.stderr.length > 0) process.stderr.write(result.stderr);
process.exitCode = result.status ?? 3;
