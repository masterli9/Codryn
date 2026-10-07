import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { promisify } from 'node:util';
import type { ModelAdapter } from '@codryn/core';
import { createR2Infrastructure, ScriptedModelAdapter } from '@codryn/infrastructure';
import type { PermissionView } from '@codryn/shared';
import { changeVerifyReturnScenario } from '../apps/cli/src/scenarios/change-verify-return.js';

const execFileAsync = promisify(execFile);
const original = 'export function sum(a, b) { return a - b; }\n';
const testContent = "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { sum } from './sum.mjs';\n\ntest('sum adds both operands', () => assert.equal(sum(2, 3), 5));\n";

export interface DemoInteraction {
  write(line: string): void;
  pause(): Promise<void>;
  approve(permission: PermissionView): Promise<'allow_once' | 'deny'>;
}

/** Presentation only: all tools, approvals, verification and return use R2 services. */
export async function runConsultationDemo(io: DemoInteraction, signal = new AbortController().signal) {
  if (process.platform !== 'win32') throw new Error('Ukázka vyžaduje Windows a procesní runner R2.');
  const demoRoot = await mkdtemp(join(tmpdir(), 'codryn-consultation-'));
  const projectRoot = join(demoRoot, 'project');
  const userDataPath = join(demoRoot, 'user-data');
  await mkdir(projectRoot);
  await writeFile(join(projectRoot, 'sum.mjs'), original, 'utf8');
  await writeFile(join(projectRoot, 'sum.test.mjs'), testContent, 'utf8');
  io.write('\nCODRYN — UKÁZKA ČTYŘ ÚKOLŮ\n');
  io.write('Rozhodování modelu je předem připravené. Nástroje pracují skutečně, bez internetu.');
  io.write(`Oddělený ukázkový projekt: ${projectRoot}`);
  io.write('\nVÝCHOZÍ CHYBA: funkce má sčítat, ale odčítá.');
  io.write(original.trimEnd());
  await io.pause();
  let beforeExitCode = 0;
  try {
    await execFileAsync(process.execPath, ['--test', 'sum.test.mjs'], {
      cwd: projectRoot, shell: false, windowsHide: true, timeout: 30_000, maxBuffer: 256 * 1024, signal
    });
  } catch (error) {
    const failure = error as { code?: unknown; stdout?: string; stderr?: string };
    if (failure.code !== 1) throw error;
    beforeExitCode = 1;
    io.write(failure.stdout ?? '');
    io.write(failure.stderr ?? '');
  }
  if (beforeExitCode !== 1) throw new Error('Výchozí test musí selhat, jinak ukázka neprokazuje opravu.');
  io.write('VÝCHOZÍ TEST SELHAL: očekává 5, dostává -1. Tento přípravný test spouští průvodce.');
  await io.pause();
  const scripted = new ScriptedModelAdapter(changeVerifyReturnScenario({
    expectedHash: createHash('sha256').update(original).digest('hex'), projectRoot
  }));
  const model: ModelAdapter = {
    descriptor: scripted.descriptor,
    async *stream(request, abortSignal) {
      const last = request.previousToolResults.at(-1);
      if (last?.ok) {
        io.write('\nSKUTEČNÝ VÝSLEDEK NÁSTROJE:');
        io.write(JSON.stringify(last.output, null, 2));
        // Search results are displayed with a conventional file:line reference.
        if (request.previousToolResults.length === 1) io.write('Výsledek hledání výše obsahuje sum.mjs:1.');
        await io.pause();
      } else if (last && !last.ok) {
        io.write(`Nástroj byl odmítnut: ${last.error.code}`);
        if (last.error.code === 'R1_TOOL_PERMISSION_DENIED') {
          yield { type: 'text_delta', text: 'Příkaz byl zamítnut; oprava není ověřená.' };
          yield { type: 'completed' };
          return;
        }
      }
      for await (const event of scripted.stream(request, abortSignal)) {
        if (event.type === 'tool_call') {
          const label: Record<string, string> = {
            'text.search': '1. VYHLEDÁVÁNÍ TEXTU V PROJEKTU',
            'file.read': '2. ČTENÍ SOUBORU AGENTEM',
            'file.patch': '3. ÚPRAVA SOUBORU AGENTEM',
            'command.run': '4. SCHVÁLENÍ A SPUŠTĚNÍ PŘÍKAZU'
          };
          io.write(`\n${label[event.call.toolId] ?? event.call.toolId}`);
          io.write(`Agent žádá nástroj ${event.call.toolId}:`);
          io.write(JSON.stringify(event.call.arguments, null, 2));
          await io.pause();
        }
        yield event;
      }
    }
  };
  let approval: 'allow_once' | 'deny' | undefined;
  const infrastructure = await createR2Infrastructure({
    projectRoot, userDataPath, model,
    permissionResponder: async (permission) => {
      approval = await io.approve(permission);
      return approval;
    }
  });
  try {
    const result = await infrastructure.agentLoop.executeR2({
      requestId: randomUUID(), projectRoot, task: 'Oprav sum a ověř opravu.', contextReferences: [], maxSteps: 8
    }, signal);
    const events = await infrastructure.eventStore.findBySessionId(result.runId);
    const commandCall = events.find((event) => event.eventType === 'tool_call.received'
      && (event.payload as { toolId?: string }).toolId === 'command.run');
    const commandId = (commandCall?.payload as { callId?: string } | undefined)?.callId;
    const commandStarted = commandId !== undefined && events.some((event) => event.eventType === 'tool_call.started'
      && (event.payload as { callId?: string }).callId === commandId);
    const denied = commandId !== undefined && events.some((event) => event.eventType === 'tool_call.rejected'
      && (event.payload as { callId?: string; permissionResult?: string }).callId === commandId
      && (event.payload as { permissionResult?: string }).permissionResult === 'denied');
    if (approval === 'allow_once' && result.status === 'completed' && result.verification.status === 'verified' && commandStarted) {
      io.write('\nTEST PROŠEL — jádro potvrdilo ověřenou opravu.');
    } else if (approval === 'deny' && denied && !commandStarted && result.verification.status === 'unverified') {
      io.write('\nPŘÍKAZ SE NESPUSTIL — doloženo historií jádra. Soubor je upravený, ale oprava není ověřená.');
    } else {
      throw new Error(`Ukázka nedosáhla očekávaného výsledku: ${JSON.stringify(result)}`);
    }
    if (result.changeSetId === null) throw new Error('Chybí záznam změny.');
    io.write('\nROZDÍL PŘED A PO (diff):');
    for (const file of await infrastructure.changes.diff.execute(result.changeSetId, signal)) {
      io.write(file.path);
      for (const line of file.lines) io.write(`${line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '} ${line.text}`);
    }
    await writeFile(join(demoRoot, 'evidence.json'), JSON.stringify({ result, commandStarted, denied, events }, null, 2), 'utf8');
    await io.pause();
    const reverted = await infrastructure.changes.revert.execute({ setId: result.changeSetId, requestId: randomUUID() }, signal);
    const returnedToBaseline = reverted.status === 'reverted' && await readFile(join(projectRoot, 'sum.mjs'), 'utf8') === original;
    if (!returnedToBaseline) throw new Error('Návrat do výchozího stavu se nepodařil.');
    io.write('\nZMĚNA VRÁCENA: soubor opět odpovídá původnímu obsahu.');
    io.write(`Důkazy před vrácením změny: ${join(demoRoot, 'evidence.json')}`);
    io.write('Po vrácení je v projektu opět původní chyba; ověření opravy výše patří stavu před vrácením.');
    return { demoRoot, projectRoot, beforeExitCode, result, commandStarted, returnedToBaseline };
  } finally {
    infrastructure.close();
  }
}

async function main() {
  if (process.argv.length > 2) throw new Error('Ukázka nepřijímá argumenty. Spusť npm.cmd run demo:consultation.');
  if (!process.stdin.isTTY) throw new Error('Ukázku spusť v interaktivním terminálu.');
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const controller = new AbortController();
  const interrupt = () => { controller.abort(); readline.close(); };
  process.once('SIGINT', interrupt);
  try {
    await runConsultationDemo({
      write: (line) => process.stdout.write(`${line}\n`),
      pause: async () => { await readline.question('\nEnter = další krok… '); },
      approve: async (permission) => {
        process.stdout.write(`\nCodryn čeká na tvoje rozhodnutí.\nPříkaz: ${permission.command.executable} ${permission.command.args.join(' ')}\nPracovní složka: ${permission.command.cwd}\nDůvod: ověření opraveného sčítání.\nDopad: jednou spustí projektový test, timeout ${permission.command.timeoutMs} ms.\n`);
        const answer = await readline.question('Povolit jednou? [a/y = ano, jinak ne]: ');
        return ['a', 'ano', 'y', 'yes'].includes(answer.trim().toLowerCase()) ? 'allow_once' : 'deny';
      }
    }, controller.signal);
  } finally {
    process.off('SIGINT', interrupt);
    readline.close();
  }
}

if (process.argv[1]?.endsWith('/consultation-demo.ts') || process.argv[1]?.endsWith('\\consultation-demo.ts')) {
  main().catch((error: unknown) => {
    process.stderr.write(`Ukázka skončila chybou: ${error instanceof Error ? error.message : 'neznámá chyba'}\n`);
    process.exitCode = 1;
  });
}
