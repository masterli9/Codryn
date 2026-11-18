import type { GitSide, GitSnapshot } from '@codryn/shared';
import type { ResourceLocks } from '../workspace/resource-locks.js';

type Operation = 'stage' | 'unstage' | 'switch' | 'commit';
export interface LocalGitPort {
  key(signal: AbortSignal): Promise<string>;
  read(signal: AbortSignal): Promise<GitSnapshot>;
  stage(snapshotId: string, path: string, action: 'stage' | 'unstage', signal: AbortSignal): Promise<GitSnapshot>;
  switchBranch(snapshotId: string, branch: string, signal: AbortSignal): Promise<GitSnapshot>;
  commit(snapshotId: string, message: string, signal: AbortSignal): Promise<GitSnapshot>;
}

export class LocalGitService {
  constructor(private readonly locks: ResourceLocks, private readonly audit: (operation: Operation, status: 'started' | 'applied' | 'rejected') => Promise<void>) {}

  async mutate(port: LocalGitPort, operation: Operation, snapshotId: string, value: string, signal: AbortSignal, assertIdle: () => void) {
    return this.locks.withKey(`git:${await port.key(signal)}`, signal, async () => {
      assertIdle();
      await this.audit(operation, 'started');
      let result: GitSnapshot;
      try {
        result = operation === 'stage' || operation === 'unstage' ? await port.stage(snapshotId, value, operation, signal)
          : operation === 'switch' ? await port.switchBranch(snapshotId, value, signal)
          : await port.commit(snapshotId, value, signal);
      } catch (error) {
        await this.audit(operation, 'rejected');
        throw error;
      }
      await this.audit(operation, 'applied');
      return result;
    });
  }
}

export type LocalGitDiffInput = { snapshotId: string; path: string; side: GitSide };
