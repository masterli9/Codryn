import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import type { ProcessResult, ProcessRunner, ProcessSpec } from '@codryn/core';
import { describe, expect, it } from 'vitest';
import {
  categorizeCredentialHelpers,
  LocalGitProbe,
  WindowsProcessRunner
} from '../src/index.js';

function exited(stdout = '', exitCode = 0): ProcessResult {
  return {
    termination: 'exited',
    exitCode,
    signal: null,
    stdout,
    stderr: '',
    durationMs: 1,
    stdoutTruncated: false,
    stderrTruncated: false,
    treeTerminated: false
  };
}

class RecordingRunner implements ProcessRunner {
  readonly specs: ProcessSpec[] = [];

  async run(spec: ProcessSpec): Promise<ProcessResult> {
    this.specs.push(spec);
    if (spec.args[0] === '--version') return exited('git version 2.51.0.windows.1\n');
    if (spec.args.includes('credential.helper')) {
      return exited('file:C:/Users/example/.gitconfig\tmanager-core\n');
    }
    if (spec.args[0] === 'init') {
      const directory = spec.args.at(-1);
      if (directory !== undefined) await mkdir(directory, { recursive: true });
    }
    return exited();
  }
}

describe('categorizeCredentialHelpers', () => {
  it.each([
    [[], 'none'],
    [['manager-core'], 'system'],
    [['manager'], 'system'],
    [['wincred'], 'system'],
    [['store'], 'plaintext_store'],
    [['/opt/company/helper'], 'custom'],
    [['!malformed shell helper'], 'unknown'],
    [['file:C:/Users/example/.gitconfig\tMaNaGeR-CoRe'], 'system'],
    [['file:C:/Users/example/.gitconfig   manager'], 'system'],
    [['file:C:/Users/example/.gitconfig\tstore', 'file:C:/other\tmanager'], 'plaintext_store'],
    [['custom-helper', 'manager'], 'custom'],
    [['!shell helper', 'custom-helper'], 'unknown']
  ] as const)('classifies %j as %s', (lines, expected) => {
    expect(categorizeCredentialHelpers(lines)).toBe(expected);
  });

  it('treats malformed multiline and origin-only values as unknown', () => {
    expect(categorizeCredentialHelpers(['manager\nstore'])).toBe('unknown');
    expect(categorizeCredentialHelpers(['file:C:/Users/example/.gitconfig\t'])).toBe('unknown');
  });
});

describe('LocalGitProbe', () => {
  it('uses only a local fixture trace with credential interaction disabled', async () => {
    const runner = new RecordingRunner();
    let fixtureDirectory = '';
    const probe = new LocalGitProbe({
      runner,
      gitExecutable: 'git',
      env: { SystemRoot: 'C:\\Windows', PATH: 'C:\\Git\\cmd' },
      tempDirectoryFactory: async () => {
        fixtureDirectory = await mkdtemp(join(tmpdir(), 'codryn-r0-git-recording-'));
        return fixtureDirectory;
      }
    });

    const evidence = await probe.inspect();

    expect(evidence).toEqual({
      version: 'git version 2.51.0.windows.1',
      localCommitCreated: true,
      fetchSucceeded: true,
      credentialHelperCategory: 'system'
    });
    expect(runner.specs.map(({ args }) => args)).toEqual([
      ['--version'],
      ['init', '--bare', join(fixtureDirectory, 'remote.git')],
      ['init', join(fixtureDirectory, 'work')],
      ['-C', join(fixtureDirectory, 'work'), 'config', 'user.name', 'Codryn R0 Fixture'],
      ['-C', join(fixtureDirectory, 'work'), 'config', 'user.email', 'r0-fixture@invalid.local'],
      ['-C', join(fixtureDirectory, 'work'), 'add', 'README.md'],
      ['-C', join(fixtureDirectory, 'work'), 'commit', '-m', 'R0 fixture'],
      ['-C', join(fixtureDirectory, 'work'), 'remote', 'add', 'origin', join(fixtureDirectory, 'remote.git')],
      ['-C', join(fixtureDirectory, 'work'), 'push', 'origin', 'HEAD:refs/heads/main'],
      ['-C', join(fixtureDirectory, 'work'), 'fetch', 'origin', 'main'],
      ['config', '--show-origin', '--get-all', 'credential.helper']
    ]);
    expect(runner.specs.every((spec) => (
      spec.env.GIT_TERMINAL_PROMPT === '0' && spec.env.GCM_INTERACTIVE === 'Never'
    ))).toBe(true);
    const trace = JSON.stringify(runner.specs);
    expect(trace).not.toMatch(/(?:http|https|ssh):\/\//i);
    expect(trace).not.toContain('credential fill');
    expect(trace).not.toContain('manager-core');
    await expect(access(fixtureDirectory)).rejects.toThrow();
  });

  it('accepts only exit one with empty output as no configured helper', async () => {
    const runner = new RecordingRunner();
    runner.run = async (spec: ProcessSpec) => {
      runner.specs.push(spec);
      if (spec.args[0] === '--version') return exited('git version 2.51.0\n');
      if (spec.args.includes('credential.helper')) return exited('', 1);
      if (spec.args[0] === 'init') {
        const directory = spec.args.at(-1);
        if (directory !== undefined) await mkdir(directory, { recursive: true });
      }
      return exited();
    };
    const probe = new LocalGitProbe({
      runner,
      gitExecutable: 'git',
      env: { SystemRoot: 'C:\\Windows' },
      tempDirectoryFactory: () => mkdtemp(join(tmpdir(), 'codryn-r0-git-none-'))
    });

    await expect(probe.inspect()).resolves.toMatchObject({ credentialHelperCategory: 'none' });
  });

  it('returns a stable failure and removes only its owned directory', async () => {
    const sibling = await mkdtemp(join(tmpdir(), 'codryn-r0-git-sibling-'));
    const marker = join(sibling, 'keep.txt');
    await writeFile(marker, 'keep', 'utf8');
    let fixtureDirectory = '';
    const runner = new RecordingRunner();
    runner.run = async (spec: ProcessSpec) => {
      runner.specs.push(spec);
      if (spec.args[0] === '--version') return exited('git version 2.51.0\n');
      if (spec.args[0] === 'init' && spec.args[1] === '--bare') return exited('secret detail', 2);
      return exited();
    };
    const probe = new LocalGitProbe({
      runner,
      gitExecutable: 'git',
      env: { SystemRoot: 'C:\\Windows' },
      tempDirectoryFactory: async () => {
        fixtureDirectory = await mkdtemp(join(tmpdir(), 'codryn-r0-git-failure-'));
        return fixtureDirectory;
      }
    });

    let failure: unknown;
    try {
      await probe.inspect();
    } catch (error: unknown) {
      failure = error;
    }
    expect(failure).toEqual(new Error('Git probe failed at init bare remote.'));
    expect(String(failure)).not.toContain('secret detail');
    await expect(access(fixtureDirectory)).rejects.toThrow();
    await expect(access(marker)).resolves.toBeUndefined();
    await rm(sibling, { recursive: true, force: true });
  });

  it('refuses an ambiguous relative cleanup target without deleting it', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.codryn-r0-git-relative-'));
    const marker = join(directory, 'keep.txt');
    await writeFile(marker, 'keep', 'utf8');
    const runner = new RecordingRunner();
    const probe = new LocalGitProbe({
      runner,
      gitExecutable: 'git',
      env: { SystemRoot: 'C:\\Windows' },
      tempDirectoryFactory: async () => relative(process.cwd(), directory)
    });

    await expect(probe.inspect()).rejects.toThrow('Git probe failed at temporary directory creation');
    expect(runner.specs).toHaveLength(0);
    await expect(access(marker)).resolves.toBeUndefined();
    await rm(directory, { recursive: true, force: true });
  });
});

const describeWindows = process.platform === 'win32' ? describe : describe.skip;

describeWindows('LocalGitProbe system Git integration', () => {
  it('commits, pushes and fetches only through a local bare remote', async () => {
    const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
    const probe = new LocalGitProbe({
      runner: new WindowsProcessRunner(),
      gitExecutable: 'git',
      env: {
        SystemRoot: systemRoot,
        PATH: process.env.PATH ?? join(systemRoot, 'System32'),
        TEMP: tmpdir(),
        TMP: tmpdir()
      },
      tempDirectoryFactory: () => mkdtemp(join(tmpdir(), 'codryn-r0-git-integration-'))
    });

    const evidence = await probe.inspect();

    expect(evidence.version).toMatch(/^git version \d+\.\d+/);
    expect(evidence.localCommitCreated).toBe(true);
    expect(evidence.fetchSucceeded).toBe(true);
    expect(['system', 'custom', 'plaintext_store', 'none', 'unknown'])
      .toContain(evidence.credentialHelperCategory);
  });
});
