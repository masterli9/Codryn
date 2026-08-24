import { isAbsolute } from 'node:path';

export interface CliArguments {
  readonly userDataPath: string;
  readonly projectRoot: string;
  readonly task: string;
  readonly contextReferences: readonly string[];
  readonly maxSteps: number;
  readonly scenario: 'read-search-summary';
}

function invalid(): never { throw new Error('Invalid R1 CLI arguments.'); }

export function parseArguments(argv: readonly string[]): CliArguments {
  let userDataPath: string | undefined;
  let projectRoot: string | undefined;
  let task: string | undefined;
  let scenario = 'read-search-summary' as const;
  let maxSteps = 8;
  const contextReferences: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--context') { const value = argv[++index]; if (value === undefined || contextReferences.length >= 8) invalid(); contextReferences.push(value); continue; }
    const value = argv[++index];
    if (value === undefined) invalid();
    if (flag === '--user-data' && userDataPath === undefined) userDataPath = value;
    else if (flag === '--project' && projectRoot === undefined) projectRoot = value;
    else if (flag === '--task' && task === undefined && value.trim().length > 0) task = value;
    else if (flag === '--scenario' && value === 'read-search-summary') scenario = value;
    else if (flag === '--max-steps' && /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 32) maxSteps = Number(value);
    else invalid();
  }
  if (userDataPath === undefined || projectRoot === undefined || task === undefined || !isAbsolute(userDataPath) || !isAbsolute(projectRoot)) invalid();
  return Object.freeze({ userDataPath, projectRoot, task, contextReferences: Object.freeze(contextReferences), maxSteps, scenario });
}
