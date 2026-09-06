import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  canPublishLiveGate,
  calculateUsageCost,
  reserveRequestCost,
  summarizeTrials,
  type ModelAdapter,
  type ModelRequest,
  type ModelStreamEvent,
  type ProviderPricing,
  type Trial,
  type UsageTotals
} from '@codryn/core';
import type { CommandResult } from '@codryn/core';
import {
  createR2Infrastructure,
  FetchProviderTransport,
  GeminiAdapter,
  OpenAIResponsesAdapter,
  ProviderAdapterError,
  SessionSecret,
  UuidGenerator
} from '@codryn/infrastructure';

const execFileAsync = promisify(execFile);
const maxRequestsPerTrial = 12;
const maxOutputTokens = 4096;
type TrialVariant = 'simple' | 'stale-hash' | 'test-failure';
type TrialMode = 'git' | 'non-git';

interface LiveArguments {
  readonly provider: 'openai' | 'gemini';
  readonly model: string;
  readonly maxCostUsd: number;
  readonly pricing: ProviderPricing;
  readonly pricingSource: string;
  readonly series: 'live' | 'eval';
  readonly reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high';
}

interface TrialReport extends Trial {
  readonly mode: TrialMode;
  readonly variant: TrialVariant;
  readonly fixtureHash: string;
  readonly requestCount: number;
  readonly reservedCostUsd: number;
  readonly usage: UsageTotals | null;
  readonly commandFailures: number;
  readonly failureCode: string | null;
}

class LiveHarnessFailure extends Error {
  constructor(readonly code: 'R2_LIVE_BUDGET_STOP' | 'R2_LIVE_REQUEST_LIMIT' | 'R2_LIVE_PRICING_MISSING') {
    super('Live harness stopped before the next provider request.');
    this.name = 'LiveHarnessFailure';
  }
}

class BudgetLedger {
  private reserved = 0;

  get total(): number { return this.reserved; }

  reserve(inputTokens: number, pricing: ProviderPricing, maxCostUsd: number): number {
    const amount = reserveRequestCost(inputTokens, pricing);
    if (amount === null) throw new LiveHarnessFailure('R2_LIVE_PRICING_MISSING');
    if (this.reserved + amount > maxCostUsd) throw new LiveHarnessFailure('R2_LIVE_BUDGET_STOP');
    this.reserved += amount;
    return amount;
  }
}

class BudgetedModelAdapter implements ModelAdapter {
  readonly descriptor;
  private requestCountValue = 0;
  private validCallsValue = 0;
  private invalidCallsValue = 0;
  private commandUsage: UsageTotals = { inputTokens: 0, outputTokens: 0 };
  private usageRequests = 0;
  private missingUsage = false;
  private readonly reservedValue = { value: 0 };

  constructor(
    private readonly inner: ModelAdapter,
    private readonly ledger: BudgetLedger,
    private readonly pricing: ProviderPricing,
    private readonly maxCostUsd: number
  ) {
    this.descriptor = inner.descriptor;
  }

  get requestCount(): number { return this.requestCountValue; }
  get validCalls(): number { return this.validCallsValue; }
  get invalidCalls(): number { return this.invalidCallsValue; }
  get commandUsageTotals(): UsageTotals | null {
    return this.requestCountValue > 0 && !this.missingUsage ? this.commandUsage : null;
  }
  get reservedCostUsd(): number { return this.reservedValue.value; }

  stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    return this.streamWithBudget(request, signal);
  }

  private async *streamWithBudget(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
      if (this.requestCountValue >= maxRequestsPerTrial) throw new LiveHarnessFailure('R2_LIVE_REQUEST_LIMIT');
      const inputTokens = Math.ceil(Buffer.byteLength(JSON.stringify(request), 'utf8') / 4);
      this.reservedValue.value += this.ledger.reserve(inputTokens, this.pricing, this.maxCostUsd);
      this.requestCountValue += 1;
      let sawUsage = false;
      try {
        for await (const event of this.inner.stream(request, signal)) {
          if (event.type === 'tool_call') this.validCallsValue += 1;
          if (event.type === 'usage') {
            sawUsage = true;
            this.usageRequests += 1;
            this.commandUsage = {
              inputTokens: this.commandUsage.inputTokens + event.inputTokens,
              outputTokens: this.commandUsage.outputTokens + event.outputTokens
            };
          }
          yield event;
        }
      } catch (error) {
        if (error instanceof ProviderAdapterError && error.code === 'invalid_tool_call') this.invalidCallsValue += 1;
        throw error;
      } finally {
        if (!sawUsage) this.missingUsage = true;
      }
  }
}

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
}

function positiveNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseArguments(args: readonly string[]): LiveArguments {
  const provider = valueAfter(args, '--provider');
  const model = valueAfter(args, '--model');
  const maxCostUsd = positiveNumber(valueAfter(args, '--max-cost-usd'));
  const inputUsdPerMillion = positiveNumber(valueAfter(args, '--input-usd-per-million'));
  const outputUsdPerMillion = positiveNumber(valueAfter(args, '--output-usd-per-million'));
  const pricingSource = valueAfter(args, '--pricing-source');
  const reasoning = valueAfter(args, '--reasoning-effort');
  const seriesValue = valueAfter(args, '--series');
  if ((provider !== 'openai' && provider !== 'gemini') || model === undefined || model.length === 0
    || maxCostUsd === null || inputUsdPerMillion === null || outputUsdPerMillion === null
    || pricingSource === undefined || !/^https:\/\//.test(pricingSource)
    || (seriesValue !== 'live' && seriesValue !== 'eval')) {
    throw new Error('R2_LIVE_ARGUMENTS_INVALID');
  }
  if (reasoning !== undefined && !['none', 'minimal', 'low', 'medium', 'high'].includes(reasoning)) throw new Error('R2_LIVE_ARGUMENTS_INVALID');
  return {
    provider,
    model,
    maxCostUsd,
    pricing: { inputUsdPerMillion, outputUsdPerMillion, maxOutputTokens },
    pricingSource,
    series: seriesValue,
    ...(reasoning === undefined ? {} : { reasoningEffort: reasoning as LiveArguments['reasoningEffort'] })
  };
}

async function git(root: string, args: readonly string[]): Promise<void> {
  await execFileAsync('git', [...args], {
    cwd: root,
    shell: false,
    timeout: 10_000,
    maxBuffer: 64 * 1024,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' }
  });
}

function hashBytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

async function createFixture(mode: TrialMode, variant: TrialVariant): Promise<{ root: string; userData: string; fixtureHash: string; sumPath: string; testPath: string }> {
  const root = await mkdtemp(join(tmpdir(), `codryn-r2-live-${mode}-${variant}-`));
  try {
    const userData = join(root, 'user-data');
    const sumPath = join(root, 'sum.mjs');
    const testPath = join(root, 'sum.test.mjs');
    await mkdir(userData);
    await writeFile(join(root, 'README.md'), '# R2 live fixture\n', 'utf8');
    await writeFile(join(root, '.codrynignore'), 'generated/**\n', 'utf8');
    await mkdir(join(root, 'generated'));
    await writeFile(join(root, 'generated', 'ignored-canary.txt'), 'R2_IGNORED_CANARY\n', 'utf8');
    await writeFile(sumPath, 'export function sum(a, b) { return a - b; }\n', 'utf8');
    await writeFile(testPath, "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { sum } from './sum.mjs';\n\ntest('sum adds both operands', () => assert.equal(sum(2, 3), 5));\n", 'utf8');
    if (mode === 'git') {
      await git(root, ['init', '-b', 'main']);
      await git(root, ['config', '--local', 'user.name', 'Codryn R2 Live']);
      await git(root, ['config', '--local', 'user.email', 'r2-live@invalid.local']);
      await git(root, ['add', 'README.md', '.codrynignore', 'sum.mjs', 'sum.test.mjs']);
      await git(root, ['commit', '-m', 'R2 live fixture']);
    }
    const fixtureFiles = ['.codrynignore', 'README.md', 'generated/ignored-canary.txt', 'sum.mjs', 'sum.test.mjs'];
    const fixtureEntries: Buffer[] = [];
    for (const file of fixtureFiles) {
      const bytes = await readFile(join(root, file));
      fixtureEntries.push(Buffer.from(`${file}\0${hashBytes(bytes)}\0${bytes.length}\n`, 'utf8'));
    }
    return { root, userData, sumPath, testPath, fixtureHash: hashBytes(Buffer.concat(fixtureEntries)) };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

function providerErrorCode(error: unknown): string | null {
  if (error instanceof ProviderAdapterError) return error.code;
  if (error instanceof LiveHarnessFailure) return error.code;
  return null;
}

function failureOwner(error: unknown, result: { status?: string; verification?: { status?: string } } | undefined): Trial['failureOwner'] {
  if (error instanceof ProviderAdapterError) return error.code === 'invalid_tool_call' ? 'adapter' : 'api';
  if (error instanceof LiveHarnessFailure) return 'harness';
  if (result?.verification?.status === 'unverified' || result?.verification?.status === 'stale') return 'harness';
  return 'model';
}

function taskFor(variant: TrialVariant): string {
  if (variant === 'stale-hash') return 'Oprav pouze implementaci funkce sum v sum.mjs tak, aby vracela a + b. Nejprve pouzij text.search a file.read, potom file.patch s aktualnim hashem. Pokud patch selze kvuli zastaralemu hashi, znovu nacti soubor a neopakuj stary patch. Spust presne node test sum.test.mjs. Nakonec vrat kratke shrnuti.';
  if (variant === 'test-failure') return 'Oprav pouze implementaci funkce sum v sum.mjs tak, aby vracela a + b. Pouzij text.search a file.read, potom file.patch s aktualnim hashem. Spust presne node test sum.test.mjs; pokud test selze, precti strukturovany vysledek, znovu nacti aktualni sum.mjs a proved dalsi cilenou opravu. Upravuj pouze sum.mjs, ne test. Nakonec vrat kratke shrnuti.';
  return 'Oprav pouze implementaci funkce sum v sum.mjs tak, aby vracela a + b. Pouzij text.search a file.read, potom file.patch s aktualnim hashem. Spust presne node test sum.test.mjs. Nakonec vrat kratke shrnuti.';
}

async function runTrial(input: LiveArguments, mode: TrialMode, variant: TrialVariant, ledger: BudgetLedger, apiKey: string): Promise<TrialReport> {
  const startedAt = Date.now();
  const fixture = await createFixture(mode, variant);
  let beforeAgentPatch = await readFile(fixture.sumPath);
  const testBefore = await readFile(fixture.testPath);
  let staleInjected = false;
  let failureInjected = false;
  let commandFailures = 0;
  const secret = new SessionSecret(() => apiKey);
  const ids = new UuidGenerator();
  const inner = input.provider === 'openai'
    ? new OpenAIResponsesAdapter({ modelId: input.model, key: () => secret.get(), transport: new FetchProviderTransport(), ids, ...(input.reasoningEffort === undefined ? {} : { reasoningEffort: input.reasoningEffort }) })
    : new GeminiAdapter({ modelId: input.model, key: () => secret.get(), transport: new FetchProviderTransport(), ids });
  const model = new BudgetedModelAdapter(inner, ledger, input.pricing, input.maxCostUsd);
  let infrastructure: Awaited<ReturnType<typeof createR2Infrastructure>> | undefined;
  let result: { status: string; verification: { status: string }; changeSetId: string | null } | undefined;
  let failure: unknown;
  let revertStatus: string | null = null;
  try {
    infrastructure = await createR2Infrastructure({
      projectRoot: fixture.root,
      userDataPath: fixture.userData,
      model,
      permissionResponder: async () => 'allow_once',
      onRead: async (path) => {
        if (variant === 'stale-hash' && path === 'sum.mjs' && !staleInjected) {
          staleInjected = true;
          await writeFile(fixture.sumPath, `// external edit\n${await readFile(fixture.sumPath, 'utf8')}`, 'utf8');
          beforeAgentPatch = await readFile(fixture.sumPath);
        }
      },
      onPatch: async (path) => {
        if (variant === 'test-failure' && path === 'sum.mjs' && !failureInjected) {
          failureInjected = true;
          await writeFile(fixture.sumPath, 'export function sum(a, b) { return a + b + 1; }\n', 'utf8');
        }
      },
      onCommandResult: async (command: CommandResult) => {
        if (command.status !== 'succeeded' || command.exitCode !== 0) commandFailures += 1;
      }
    });
    result = await infrastructure.agentLoop.executeR2({
      requestId: randomUUID(),
      projectRoot: fixture.root,
      task: taskFor(variant),
      contextReferences: [],
      maxSteps: maxRequestsPerTrial
    }, new AbortController().signal);
    if (result.changeSetId !== null) {
      const diff = await infrastructure.changes.diff.execute(result.changeSetId, new AbortController().signal);
      const reverted = await infrastructure.changes.revert.execute({ setId: result.changeSetId, requestId: randomUUID() }, new AbortController().signal);
      revertStatus = reverted.status;
      const restored = await readFile(fixture.sumPath);
      const testAfter = await readFile(fixture.testPath);
      const successful = result.status === 'completed'
        && result.verification.status === 'verified'
        && diff.some((entry) => entry.status === 'changed')
        && reverted.status === 'reverted'
        && Buffer.compare(beforeAgentPatch, restored) === 0
        && Buffer.compare(testBefore, testAfter) === 0;
      const usage = model.commandUsageTotals;
      return {
        id: randomUUID(), provider: input.provider, model: input.model, successful,
        failureOwner: successful ? null : failureOwner(undefined, result),
        validCalls: model.validCalls, invalidCalls: model.invalidCalls,
        repairedAfterError: commandFailures > 0, durationMs: Date.now() - startedAt,
        costUsd: calculateUsageCost(usage, input.pricing), mode, variant,
        fixtureHash: fixture.fixtureHash, requestCount: model.requestCount,
        reservedCostUsd: model.reservedCostUsd, usage, commandFailures,
        failureCode: successful ? null : `result_${result.verification.status}_${revertStatus ?? 'no_revert'}`
      };
    }
  } catch (error) {
    failure = error;
  } finally {
    infrastructure?.close();
    secret.clear();
    await rm(fixture.root, { recursive: true, force: true });
  }
  const usage = model.commandUsageTotals;
  return {
    id: randomUUID(), provider: input.provider, model: input.model, successful: false,
    failureOwner: failureOwner(failure, result), validCalls: model.validCalls, invalidCalls: model.invalidCalls,
    repairedAfterError: commandFailures > 0, durationMs: Date.now() - startedAt,
    costUsd: calculateUsageCost(usage, input.pricing), mode, variant,
    fixtureHash: fixture.fixtureHash, requestCount: model.requestCount,
    reservedCostUsd: model.reservedCostUsd, usage, commandFailures,
    failureCode: providerErrorCode(failure)
  };
}

async function main(): Promise<void> {
  const input = parseArguments(process.argv.slice(2));
  const apiKey = process.env.R2_PROVIDER_API_KEY;
  if (process.platform !== 'win32' || typeof apiKey !== 'string' || apiKey.length === 0) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, status: 'unverified', reason: process.platform !== 'win32' ? 'R2 live process harness requires Windows.' : 'Session provider key is unavailable.', attempts: [] })}\n`);
    process.exitCode = 3;
    return;
  }
  const protocolId = randomUUID();
  const ledger = new BudgetLedger();
  const plan: readonly { mode: TrialMode; variant: TrialVariant }[] = input.series === 'eval'
    ? [
        { mode: 'git', variant: 'simple' }, { mode: 'non-git', variant: 'simple' },
        { mode: 'git', variant: 'stale-hash' }, { mode: 'non-git', variant: 'stale-hash' },
        { mode: 'git', variant: 'test-failure' }, { mode: 'non-git', variant: 'test-failure' }
      ]
    : [
        { mode: 'git', variant: 'simple' }, { mode: 'git', variant: 'stale-hash' }, { mode: 'git', variant: 'test-failure' },
        { mode: 'non-git', variant: 'simple' }, { mode: 'non-git', variant: 'stale-hash' }
      ];
  const trials: TrialReport[] = [];
  for (const item of plan) trials.push(await runTrial(input, item.mode, item.variant, ledger, apiKey));
  const summary = summarizeTrials(trials);
  const modeCounts = trials.reduce((counts, trial) => ({ ...counts, [trial.mode]: (counts[trial.mode] ?? 0) + 1 }), { git: 0, 'non-git': 0 });
  const livePlanComplete = trials.length === 5 && modeCounts.git === 3 && modeCounts['non-git'] === 2;
  const livePassed = input.series === 'live' && livePlanComplete && canPublishLiveGate(summary, input.maxCostUsd);
  const status = input.series === 'live' ? (livePassed ? 'passed' : 'unverified') : 'complete';
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1, protocolId, generatedAt: new Date().toISOString(), status, series: input.series,
    provider: input.provider, model: input.model,
    settings: { maxRequestsPerTrial, maxOutputTokens, maxCostUsd: input.maxCostUsd, ...(input.reasoningEffort === undefined ? {} : { reasoningEffort: input.reasoningEffort }) },
    pricing: { ...input.pricing, source: input.pricingSource },
    trials, summary,
    liveGate: input.series === 'live'
      ? { status, requiredAttempts: 5, requiredSuccesses: 4, requiredModes: { git: 3, nonGit: 2 }, planComplete: livePlanComplete, reservedCostUsd: ledger.total }
      : { status: 'not_applicable', requiredAttempts: 5, requiredSuccesses: 4, requiredModes: { git: 3, nonGit: 2 }, reservedCostUsd: ledger.total }
  })}\n`);
  process.exitCode = input.series === 'eval' || status === 'passed' ? 0 : 3;
}

await main();
