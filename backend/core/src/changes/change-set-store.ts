export interface ChangeSetStore {
  open(projectId: string, runId: string): Promise<string>;
  reserveSequence(setId: string): Promise<number>;
}
