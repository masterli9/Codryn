import { createRequire } from 'node:module';

export function developmentTypeScriptCli(): string {
  return createRequire(import.meta.url).resolve('typescript/bin/tsc');
}
