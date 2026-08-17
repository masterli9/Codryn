import { rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import type {
  CredentialHelperCategory,
  GitEvidence,
  ProcessResult,
  ProcessRunner
} from '@codryn/core';
import { categorizeCredentialHelpers } from './credential-helper-category.js';

export interface LocalGitProbeOptions {
  readonly runner: ProcessRunner;
  readonly gitExecutable: string;
  readonly env: Readonly<Record<string, string>>;
  readonly tempDirectoryFactory: () => Promise<string>;
}

const timeoutMs = 15_000;
const maxOutputBytes = 65_536;

function stableFailure(step: string): Error {
  return new Error(`Git probe failed at ${step}.`);
}

function requireSuccess(result: ProcessResult, step: string): void {
  if (
    result.termination !== 'exited' ||
    result.exitCode !== 0 ||
    result.stdoutTruncated ||
    result.stderrTruncated
  ) {
    throw stableFailure(step);
  }
}

export class LocalGitProbe {
  private readonly options: LocalGitProbeOptions;

  constructor(options: LocalGitProbeOptions) {
    this.options = options;
  }

  async inspect(): Promise<GitEvidence> {
    const createdDirectory = await this.options.tempDirectoryFactory();
    if (!isAbsolute(createdDirectory)) throw stableFailure('temporary directory creation');
    const fixtureDirectory = resolve(createdDirectory);

    const remoteDirectory = join(fixtureDirectory, 'remote.git');
    const workDirectory = join(fixtureDirectory, 'work');
    try {
      const versionResult = await this.run(fixtureDirectory, ['--version']);
      requireSuccess(versionResult, 'version');
      const version = versionResult.stdout.trim();
      if (!/^git version \d+\.\d+/i.test(version)) throw stableFailure('version');

      await this.runRequired(fixtureDirectory, ['init', '--bare', remoteDirectory], 'init bare remote');
      await this.runRequired(fixtureDirectory, ['init', workDirectory], 'init work repository');
      await this.runRequired(fixtureDirectory, [
        '-C', workDirectory, 'config', 'user.name', 'Codryn R0 Fixture'
      ], 'configure fixture user name');
      await this.runRequired(fixtureDirectory, [
        '-C', workDirectory, 'config', 'user.email', 'r0-fixture@invalid.local'
      ], 'configure fixture user email');

      await writeFile(join(workDirectory, 'README.md'), '# Codryn R0 fixture\n', 'utf8');
      await this.runRequired(
        fixtureDirectory,
        ['-C', workDirectory, 'add', 'README.md'],
        'stage fixture'
      );
      await this.runRequired(
        fixtureDirectory,
        ['-C', workDirectory, 'commit', '-m', 'R0 fixture'],
        'commit fixture'
      );
      await this.runRequired(fixtureDirectory, [
        '-C', workDirectory, 'remote', 'add', 'origin', remoteDirectory
      ], 'add local remote');
      await this.runRequired(fixtureDirectory, [
        '-C', workDirectory, 'push', 'origin', 'HEAD:refs/heads/main'
      ], 'push local fixture');
      await this.runRequired(fixtureDirectory, [
        '-C', workDirectory, 'fetch', 'origin', 'main'
      ], 'fetch local fixture');

      const helperCategory = await this.inspectCredentialHelper(fixtureDirectory);
      return {
        version,
        localCommitCreated: true,
        fetchSucceeded: true,
        credentialHelperCategory: helperCategory
      };
    } finally {
      await rm(fixtureDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  }

  private async inspectCredentialHelper(cwd: string): Promise<CredentialHelperCategory> {
    const result = await this.run(cwd, [
      'config', '--show-origin', '--get-all', 'credential.helper'
    ]);
    if (
      result.termination === 'exited' &&
      result.exitCode === 1 &&
      result.stdout.length === 0 &&
      !result.stdoutTruncated &&
      !result.stderrTruncated
    ) {
      return 'none';
    }
    requireSuccess(result, 'credential helper query');
    return categorizeCredentialHelpers(result.stdout.split(/\r?\n/).filter((line) => line.length > 0));
  }

  private async runRequired(cwd: string, args: readonly string[], step: string): Promise<void> {
    requireSuccess(await this.run(cwd, args), step);
  }

  private run(cwd: string, args: readonly string[]): Promise<ProcessResult> {
    return this.options.runner.run({
      executable: this.options.gitExecutable,
      args,
      cwd,
      timeoutMs,
      maxOutputBytes,
      env: {
        ...this.options.env,
        GIT_TERMINAL_PROMPT: '0',
        GCM_INTERACTIVE: 'Never'
      }
    });
  }
}
