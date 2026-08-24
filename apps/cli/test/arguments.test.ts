import { describe, expect, it } from 'vitest';
import { parseArguments } from '../src/arguments.js';

const absolute = 'E:\\fixture';

describe('parseArguments', () => {
  it('parses the supported R1 invocation with defaults', () => {
    expect(parseArguments(['--user-data', absolute, '--project', absolute, '--task', 'Summarize'])).toEqual({
      userDataPath: absolute, projectRoot: absolute, task: 'Summarize', contextReferences: [], maxSteps: 8, scenario: 'read-search-summary'
    });
  });

  it('accepts repeated context up to eight and all scalar options', () => {
    const argv = ['--user-data', absolute, '--project', absolute, '--task', 'Summarize', '--scenario', 'read-search-summary', '--max-steps', '32'];
    for (let index = 1; index <= 8; index += 1) argv.push('--context', `src/${index}.ts`);
    expect(parseArguments(argv)).toMatchObject({ contextReferences: Array.from({ length: 8 }, (_, index) => `src/${index + 1}.ts`), maxSteps: 32 });
  });

  it.each([
    [['--unknown', 'x']],
    [['--user-data']],
    [['--user-data', absolute, '--user-data', absolute, '--project', absolute, '--task', 'x']],
    [['--user-data', 'relative', '--project', absolute, '--task', 'x']],
    [['--user-data', absolute, '--project', 'relative', '--task', 'x']],
    [['--user-data', absolute, '--project', absolute, '--task', 'x', '--scenario', 'other']],
    [['--user-data', absolute, '--project', absolute, '--task', 'x', '--max-steps', '0']],
    [['--user-data', absolute, '--project', absolute, '--task', 'x', '--max-steps', '33']]
  ])('rejects invalid CLI input %#', (argv) => {
    expect(() => parseArguments(argv)).toThrow('Invalid R1 CLI arguments.');
  });
});
