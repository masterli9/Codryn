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

const candidates = [
  { provider: 'openai', model: 'gpt-5.6-luna', reasoningEffort: 'none' },
  { provider: 'gemini', model: 'gemini-3.6-flash', thinkingLevel: 'minimal' }
];
const args = process.argv.slice(2);
const valueAfter = (flag) => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
const outputPath = valueAfter('--output');
const offlineReport = {
  schemaVersion: 1,
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
const inputPrice = Number(valueAfter('--input-usd-per-million'));
const outputPrice = Number(valueAfter('--output-usd-per-million'));
const pricingSource = valueAfter('--pricing-source');
const missingProviderKeys = candidates
  .filter((candidate) => {
    const key = process.env[providerKeyEnvironmentName(candidate.provider)];
    return typeof key !== 'string' || key.length === 0;
  })
  .map((candidate) => candidate.provider);
if (!Number.isFinite(maxCost) || maxCost <= 0 || !Number.isFinite(inputPrice) || inputPrice <= 0
  || !Number.isFinite(outputPrice) || outputPrice <= 0 || typeof pricingSource !== 'string' || !/^https:\/\//.test(pricingSource)
  || missingProviderKeys.length > 0) {
  const keyReason = missingProviderKeys.length > 0
    ? ` Missing provider-specific key(s): ${missingProviderKeys.join(', ')}.`
    : '';
  await emit({ ...offlineReport, mode: 'live-eval', liveGate: { status: 'blocked', reason: `Live eval needs a positive cost cap, pricing profile, source URL and local provider keys.${keyReason}` } });
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
  const childArgs = [
    '--no-warnings', '--experimental-loader', loader, '--experimental-transform-types', runner,
    '--provider', candidate.provider, '--model', candidate.model, '--series', 'eval',
    '--max-cost-usd', String(maxCost / candidates.length),
    '--input-usd-per-million', String(inputPrice), '--output-usd-per-million', String(outputPrice),
    '--pricing-source', pricingSource
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
      trials: Array.isArray(report.trials) ? report.trials : [],
      summary: report.summary,
      pricing: report.pricing,
      settings: report.settings,
      status: report.status === 'complete' ? 'complete' : 'unverified'
    };
  } catch {
    return { ...candidate, trials: [], status: 'unverified', reason: 'Live candidate report was invalid.' };
  }
}

const evaluated = candidates.map(runCandidate);
const complete = evaluated.every((candidate) => candidate.status === 'complete' && candidate.trials.length === 6);
const compare = (left, right) => {
  const leftSuccesses = left.trials.filter((trial) => trial.successful).length;
  const rightSuccesses = right.trials.filter((trial) => trial.successful).length;
  if (leftSuccesses !== rightSuccesses) return rightSuccesses - leftSuccesses;
  const leftRepairs = left.trials.filter((trial) => trial.repairedAfterError).length;
  const rightRepairs = right.trials.filter((trial) => trial.repairedAfterError).length;
  if (leftRepairs !== rightRepairs) return rightRepairs - leftRepairs;
  const leftCost = left.trials.reduce((total, trial) => total + (typeof trial.costUsd === 'number' ? trial.costUsd : Number.POSITIVE_INFINITY), 0);
  const rightCost = right.trials.reduce((total, trial) => total + (typeof trial.costUsd === 'number' ? trial.costUsd : Number.POSITIVE_INFINITY), 0);
  if (leftCost !== rightCost) return leftCost - rightCost;
  const leftLatency = left.trials.reduce((total, trial) => total + (typeof trial.durationMs === 'number' ? trial.durationMs : Number.POSITIVE_INFINITY), 0);
  const rightLatency = right.trials.reduce((total, trial) => total + (typeof trial.durationMs === 'number' ? trial.durationMs : Number.POSITIVE_INFINITY), 0);
  return leftLatency - rightLatency;
};
const winner = complete ? [...evaluated].sort(compare)[0] : undefined;
const report = {
  schemaVersion: 1,
  protocolId: randomUUID(),
  generatedAt: new Date().toISOString(),
  mode: 'live-eval',
  pricing: { inputUsdPerMillion: inputPrice, outputUsdPerMillion: outputPrice, source: pricingSource },
  candidates: evaluated,
  selection: winner === undefined
    ? { status: 'pending', reason: 'The complete six-trial sample for every candidate is unavailable.' }
    : { status: 'selected', provider: winner.provider, model: winner.model, rationale: 'Complete equal-size sample ranked by successful completion, recovery after failure, cost and latency.' },
  liveGate: { status: 'not_applicable', reason: 'Candidate evaluation uses six trials per candidate; selected-model acceptance uses verify:r2:live with five trials.' }
};
await emit(report);
process.exitCode = complete ? 0 : 3;
