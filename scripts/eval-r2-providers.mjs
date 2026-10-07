import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import {
  providerChildEnvironment,
  providerKeyEnvironmentName,
} from './r2-provider-key.mjs';
import {
  calculateTrialCostUsd,
  readProviderPricing,
  selectProvider,
} from './r2-provider-eval-selection.mjs';

const candidates = [
  { provider: 'openai', model: 'gpt-5.6-luna', reasoningEffort: 'none' },
  { provider: 'gemini', model: 'gemini-3.6-flash', thinkingLevel: 'minimal' }
];
const args = process.argv.slice(2);
const valueAfter = (flag) => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
const outputPath = valueAfter('--output');
const offlineReport = {
  schemaVersion: 2,
  protocolId: randomUUID(),
  generatedAt: new Date().toISOString(),
  mode: 'offline-contract-only',
  candidates: candidates.map((candidate) => ({ ...candidate, trials: [], status: 'not_run' })),
  selection: { status: 'pending', reason: 'No live trial data exists; offline contracts cannot select a provider.' },
  liveGate: { status: 'unverified', reason: 'An explicit live run, pricing profile and local provider keys are required.' }
};

async function emit(report) {
  if (typeof outputPath === 'string' && outputPath.length > 0) {
    await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (!args.includes('--live')) {
  await emit(offlineReport);
  process.exit(0);
}

const maxCost = Number(valueAfter('--max-cost-usd'));
const pricingByProvider = Object.fromEntries(candidates.map((candidate) => [
  candidate.provider,
  readProviderPricing(candidate.provider, args),
]));
const missingPricingProviders = candidates
  .filter((candidate) => pricingByProvider[candidate.provider] === undefined)
  .map((candidate) => candidate.provider);
const missingProviderKeys = candidates
  .filter((candidate) => {
    const key = process.env[providerKeyEnvironmentName(candidate.provider)];
    return typeof key !== 'string' || key.length === 0;
  })
  .map((candidate) => candidate.provider);
if (!Number.isFinite(maxCost) || maxCost <= 0 || missingPricingProviders.length > 0 || missingProviderKeys.length > 0) {
  const keyReason = missingProviderKeys.length > 0
    ? ` Missing provider-specific key(s): ${missingProviderKeys.join(', ')}.`
    : '';
  const pricingReason = missingPricingProviders.length > 0
    ? ` Missing valid provider-specific pricing profile(s): ${missingPricingProviders.join(', ')}.`
    : '';
  await emit({ ...offlineReport, mode: 'live-eval', liveGate: { status: 'blocked', reason: `Live eval needs a positive cost cap, provider-specific pricing profiles and local provider keys.${pricingReason}${keyReason}` } });
  process.exit(2);
}

const loaderPath = resolve('apps/cli/src/typescript-resolution-loader.mjs');
const runnerPath = resolve('scripts/r2-live-runner.ts');
if (!existsSync(loaderPath) || !existsSync(runnerPath)) {
  await emit({ ...offlineReport, mode: 'live-eval', liveGate: { status: 'unverified', reason: 'Live runner is not available.' } });
  process.exit(3);
}
const loader = pathToFileURL(loaderPath).href;
const runner = 'scripts/r2-live-runner.ts';

function runCandidate(candidate) {
  const pricing = pricingByProvider[candidate.provider];
  const childArgs = [
    '--no-warnings', '--experimental-loader', loader, '--experimental-transform-types', runner,
    '--provider', candidate.provider, '--model', candidate.model, '--series', 'eval',
    '--max-cost-usd', String(maxCost / candidates.length),
    '--input-usd-per-million', String(pricing.inputUsdPerMillion),
    '--output-usd-per-million', String(pricing.outputUsdPerMillion),
    '--pricing-source', pricing.source
  ];
  const reasoning = valueAfter('--reasoning-effort') ?? candidate.reasoningEffort;
  if (reasoning !== undefined) childArgs.push('--reasoning-effort', reasoning);
  if (candidate.thinkingLevel !== undefined) childArgs.push('--thinking-level', candidate.thinkingLevel);
  if (candidate.thinkingBudget !== undefined) childArgs.push('--thinking-budget', String(candidate.thinkingBudget));
  const result = spawnSync(process.execPath, childArgs, {
    cwd: process.cwd(), shell: false, windowsHide: true, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024,
    env: providerChildEnvironment(candidate.provider)
  });
  if (result.error !== undefined || result.status === null) return { ...candidate, trials: [], status: 'unverified', reason: 'Live candidate runner failed to start.' };
  const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (line === undefined) return { ...candidate, trials: [], status: 'unverified', reason: 'Live candidate runner produced no report.' };
  try {
    const report = JSON.parse(line);
    return {
      ...candidate,
      pricing,
      trials: Array.isArray(report.trials)
        ? report.trials.map((trial) => ({
          ...trial,
          costUsd: calculateTrialCostUsd(trial.usage, pricing),
        }))
        : [],
      summary: report.summary,
      settings: report.settings,
      status: report.status === 'complete' ? 'complete' : 'unverified'
    };
  } catch {
    return { ...candidate, trials: [], status: 'unverified', reason: 'Live candidate report was invalid.' };
  }
}

const evaluated = candidates.map(runCandidate);
const selection = selectProvider(evaluated);
const report = {
  schemaVersion: 2,
  protocolId: randomUUID(),
  generatedAt: new Date().toISOString(),
  mode: 'live-eval',
  pricingByProvider,
  candidates: evaluated,
  selection,
  liveGate: { status: 'not_applicable', reason: 'Candidate evaluation uses six trials per candidate; selected-model acceptance uses verify:r2:live with five trials.' }
};
await emit(report);
process.exitCode = selection.status === 'selected' ? 0 : 3;
