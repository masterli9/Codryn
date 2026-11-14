import { realpath } from 'node:fs/promises';
import ts from 'typescript';
import { maxTypeScriptQueryOutputBytes, r4ReferencePathSchema, typescriptQueryOutputSchema } from '@codryn/shared';
import type { TypeScriptQueryInput, TypeScriptQueryItem, TypeScriptQueryOutput } from '@codryn/shared';
import { readReferenceIdentity } from '../context/reference-identity.js';
import { ContextPathPolicyError } from '../filesystem/context-path-policy.js';
import type { ContextPathPolicy } from '../filesystem/context-path-policy.js';
import { createGuardedCompilerHost, structuralSourceExtension } from './guarded-compiler-host.js';
import { emptyTypeScriptQuery } from './typescript-query-result.js';

type Reason = NonNullable<TypeScriptQueryOutput['reason']>;
type SymbolQuery = Extract<TypeScriptQueryInput, { kind: 'definition' | 'references' | 'signature' | 'type' }>;
const isSymbolQuery = (input: TypeScriptQueryInput): input is SymbolQuery =>
  input.kind === 'definition' || input.kind === 'references' || input.kind === 'signature' || input.kind === 'type';
const short = (value: string): string => value.slice(0, 400);
const range = (source: ts.SourceFile, start: number, length: number) => {
  const from = source.getLineAndCharacterOfPosition(start), to = source.getLineAndCharacterOfPosition(start + length);
  return { line: from.line + 1, column: from.character + 1, endLine: to.line + 1, endColumn: to.character + 1 };
};

function declarationName(node: ts.Declaration): ts.Node {
  return ts.getNameOfDeclaration(node) ?? node;
}

function syntaxExports(source: ts.SourceFile): ts.Node[] {
  const result: ts.Node[] = [];
  for (const node of source.statements) {
    if (!ts.canHaveModifiers(node) || !ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isVariableStatement(node)) result.push(...node.declarationList.declarations.map(item => item.name));
    else if ('name' in node && node.name && typeof node.name === 'object') result.push(node.name as ts.Node);
  }
  return result;
}

function selector(source: ts.SourceFile, query: SymbolQuery, checker: ts.TypeChecker): ts.Identifier | Reason | undefined {
  const found: ts.Identifier[] = [];
  const names = new Set<ts.Symbol>();
  let position: number | undefined;
  if (query.symbol === undefined && query.line !== undefined && query.column !== undefined) {
    const lines = source.getLineStarts(), start = lines[query.line - 1], end = lines[query.line] ?? source.end + 1;
    if (start === undefined || start + query.column - 1 >= end) return 'position_invalid';
    position = start + query.column - 1;
  }
  function find(node: ts.Node) {
    if (position !== undefined && (position < node.getFullStart() || position >= node.end)) return;
    if (ts.isIdentifier(node) && (query.symbol !== undefined ? node.text === query.symbol : position !== undefined && position >= node.getStart(source))) {
      if (query.symbol !== undefined) {
        const symbol = checker.getSymbolAtLocation(node);
        if (symbol) names.add(symbol);
      }
      found.push(node);
    }
    if (position === undefined || !found.length) ts.forEachChild(node, find);
  }
  find(source);
  return names.size > 1 ? 'ambiguous_symbol' : found[0];
}

export async function executeTypeScriptQuery(input: TypeScriptQueryInput, context: { root: string; policy: ContextPathPolicy; expectedRevision: number; signal: AbortSignal; standardLibrary?: string }): Promise<TypeScriptQueryOutput> {
  const { root, policy, expectedRevision, signal, standardLibrary } = context;
  if (!structuralSourceExtension.test(input.path) || !/\.(?:[cm]?ts|tsx)$/iu.test(input.path)) return emptyTypeScriptQuery(expectedRevision, 'unsupported_extension', 'unsupported');
  try {
    if (await realpath(root) !== root) return emptyTypeScriptQuery(expectedRevision, 'target_unavailable', 'unsupported');
    const target = await readReferenceIdentity(root, input.path, policy, 'typescript_index', signal);
    if (target.status !== 'ready' || !target.bytes) return emptyTypeScriptQuery(expectedRevision, 'target_unavailable', 'unsupported');
    const policyRevision = target.reference.policyRevision;
    const reply: TypeScriptQueryOutput = { status: 'ok', mode: 'configured', revision: expectedRevision, targetHash: target.reference.contentHash,
      policyRevision, items: [], truncated: false, reason: null };
    const limited = (reason: Reason) => { reply.status = 'limited'; reply.reason = reason; };
    function push(item: TypeScriptQueryItem): boolean {
      if (reply.items.length >= input.maxResults) { reply.truncated = true; return false; }
      reply.items.push(item);
      if (Buffer.byteLength(JSON.stringify(reply)) > maxTypeScriptQueryOutputBytes - 128) {
        reply.items.pop(); reply.truncated = true; return false;
      }
      return true;
    }
    const targetText = target.bytes.toString('utf8');
    const prepared = await createGuardedCompilerHost(root, input.path, targetText, policy, policyRevision, signal, standardLibrary);
    if (prepared.reason !== null) {
      reply.mode = 'fallback'; limited(prepared.reason);
      const source = ts.createSourceFile(input.path, targetText, ts.ScriptTarget.Latest, true);
      if (input.kind === 'exports') for (const node of syntaxExports(source)) {
        if (!ts.isIdentifier(node)) continue;
        if (!push({ path: input.path, ...range(source, node.getStart(source), node.getWidth(source)), name: short(node.text) })) break;
      }
    } else {
      const { service, targetFile, relativePath, resolveModule } = prepared;
      try {
        const program = service.getProgram(), source = program?.getSourceFile(targetFile);
        if (!program || !source) return emptyTypeScriptQuery(expectedRevision, 'worker_failed');
        const checker = program.getTypeChecker();
        const dependencies = source.statements.filter((node): node is ts.ImportDeclaration | ts.ExportDeclaration =>
          ts.isImportDeclaration(node) || ts.isExportDeclaration(node)).flatMap(node => {
          const name = node.moduleSpecifier;
          return name && ts.isStringLiteralLike(name) ? [{ node: name, relation: ts.isImportDeclaration(node) ? 'import' as const : 're-export' as const, target: resolveModule(name.text) }] : [];
        });
        const fileDiagnostics = service.getSemanticDiagnostics(targetFile);
        const resolutionErrors = new Set([2307, 2688, 2792, 6053, 7016]);
        const unresolved = fileDiagnostics.some(diag => resolutionErrors.has(diag.code)) ||
          (input.kind === 'type' || input.kind === 'signature') && program.getSourceFiles().some(file =>
            file !== source && pathFor(file.fileName) !== null && service.getSemanticDiagnostics(file.fileName).some(diag => resolutionErrors.has(diag.code)));
        if (prepared.limited) limited('budget_exceeded');
        else if (dependencies.some(item => !item.target) || unresolved || program.getOptionsDiagnostics().some(diag => diag.code === 2688)) limited('dependency_unavailable');
        function pathFor(file: string) {
          const result = r4ReferencePathSchema.safeParse(relativePath(file));
          return result.success ? result.data : null;
        }
        const span = (file: string, offset: number, length: number) => {
          const ownPath = pathFor(file), ownSource = program.getSourceFile(file);
          return ownPath && ownSource ? { path: ownPath, ...range(ownSource, offset, length) } : null;
        };
        if (input.kind === 'imports') for (const edge of dependencies) {
          const pos = edge.node.getStart(source), path = edge.target ? pathFor(edge.target) : null;
          if (!push({ path: input.path, ...range(source, pos + 1, Math.max(0, edge.node.getWidth(source) - 2)), relation: edge.relation, ...(path ? { target: path } : {}) })) break;
        }
        if (input.kind === 'diagnostics') for (const diag of [...service.getSyntacticDiagnostics(targetFile), ...fileDiagnostics]) {
          if (diag.start === undefined || diag.length === undefined) continue;
          const category = ts.DiagnosticCategory[diag.category]?.toLowerCase() as TypeScriptQueryItem['category'];
          // Diagnostic bodies can contain paths, literals and excerpts. Return compiler codes and categories.
          if (!push({ path: input.path, ...range(source, diag.start, diag.length), code: diag.code, category })) break;
        }
        if (input.kind === 'exports') {
          const symbol = checker.getSymbolAtLocation(source);
          if (symbol) for (const item of checker.getExportsOfModule(symbol)) {
            const declared = item.declarations?.[0];
            if (!declared) continue;
            const name = declarationName(declared), location = span(declared.getSourceFile().fileName, name.getStart(), name.getWidth());
            if (location && !push({ ...location, name: short(item.name) })) break;
          }
        }
        if (isSymbolQuery(input)) {
          const node = selector(source, input, checker);
          if (typeof node === 'string') limited(node);
          else if (node) {
            const offset = node.getStart(source);
            if (input.kind === 'definition') for (const found of service.getDefinitionAtPosition(targetFile, offset) ?? []) {
              const location = span(found.fileName, found.textSpan.start, found.textSpan.length);
              if (location && !push({ ...location, name: short(found.name), symbolKind: short(found.kind) })) break;
            }
            if (input.kind === 'references') {
              const definitions = service.getDefinitionAtPosition(targetFile, offset) ?? [];
              const locations = [{ fileName: targetFile, textSpan: { start: offset } }, ...definitions.filter(item => pathFor(item.fileName) !== null)];
              const seen = new Set<string>();
              outer: for (const origin of locations) for (const group of service.findReferences(origin.fileName, origin.textSpan.start) ?? []) for (const found of group.references) {
                const location = span(found.fileName, found.textSpan.start, found.textSpan.length);
                const key = `${found.fileName}:${found.textSpan.start}`;
                if (!location || seen.has(key)) continue;
                seen.add(key);
                if (!push({ ...location, declaration: found.isDefinition === true })) break outer;
              }
            }
            if ((input.kind === 'type' || input.kind === 'signature') && reply.reason === null) {
              const type = checker.getTypeAtLocation(node);
              const location = { path: input.path, ...range(source, offset, node.getWidth(source)), name: short(node.text) };
              if (input.kind === 'type') {
                const display = checker.typeToString(type, node);
                if (display.length > 400) reply.truncated = true;
                push({ ...location, display: short(display) });
              }
              else for (const signature of checker.getSignaturesOfType(type, ts.SignatureKind.Call)) {
                const display = checker.signatureToString(signature, node);
                if (display.length > 400) reply.truncated = true;
                if (!push({ ...location, display: short(display) })) break;
              }
            }
          }
        }
      } finally { service.dispose(); }
    }
    signal.throwIfAborted();
    if (await policy.refresh() !== policyRevision) return emptyTypeScriptQuery(expectedRevision, 'workspace_changed', 'stale');
    return typescriptQueryOutputSchema.parse(reply);
  } catch (error) {
    if (signal.aborted) return emptyTypeScriptQuery(expectedRevision, 'cancelled');
    if (error instanceof ContextPathPolicyError) return emptyTypeScriptQuery(expectedRevision, 'policy_invalid', 'unsupported');
    return emptyTypeScriptQuery(expectedRevision, 'worker_failed');
  }
}
