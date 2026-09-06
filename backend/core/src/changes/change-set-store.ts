import type { ChangeSetState } from '../state/change-set.js';

export interface ChangeSetStore {
  open(projectId: string, runId: string): Promise<string>;
  reserveSequence(setId: string): Promise<number>;
  seal(setId: string): Promise<void>;
  transition(setId: string, from: ChangeSetState, to: ChangeSetState): Promise<void>;
}
