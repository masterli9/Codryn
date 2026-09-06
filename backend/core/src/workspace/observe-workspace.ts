import type { WorkspaceObservation } from './ports.js';

export function shouldAdvance(previous: WorkspaceObservation, next: WorkspaceObservation): boolean {
  return previous.fingerprint !== next.fingerprint
    || previous.gitIdentity !== next.gitIdentity
    || previous.complete !== next.complete;
}
