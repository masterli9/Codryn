import assert from 'node:assert/strict';
import test from 'node:test';

import {
  providerChildEnvironment,
  readProviderKey,
} from './r2-provider-key.mjs';

test('passes only the selected provider key to a child process', () => {
  const parentEnvironment = {
    PATH: 'test-path',
    R2_OPENAI_API_KEY: 'openai-secret',
    R2_GEMINI_API_KEY: 'gemini-secret',
    R2_PROVIDER_API_KEY: 'legacy-secret',
  };

  const openAiEnvironment = providerChildEnvironment('openai', parentEnvironment);
  assert.equal(openAiEnvironment.R2_PROVIDER_API_KEY, 'openai-secret');
  assert.equal(openAiEnvironment.R2_OPENAI_API_KEY, undefined);
  assert.equal(openAiEnvironment.R2_GEMINI_API_KEY, undefined);
  assert.equal(openAiEnvironment.PATH, 'test-path');

  const geminiEnvironment = providerChildEnvironment('gemini', parentEnvironment);
  assert.equal(geminiEnvironment.R2_PROVIDER_API_KEY, 'gemini-secret');
  assert.equal(geminiEnvironment.R2_OPENAI_API_KEY, undefined);
  assert.equal(geminiEnvironment.R2_GEMINI_API_KEY, undefined);
  assert.equal(geminiEnvironment.PATH, 'test-path');

  assert.equal(parentEnvironment.R2_OPENAI_API_KEY, 'openai-secret');
  assert.equal(parentEnvironment.R2_GEMINI_API_KEY, 'gemini-secret');
  assert.equal(parentEnvironment.R2_PROVIDER_API_KEY, 'legacy-secret');
});

test('falls back to the legacy key for a selected provider run', () => {
  const environment = providerChildEnvironment('gemini', {
    R2_PROVIDER_API_KEY: 'legacy-secret',
  });

  assert.equal(readProviderKey('gemini', environment), 'legacy-secret');
  assert.equal(environment.R2_PROVIDER_API_KEY, 'legacy-secret');
  assert.equal(environment.R2_OPENAI_API_KEY, undefined);
  assert.equal(environment.R2_GEMINI_API_KEY, undefined);
});

test('does not inject a provider key when none is configured', () => {
  const environment = providerChildEnvironment('openai', {
    PATH: 'test-path',
  });

  assert.equal(environment.R2_PROVIDER_API_KEY, undefined);
  assert.equal(environment.R2_OPENAI_API_KEY, undefined);
  assert.equal(environment.R2_GEMINI_API_KEY, undefined);
  assert.equal(environment.PATH, 'test-path');
});
