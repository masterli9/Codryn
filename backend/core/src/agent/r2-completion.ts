export function canComplete(input: {
  readonly changed: boolean;
  readonly verification: 'verified' | 'unverified' | 'stale';
  readonly recoveryRequired: boolean;
  readonly pending: boolean;
}): boolean {
  return input.changed && input.verification === 'verified' && !input.recoveryRequired && !input.pending;
}
