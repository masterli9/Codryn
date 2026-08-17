import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { LogEntry } from '@codryn/core';
import { JsonlDiagnosticLogger, redactLogValue } from '../src/index.js';

const temporaryDirectories: string[] = [];
const redactionPolicy = { sensitiveRoots: [] as readonly string[] };

async function createLogDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'codryn-r0-logger-'));
  temporaryDirectories.push(directory);
  return directory;
}

function entry(data: LogEntry['data'], event = 'logger.test'): LogEntry {
  return {
    level: 'info',
    event,
    occurredAt: '2026-08-17T08:00:00.000Z',
    correlationId: '00000000-0000-4000-8000-000000000001',
    data
  };
}

async function readLogFiles(directory: string): Promise<string[]> {
  const names = (await readdir(directory)).filter((name) => name.startsWith('codryn.log.jsonl'));
  return Promise.all(names.map((name) => readFile(join(directory, name), 'utf8')));
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('redactLogValue', () => {
  it('redacts secret-bearing keys recursively', () => {
    expect(redactLogValue({
      token: 'token-value',
      nested: {
        password: 'password-value',
        items: [{ authorization: 'authorization-value' }, { credential: 'credential-value' }]
      },
      apiKey: 'api-key-value',
      unchanged: ['scalar', 2, true, null]
    }, redactionPolicy)).toEqual({
      token: '<redacted>',
      nested: {
        password: '<redacted>',
        items: [{ authorization: '<redacted>' }, { credential: '<redacted>' }]
      },
      apiKey: '<redacted>',
      unchanged: ['scalar', 2, true, null]
    });
  });

  it('replaces configured absolute roots inside string values', () => {
    const root = 'C:\\Users\\andre\\AppData\\Local\\Codryn';
    expect(redactLogValue({ location: `before ${root}\\workspace after`, nested: [root] }, {
      sensitiveRoots: [root]
    })).toEqual({
      location: 'before <redacted-path>\\workspace after',
      nested: ['<redacted-path>']
    });
  });
});

describe('JsonlDiagnosticLogger', () => {
  it('rejects a positive maxBytes below the minimum bounded fallback line', async () => {
    const directory = await createLogDirectory();

    expect(() => new JsonlDiagnosticLogger({ directory, maxBytes: 1, redactionPolicy })).toThrowError(
      /maxBytes.*minimum/i
    );
  });

  it('writes exactly one valid JSON object per line', async () => {
    const directory = await createLogDirectory();
    const logger = new JsonlDiagnosticLogger({ directory, maxBytes: 256, redactionPolicy });

    await logger.write(entry({ message: 'one' }));

    const files = await readLogFiles(directory);
    expect(files).toHaveLength(1);
    const lines = files[0]?.trimEnd().split('\n') ?? [];
    expect(lines).toHaveLength(1);
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      expect.objectContaining({ data: { message: 'one' } })
    ]);
  });

  it('serializes concurrent writes without interleaving bytes', async () => {
    const directory = await createLogDirectory();
    const logger = new JsonlDiagnosticLogger({ directory, maxBytes: 4096, redactionPolicy });

    await Promise.all(Array.from({ length: 40 }, (_, index) => logger.write(entry({ index }))));

    const files = await readLogFiles(directory);
    const lines = files.flatMap((file) => file.trimEnd().split('\n'));
    expect(lines).toHaveLength(40);
    expect(lines.map((line) => JSON.parse(line).data.index).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 40 }, (_, index) => index)
    );
  });

  it('keeps multibyte oversized-line truncation valid and bounded', async () => {
    const directory = await createLogDirectory();
    const maxBytes = 96;
    const logger = new JsonlDiagnosticLogger({ directory, maxBytes, redactionPolicy });

    await logger.write(entry({ payload: 'x'.repeat(256) }, 'žluťoučký kůň '.repeat(20)));

    const [file] = await readLogFiles(directory);
    expect(file).toBeDefined();
    expect(Buffer.byteLength(file ?? '', 'utf8')).toBeLessThanOrEqual(maxBytes);
    expect(JSON.parse(file?.trim() ?? '')).toEqual({
      level: 'error',
      event: expect.any(String),
      data: { truncated: true }
    });
  });

  it('recovers the writer chain after one write rejects', async () => {
    const directory = await createLogDirectory();
    const blockedDirectory = join(directory, 'blocked-logger-directory');
    await writeFile(blockedDirectory, 'not a directory');
    const logger = new JsonlDiagnosticLogger({ directory: blockedDirectory, redactionPolicy });

    await expect(logger.write(entry({ first: true }))).rejects.toThrow();
    await rm(blockedDirectory);
    await expect(logger.write(entry({ recovered: true }))).resolves.toBeUndefined();

    const content = await readFile(join(blockedDirectory, 'codryn.log.jsonl'), 'utf8');
    expect(JSON.parse(content.trim()).data).toEqual({ recovered: true });
  });

  it('rotates current log to .1 before exceeding the configured limit', async () => {
    const directory = await createLogDirectory();
    const root = join(directory, 'private-root');
    const logger = new JsonlDiagnosticLogger({ directory, maxBytes: 256, redactionPolicy: { sensitiveRoots: [root] } });
    const sensitiveValues = {
      token: 'token-secret',
      password: 'password-secret',
      authorization: 'authorization-secret',
      credential: 'credential-secret',
      apiKey: 'api-key-secret',
      bearer: 'Bearer bearer-secret',
      path: root
    };

    await logger.write(entry({ first: 'a'.repeat(60) }));
    await logger.write(entry({ second: 'b'.repeat(60) }, 'second-event'));
    await logger.write(entry(sensitiveValues, 'sensitive-event'));

    const names = (await readdir(directory)).filter((name) => name.startsWith('codryn.log.jsonl')).sort();
    expect(names).toEqual(['codryn.log.jsonl', 'codryn.log.jsonl.1']);
    const files = await readLogFiles(directory);
    for (const file of files) {
      expect(Buffer.byteLength(file, 'utf8')).toBeLessThanOrEqual(256);
      for (const line of file.trimEnd().split('\n')) expect(() => JSON.parse(line)).not.toThrow();
      expect(file).not.toContain('token-secret');
      expect(file).not.toContain('password-secret');
      expect(file).not.toContain('authorization-secret');
      expect(file).not.toContain('credential-secret');
      expect(file).not.toContain('api-key-secret');
      expect(file).not.toContain('bearer-secret');
      expect(file).not.toContain(root);
    }
  });
});
