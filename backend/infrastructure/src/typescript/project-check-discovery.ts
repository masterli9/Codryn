import { createHash } from 'node:crypto';
import { lstat, opendir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { isProjectCheckInput } from '@codryn/core';
import { projectCheckCatalogSchema, r4ReferencePathSchema } from '@codryn/shared';
import type { ProjectCheckCandidate, ProjectCheckCatalog } from '@codryn/shared';
import { ContextPathPolicy, ContextPathPolicyError } from '../filesystem/context-path-policy.js';
import { readBoundedContextFile } from '../filesystem/read-bounded-context-file.js';
import { developmentTypeScriptCli } from './typescript-installation.js';

const maxConfigBytes = 64 * 1024;
const maxEntries = 5000;
const maxConfigs = 8;
const maxOutputBytes = 256 * 1024;
const utf8 = new TextDecoder('utf-8', { fatal: true });
type Entries = { files: string[]; directories: string[] };
// The pinned Compiler API's configuration matcher, using only our prevalidated directory entries.
type MatchFiles = (root: string, extensions: readonly string[], excludes: readonly string[] | undefined,
  includes: readonly string[], sensitive: boolean, cwd: string, depth: number | undefined,
  entries: (path: string) => Entries, realpath: (path: string) => string) => string[];
const matchFiles = (ts as typeof ts & { matchFiles?: MatchFiles }).matchFiles;
const slash = (path: string) => path.replaceAll('\\', '/');
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const nodeTestFile = /(?:^|\/)(?:test\/[^]*|test|test-[^/]+|[^/]+[.-]test)\.[cm]?[jt]s$/iu;
const vitestFile = /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/iu;

function relativePath(root: string, path: string): string | null {
  const parsed = r4ReferencePathSchema.safeParse(slash(relative(root, path)));
  return parsed.success ? parsed.data : null;
}

async function regularPath(root: string, path: string) {
  const rel = relativePath(root, path);
  if (!rel || !isAbsolute(path)) return null;
  const stats = await lstat(path);
  if (stats.isSymbolicLink() || await realpath(path) !== path) return null;
  return stats;
}

async function readProjectJson(root: string, path: string, policy: ContextPathPolicy, revision: string) {
  const rel = relativePath(root, path);
  if (!rel || !policy.decide(rel, 'typescript_index', { kind: 'file' }).allowed) return null;
  const stats = await regularPath(root, path);
  if (!stats?.isFile() || stats.size > maxConfigBytes || await policy.refresh() !== revision) return null;
  const bytes = await readBoundedContextFile(path, maxConfigBytes, stats);
  if (!bytes || !policy.decide(rel, 'typescript_index', { kind: 'file', bytes }).allowed || await realpath(path) !== path) return null;
  return { rel, bytes, text: utf8.decode(bytes) };
}

async function configTree(root: string, entry: string, policy: ContextPathPolicy, revision: string, signal: AbortSignal, files: Map<string, string>, digests: Record<string, string>, active = new Set<string>()): Promise<boolean> {
  signal.throwIfAborted();
  if (active.has(entry)) return false;
  if (files.has(entry)) return true;
  if (files.size >= maxConfigs) return false;
  const read = await readProjectJson(root, entry, policy, revision).catch(() => null);
  if (!read) return false;
  files.set(entry, read.text);
  digests[read.rel] = hash(read.bytes);
  const parsed = ts.parseConfigFileTextToJson(slash(entry), read.text);
  if (parsed.error || !parsed.config || Array.isArray(parsed.config)) return false;
  const config = object(parsed.config);
  if (config.references !== undefined) return false;
  const parents = config.extends === undefined ? [] : Array.isArray(config.extends) ? config.extends : [config.extends];
  active.add(entry);
  for (const parent of parents) {
    if (typeof parent !== 'string' || !/^\.\.?[/\\]/u.test(parent)) return false;
    const target = resolve(dirname(entry), parent.endsWith('.json') ? parent : `${parent}.json`);
    if (!await configTree(root, target, policy, revision, signal, files, digests, active)) return false;
  }
  active.delete(entry);
  return true;
}

async function allowedFiles(root: string, policy: ContextPathPolicy, signal: AbortSignal) {
  const directories = new Map<string, Entries>();
  const paths = new Set<string>();
  let visited = 0;
  async function walk(directory: string): Promise<void> {
    signal.throwIfAborted();
    if (await realpath(directory) !== directory) throw new Error('R4_CHECK_DISCOVERY_LIMIT');
    const items: Entries = { files: [], directories: [] };
    directories.set(slash(directory), items);
    for await (const entry of await opendir(directory)) {
      signal.throwIfAborted();
      if (++visited > maxEntries) throw new Error('R4_CHECK_DISCOVERY_LIMIT');
      if (!entry.isFile() && !entry.isDirectory()) continue;
      const path = join(directory, entry.name), rel = relativePath(root, path);
      if (!rel || !policy.decide(rel, 'typescript_index', { kind: entry.isDirectory() ? 'directory' : 'file' }).allowed) continue;
      if (entry.isDirectory()) {
        items.directories.push(entry.name);
        await walk(path);
      } else {
        items.files.push(entry.name);
        paths.add(rel);
      }
    }
    items.files.sort();
    items.directories.sort();
  }
  await walk(root);
  return { directories, paths };
}

export async function readGuardedTypeScriptConfig(root: string, policy: ContextPathPolicy, revision: string, signal: AbortSignal) {
  const entry = join(root, 'tsconfig.json'), configs = new Map<string, string>();
  const hashes: Record<string, string> = Object.create(null) as Record<string, string>;
  const complete = await configTree(root, entry, policy, revision, signal, configs, hashes);
  if (!complete || !matchFiles) return { parsed: null, hashes, paths: new Set<string>() };
  const { directories, paths } = await allowedFiles(root, policy, signal);
  const absolute = (path: string) => resolve(root, path);
  const host: ts.ParseConfigHost = {
    useCaseSensitiveFileNames: process.platform !== 'win32',
    fileExists: path => configs.has(absolute(path)) || paths.has(slash(relative(root, absolute(path)))),
    readFile: path => configs.get(absolute(path)),
    readDirectory: (path, extensions = [], excludes, includes, depth) =>
      matchFiles(slash(path), extensions, excludes, includes, host.useCaseSensitiveFileNames, slash(root), depth,
        folder => directories.get(slash(absolute(folder))) ?? { files: [], directories: [] }, folder => slash(absolute(folder)))
  };
  const parsed = ts.parseJsonConfigFileContent(ts.parseConfigFileTextToJson(slash(entry), configs.get(entry) ?? '').config, host, slash(root), undefined, slash(entry));
  return { parsed, hashes, paths };
}

export interface ProjectCheckDiscovery {
  catalog: ProjectCheckCatalog;
  inputPaths: readonly string[];
  configHashes: Readonly<Record<string, string>>;
  testFiles: readonly string[];
  policyRevision: string | null;
  testFormat: 'node-tap' | 'vitest-json' | null;
}

export async function inspectProjectChecks(rootDirectory: string, nodeExecutable: string | null, signal: AbortSignal, tscPath = developmentTypeScriptCli()): Promise<ProjectCheckDiscovery> {
  signal.throwIfAborted();
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(4500)]);
  const digests: Record<string, string> = Object.create(null) as Record<string, string>;
  const reasons: string[] = [], checks: ProjectCheckCandidate[] = [];
  let level: ProjectCheckCatalog['level'] = 'unsupported', framework: ProjectCheckCatalog['framework'] = 'unknown';
  let policyRevision: string | null = null, testFormat: ProjectCheckDiscovery['testFormat'] = null;
  let configPaths: string[] = [], includedFiles: string[] = [], inputPaths: string[] = [], testFiles: string[] = [];
  const result = (): ProjectCheckDiscovery => ({
    catalog: projectCheckCatalogSchema.parse({ level, framework, typescriptVersion: ts.version, configPaths, includedFiles, checks, reasons,
      digest: hash(JSON.stringify([policyRevision, Object.entries(digests).sort()])) }),
    inputPaths, configHashes: digests, testFiles, policyRevision, testFormat
  });
  try {
    const root = await realpath(rootDirectory);
    if (root !== rootDirectory) { reasons.push('Projektová složka změnila kanonickou cestu.'); return result(); }
    const config = join(root, 'tsconfig.json');
    const configExists = await lstat(config).then(() => true, () => false);
    if (!configExists) return result();
    level = 'limited';
    const policy = await ContextPathPolicy.fromProjectRoot(root);
    const revision = policyRevision = policy.revision;
    const pkg = await readProjectJson(root, join(root, 'package.json'), policy, revision).catch(() => null);
    if (!pkg) { reasons.push('Manifest package.json chybí nebo jej nelze bezpečně načíst.'); return result(); }
    digests[pkg.rel] = hash(pkg.bytes);
    let manifest: Record<string, unknown>;
    try { manifest = object(JSON.parse(pkg.text)); }
    catch { reasons.push('Manifest package.json není platný JSON.'); return result(); }
    const dependencies = { ...object(manifest.dependencies), ...object(manifest.devDependencies), ...object(manifest.peerDependencies) };
    framework = 'next' in dependencies ? 'next' : 'react' in dependencies ? 'react' : 'node';
    const { parsed, hashes, paths } = await readGuardedTypeScriptConfig(root, policy, revision, bounded);
    Object.assign(digests, hashes);
    configPaths = Object.keys(hashes).sort();
    if (!parsed) { reasons.push('Konfigurace TypeScriptu není platná nebo čitelná v hranicích projektu.'); return result(); }
    const unsafeFlags = parsed.options.incremental || parsed.options.composite || parsed.options.watch || parsed.options.tsBuildInfoFile !== undefined;
    const included = parsed.fileNames.map(path => relativePath(root, resolve(root, path)));
    if (parsed.errors.length || unsafeFlags || !included.length || included.some(path => path === null || !paths.has(path))) {
      reasons.push('Konfiguraci TypeScriptu nelze použít k omezené kontrole bez zápisu.'); return result();
    }
    includedFiles = included.filter((path): path is string => path !== null).sort();
    const localVersion = dependencies.typescript;
    if (typeof localVersion === 'string' && localVersion !== ts.version) reasons.push(`Projekt deklaruje jinou verzi TypeScriptu. Kontrola použije přibalenou verzi ${ts.version}.`);
    const candidate = (kind: ProjectCheckCandidate['kind'], args: string[] | null, reason: string) => {
      const command = nodeExecutable && args ? { executable: nodeExecutable, args, cwd: root, timeoutMs: kind === 'typecheck' ? 60000 : 120000, maxOutputBytes } : null;
      checks.push({ kind, available: command !== null, command, reason: nodeExecutable === null ? 'Požadovaný systémový Node není dostupný.' : reason });
    };
    const cli = await lstat(tscPath).then(stats => stats.isFile() && !stats.isSymbolicLink(), () => false);
    candidate('typecheck', cli ? [tscPath, '--noEmit', '-p', config] : null, cli ? 'Přibalený TypeScript ověří typy bez generování souborů.' : 'Přibalený TypeScript CLI není dostupný.');
    const script = object(manifest.scripts).test;
    testFiles = [...paths].filter(path => (script === 'vitest run' ? vitestFile : nodeTestFile).test(path)).sort();
    const vitestPath = join(root, 'node_modules', 'vitest', 'vitest.mjs');
    const vitest = script === 'vitest run' && await regularPath(root, vitestPath).then(stats => stats?.isFile() ?? false, () => false);
    if (script === 'node --test') {
      testFormat = 'node-tap';
      candidate('test', ['--test', '--test-reporter=tap'], 'Spustí testovací nástroj Node v projektu.');
    } else if (vitest) {
      testFormat = 'vitest-json';
      candidate('test', [vitestPath, 'run', '--reporter=json'], 'Spustí existující místní Vitest.');
    } else candidate('test', null, script === 'vitest run' ? 'Místní Vitest není dostupný.' : 'Projekt nenabízí podporovaný příkaz testů.');
    inputPaths = [...new Set([...configPaths, ...includedFiles, ...testFiles, ...[...paths].filter(isProjectCheckInput)])].sort();
    if (await policy.refresh() !== revision) throw new Error('R4_CHECK_DISCOVERY_LIMIT');
    if (checks.every(check => check.available) && !reasons.length) level = 'supported';
  } catch (error) {
    signal.throwIfAborted();
    level = 'limited';
    checks.length = 0;
    includedFiles = [];
    reasons.push(error instanceof ContextPathPolicyError && error.line !== undefined
      ? `Neplatné pravidlo .codrynignore na řádku ${error.line}.` : 'Projektové vstupy nelze bezpečně prozkoumat v rámci limitů.');
  }
  return result();
}

export async function discoverProjectChecks(root: string, nodeExecutable: string | null, signal: AbortSignal): Promise<ProjectCheckCatalog> {
  return (await inspectProjectChecks(root, nodeExecutable, signal)).catalog;
}
