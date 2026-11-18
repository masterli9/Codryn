import { createHash } from 'node:crypto';
import { lstat, opendir, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ClassifiedCheck, WorkspaceSnapshot } from '@codryn/core';
import type { CommandSpec } from '@codryn/shared';
import { readBoundedContextFile } from '../filesystem/read-bounded-context-file.js';
import { inspectProjectChecks } from './project-check-discovery.js';
import type { ProjectCheckDiscovery } from './project-check-discovery.js';

export type CheckToolPaths = Readonly<Record<string, string>>;
const installedNodeHashes = new Map<string, { identity: string; hash: string }>();

export function projectCheckToolPaths(discovery: ProjectCheckDiscovery): CheckToolPaths {
  const typecheck = discovery.catalog.checks.find(check => check.kind === 'typecheck')?.command;
  const test = discovery.catalog.checks.find(check => check.kind === 'test')?.command;
  const node = typecheck?.executable ?? test?.executable;
  const tsc = typecheck?.args[0];
  return {
    ...(node ? { '@node': node } : {}),
    ...(tsc ? { '@tsc': tsc, '@tsc-runtime': join(dirname(tsc), '..', 'lib', '_tsc.js'), '@tsc-libs': join(dirname(tsc), '..', 'lib') } : {}),
    ...(discovery.testFormat === 'vitest-json' && test?.args[0] ? { '@vitest': test.args[0] } : {})
  };
}

export async function readCheckToolHashes(paths: CheckToolPaths): Promise<Record<string, string>> {
  const entries = await Promise.all(Object.entries(paths).map(async ([name, path]) => {
    try {
      const canonical = await realpath(path);
      const stats = await lstat(canonical);
      const key = createHash('sha256');
      if (name === '@tsc-libs') {
        if (!stats.isDirectory()) return [];
        const files: string[] = [];
        for await (const item of await opendir(canonical)) {
          if (/^lib(?:\..+)?\.d\.ts$/u.test(item.name)) {
            if (!item.isFile() || files.length === 200) return [];
            files.push(item.name);
          }
        }
        if (!files.includes('lib.d.ts')) return [];
        let remaining = 16 * 1024 * 1024;
        for (const file of files.sort()) {
          const child = join(canonical, file), info = await lstat(child);
          const bytes = await readBoundedContextFile(child, remaining, info);
          if (!bytes || await realpath(child) !== child) return [];
          remaining -= bytes.length;
          key.update(file).update('\0').update(createHash('sha256').update(bytes).digest());
        }
      } else {
        if (!stats.isFile()) return [];
        const native = name === '@node';
        const identity = JSON.stringify([stats.dev, stats.ino, stats.size, stats.mtimeMs, stats.ctimeMs]);
        const cached = native ? installedNodeHashes.get(canonical) : undefined;
        if (cached?.identity === identity) return [[name, cached.hash] as const];
        const bytes = await readBoundedContextFile(canonical, native ? 128 * 1024 * 1024 : 16 * 1024 * 1024, stats);
        if (bytes === null || await realpath(path) !== canonical) return [];
        const hash = key.update(bytes).digest('hex');
        if (native) {
          if (installedNodeHashes.size >= 4) installedNodeHashes.clear();
          installedNodeHashes.set(canonical, { identity, hash });
        }
        return [[name, hash] as const];
      }
      if (await realpath(path) !== canonical) return [];
      return [[name, key.digest('hex')] as const];
    } catch { return []; }
  }));
  return Object.fromEntries(entries.flat());
}

function equalCommand(a: CommandSpec, b: CommandSpec): boolean {
  return a.executable === b.executable && a.cwd === b.cwd && a.timeoutMs === b.timeoutMs && a.maxOutputBytes === b.maxOutputBytes
    && a.args.length === b.args.length && a.args.every((arg, index) => arg === b.args[index]);
}

export function createProjectCheckClassifier(root: string, initial: ProjectCheckDiscovery, node: string | null, tsc?: string) {
  const tools = projectCheckToolPaths(initial);
  return async (command: CommandSpec, snapshot: WorkspaceSnapshot, signal: AbortSignal): Promise<ClassifiedCheck | null> => {
    if (!snapshot.complete || !snapshot.inputHashes?.['@scope'] || !initial.catalog.checks.some(candidate => candidate.command && equalCommand(command, candidate.command))) return null;
    const discovery = await inspectProjectChecks(root, node, signal, tsc);
    const { catalog, configHashes, inputPaths, policyRevision, testFormat, testFiles } = discovery;
    if (catalog.digest !== initial.catalog.digest || policyRevision !== snapshot.inputHashes['@policy']) return null;
    const candidate = catalog.checks.find(check => check.command && equalCommand(command, check.command));
    if (!candidate || !catalog.includedFiles.length || (candidate.kind === 'test' && (!testFormat || !testFiles.length))) return null;
    if (inputPaths.some(path => !Object.hasOwn(snapshot.inputHashes ?? {}, path)) ||
      Object.entries(configHashes).some(([path, hash]) => snapshot.inputHashes?.[path] !== hash)) return null;
    const toolHashes = await readCheckToolHashes(tools);
    if (Object.keys(toolHashes).length !== Object.keys(tools).length) return null;
    return {
      kind: candidate.kind, profileId: 'r4-ts-v1', coveredPaths: catalog.includedFiles.filter(path => /\.tsx?$/iu.test(path)),
      inputHashes: { ...snapshot.inputHashes, ...toolHashes },
      toolPaths: tools, evidenceFormat: candidate.kind === 'test' ? testFormat : null
    };
  };
}
