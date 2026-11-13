import { parentPort, workerData } from 'node:worker_threads';
import { scanRepoMap } from './repo-map-scan.js';
import type { ScanInput } from './repo-map-scan.js';

if (!parentPort) throw new Error('R4_REPO_MAP_WORKER_REQUIRED');
const port = parentPort;
const input = workerData as ScanInput;
const signal = AbortSignal.timeout(input.limits.milliseconds);
void scanRepoMap(input, signal, status => port.postMessage({ type: 'progress', status }))
  .then(result => port.postMessage({ type: 'result', result }))
  .catch(() => { /* The parent reports timeout or worker exit. */ });
