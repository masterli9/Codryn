export type ProjectBaseline =
  | { mode: 'non-git'; reason: 'not_repository' | 'git_unavailable' }
  | {
    mode: 'git';
    head: string | null;
    branch: string | null;
    indexHash: string;
    status: readonly { path: string; xy: string }[];
    conflicts: readonly string[];
    worktreeIdentity: string;
  };

export interface ProjectGitState {
  inspect(signal: AbortSignal): Promise<ProjectBaseline>;
}

export interface ProjectBaselineStore {
  saveOnce(setId: string, baseline: ProjectBaseline): Promise<void>;
  get(setId: string): Promise<ProjectBaseline>;
}
