import { readFile, readdir, realpath } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import type { ContextPathPolicy } from '../filesystem/context-path-policy.js';
import { readReferenceIdentity } from '../context/reference-identity.js';
import { readGuardedTypeScriptConfig } from './project-check-discovery.js';
import { developmentTypeScriptCli } from './typescript-installation.js';

const sourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/iu;
const maxBytes = 64 * 1024 * 1024;
const utf8 = new TextDecoder('utf-8', { fatal: true });
export const structuralSourceExtension = sourceExtension;
export const slash = (path: string): string => path.replaceAll('\\', '/');

export async function createGuardedCompilerHost(root: string, target: string, targetText: string, policy: ContextPathPolicy, revision: string, signal: AbortSignal, standardLibrary?: string) {
  const { parsed, paths } = await readGuardedTypeScriptConfig(root, policy, revision, signal);
  if (!parsed || parsed.errors.length) return { reason: 'invalid_config' as const };
  const absolute = (path: string) => slash(resolve(root, path));
  const targetFile = absolute(target);
  const configFiles = parsed.fileNames.map(absolute).filter(path => sourceExtension.test(path));
  if (!configFiles.includes(targetFile)) return { reason: 'target_not_in_config' as const };
  const memory = new Map([[targetFile, targetText]]);
  const directories = new Set<string>();
  const charge = (size: number) => {
    if (size > remaining) return false;
    remaining -= size;
    return true;
  };
  let remaining = maxBytes - Buffer.byteLength(targetText), limited = false;
  for (const path of [...paths].sort()) {
    signal.throwIfAborted();
    if (!(sourceExtension.test(path) || path.endsWith('/package.json') || path === 'package.json') || path === target) continue;
    const file = await readReferenceIdentity(root, path, policy, 'typescript_index', signal, { chargeBytes: charge });
    if (file.status !== 'ready' || !file.bytes) { limited = true; continue; }
    memory.set(absolute(path), utf8.decode(file.bytes));
  }
  const libraries = standardLibrary ?? join(dirname(developmentTypeScriptCli()), '..', 'lib');
  const libRoot = await realpath(libraries);
  for (const entry of await readdir(libRoot, { withFileTypes: true })) {
    if (entry.isFile() && /^lib(?:\.[\w.-]+)?\.d\.ts$/u.test(entry.name)) {
      const path = join(libRoot, entry.name);
      if (await realpath(path) === path) memory.set(slash(path), await readFile(path, 'utf8'));
    }
  }
  for (const path of memory.keys()) {
    let dir = slash(dirname(path));
    while (!directories.has(dir)) {
      directories.add(dir);
      const parent = slash(dirname(dir));
      if (parent === dir) break;
      dir = parent;
    }
  }
  const options = { ...parsed.options, noEmit: true };
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => options,
    getScriptFileNames: () => configFiles.filter(file => memory.has(file)),
    getScriptVersion: () => '0',
    getScriptSnapshot: file => {
      const contents = memory.get(absolute(file));
      return contents === undefined ? undefined : ts.ScriptSnapshot.fromString(contents);
    },
    getCurrentDirectory: () => slash(root),
    getDefaultLibFileName: () => slash(join(libRoot, ts.getDefaultLibFileName(options))),
    getNewLine: () => '\n',
    useCaseSensitiveFileNames: () => true,
    fileExists: file => memory.has(absolute(file)),
    readFile: file => memory.get(absolute(file)),
    directoryExists: directory => directories.has(absolute(directory)),
    getDirectories: parent => [...directories].filter(dir => slash(dirname(dir)) === absolute(parent)).map(dir => basename(dir)),
    realpath: absolute
  };
  const service = ts.createLanguageService(host);
  return { reason: null, service, targetFile, limited,
    relativePath: (file: string) => slash(relative(root, file)),
    resolveModule: (name: string) => ts.resolveModuleName(name, targetFile, options, host).resolvedModule?.resolvedFileName
  };
}
