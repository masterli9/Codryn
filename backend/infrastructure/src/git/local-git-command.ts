import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { delimiter, isAbsolute, join } from 'node:path';

const config = ['core.hooksPath=/dev/null', 'core.fsmonitor=false', 'gc.auto=0', 'maintenance.auto=false',
  'submodule.recurse=false', 'core.sshCommand=false', 'credential.helper=', 'commit.gpgSign=false', 'protocol.allow=never',
  'core.splitIndex=false', 'core.untrackedCache=false', 'diff.external=', 'core.pager=cat'];
const allowedEnvironment = new Set(['PATH','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','HOME','USERPROFILE','HOMEDRIVE','HOMEPATH']);

export async function gitExecutable(override?: string): Promise<string> {
  if (override) return override;
  const executable = process.platform === 'win32' ? 'git.exe' : 'git';
  for (const folder of (process.env.PATH ?? process.env.Path ?? '').split(delimiter)) {
    if (!isAbsolute(folder)) continue;
    const path = join(folder, executable);
    if (await stat(path).then(result => result.isFile(), () => false)) return path;
  }
  throw new GitFailure('unavailable');
}

export class GitFailure extends Error {
  constructor(readonly reason: 'unavailable' | 'non-git' | 'failed' | 'limited', readonly exitCode?: number) {
    super(`R4_GIT_${reason.toUpperCase().replace('-', '_')}`);
  }
}

export function runLocalGit(executable: string, cwd: string, args: readonly string[], signal: AbortSignal, options: { index?: string; input?: string } = {}): Promise<string> {
  signal.throwIfAborted();
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => allowedEnvironment.has(name.toUpperCase())));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1',
    GIT_LITERAL_PATHSPECS: '1', GIT_NO_REPLACE_OBJECTS: '1', GIT_PAGER: 'cat', LC_ALL: 'C', ...(options.index ? { GIT_INDEX_FILE: options.index } : {}) });
  return new Promise((resolve, reject) => {
    const child = execFile(executable, [...config.flatMap(value => ['-c', value]), ...args], {
      cwd, shell: false, windowsHide: true, timeout: 5000, maxBuffer: 512 * 1024, encoding: 'utf8', env, signal
    }, (error, stdout, stderr) => {
      if (signal.aborted) { reject(signal.reason); return; }
      if (!error) { resolve(stdout); return; }
      const code = typeof error.code === 'number' ? error.code : undefined;
      reject(new GitFailure(error.code === 'ENOENT' ? 'unavailable' : code === 128 && /not a git repository/iu.test(stderr) ? 'non-git'
        : error.killed || error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? 'limited' : 'failed', code));
    });
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(options.input, 'utf8');
  });
}

/** Git probes may normalize working files through configured filter commands. */
export function requirePassiveGitFilters(executable: string, cwd: string, signal: AbortSignal): Promise<void> {
  return runLocalGit(executable, cwd, ['config', '--get-regexp', '^filter[.].*[.](clean|smudge|process)$'], signal).then(() => {
    throw new Error('R4_GIT_UNSAFE');
  }, error => {
    if (!(error instanceof GitFailure) || error.exitCode !== 1) throw error;
  });
}
