import type { IsoTimestamp, R3Mode, R3ProviderSettings } from '@codryn/shared';
export interface SecretProtector {
  available(): Promise<boolean>;
  encrypt(value: string): Promise<Uint8Array>;
  decrypt(bytes: Uint8Array): Promise<{ value: string; shouldReEncrypt: boolean }>;
}
export interface ProviderAccessGate {
  acquireRunLease(): Promise<() => void>;
  withSettingsLease<T>(effect: () => Promise<T>): Promise<T>;
}
export interface SecretStore {
  version?(): Promise<number>;
  state(provider: 'openai'): Promise<'missing' | 'stored' | 'unavailable'>;
  read(provider: 'openai'): Promise<string>;
  save(provider: 'openai', value: string, minimumVersion?: number): Promise<void>;
  remove(provider: 'openai'): Promise<void>;
}
export interface ProviderSettingsStore {
  get(): Promise<R3ProviderSettings>;
  select(mode: R3Mode, maxSteps: number): Promise<void>;
  recordKeyVersion(version: number): Promise<void>;
  recordTest(version: number, result: 'passed' | 'failed', at: IsoTimestamp): Promise<void>;
  recordConsent(version: string): Promise<void>;
}
