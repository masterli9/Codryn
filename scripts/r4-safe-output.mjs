import { randomUUID } from 'node:crypto';
import { lstat, open, realpath, rename, rm } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';

function samePath(left, right) {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

async function existingFile(path) {
  try { return await lstat(path); }
  catch (error) {
    if (error instanceof Error && Reflect.get(error, 'code') === 'ENOENT') return null;
    throw error;
  }
}

export async function writeR4EvalOutput(evalDirectory, requestedTarget, contents) {
  const root = resolve(evalDirectory), target = resolve(requestedTarget);
  const name = relative(root, target);
  if (isAbsolute(name) || name === '..' || name.startsWith(`..${sep}`) || name.includes(sep) || basename(name) !== name) {
    throw new Error('R4_EVAL_OUTPUT_INVALID');
  }

  const rootInfo = await lstat(root);
  const canonicalRoot = await realpath(root);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory() || !samePath(root, canonicalRoot)) {
    throw new Error('R4_EVAL_OUTPUT_INVALID');
  }

  const output = join(canonicalRoot, name);
  const prior = await existingFile(output);
  if (prior?.isSymbolicLink()) throw new Error('R4_EVAL_OUTPUT_SYMLINK');
  if (prior !== null && prior !== undefined && !prior.isFile()) throw new Error('R4_EVAL_OUTPUT_INVALID');

  const temporary = join(canonicalRoot, `.r4-eval-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;

    const currentRoot = await lstat(root);
    if (currentRoot.isSymbolicLink() || !currentRoot.isDirectory() || !samePath(canonicalRoot, await realpath(root))) {
      throw new Error('R4_EVAL_OUTPUT_INVALID');
    }
    const currentTarget = await existingFile(output);
    if (currentTarget?.isSymbolicLink()) throw new Error('R4_EVAL_OUTPUT_SYMLINK');
    if (currentTarget !== null && currentTarget !== undefined && !currentTarget.isFile()) throw new Error('R4_EVAL_OUTPUT_INVALID');
    await rename(temporary, output);
  } finally {
    await handle?.close();
    await rm(temporary, { force: true });
  }
}
