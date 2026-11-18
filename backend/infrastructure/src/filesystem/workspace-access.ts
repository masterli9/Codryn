import { ResourceBarrier } from '@codryn/core';
const access = new ResourceBarrier();
export function workspaceKey(canonicalRoot: string): string {
  return process.platform==='win32'?canonicalRoot.toLowerCase():canonicalRoot;
}
export const workspaceAccess = {
  observe<T>(root: string, signal: AbortSignal, action: () => Promise<T>): Promise<T> {
    return access.exclusive(workspaceKey(root),signal,action);
  },
  mutate<T>(root: string, signal: AbortSignal, action: () => Promise<T>): Promise<T> {
    return access.shared(workspaceKey(root),signal,action);
  }
};
