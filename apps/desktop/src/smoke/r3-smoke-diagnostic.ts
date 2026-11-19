export type R3SmokeStep = 'settings' | 'fixture' | 'project_open' | 'map_wait' | 'run_submit'
  | 'permission_wait' | 'permission_answer' | 'cancel' | 'job_wait' | 'snapshot' | 'diff' | 'revert' | 'return_assert';

/** Only fixed identities are persisted; exception text and stack can contain project data. */
export function r3SmokeDiagnostic(step: R3SmokeStep, error: unknown) {
  const names = ['Error','TypeError','RangeError','AbortError','TimeoutError'];
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : '';
  const nativeCode = error instanceof Error ? Reflect.get(error,'code') as unknown : undefined;
  const code = /^R[234]_[A-Z_]+$/u.test(message) ? message
    : typeof nativeCode === 'string' && /^E[A-Z]+$/u.test(nativeCode) ? nativeCode : 'R3_SMOKE_INTERNAL';
  return {step,errorName:names.includes(name)?name:'other',code};
}
