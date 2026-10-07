const providerKeyNames = Object.freeze({
  openai: 'R2_OPENAI_API_KEY',
  gemini: 'R2_GEMINI_API_KEY',
});

export function providerKeyEnvironmentName(provider) {
  const environmentName = providerKeyNames[provider];
  if (environmentName === undefined) {
    throw new Error(`Unsupported R2 provider: ${provider}`);
  }

  return environmentName;
}

export function readProviderKey(provider, environment = process.env) {
  const providerKey = environment[providerKeyEnvironmentName(provider)];
  if (typeof providerKey === 'string' && providerKey.length > 0) {
    return providerKey;
  }

  const legacyKey = environment.R2_PROVIDER_API_KEY;
  return typeof legacyKey === 'string' && legacyKey.length > 0 ? legacyKey : undefined;
}

export function providerChildEnvironment(provider, environment = process.env) {
  const childEnvironment = { ...environment };
  delete childEnvironment.R2_PROVIDER_API_KEY;
  delete childEnvironment.R2_OPENAI_API_KEY;
  delete childEnvironment.R2_GEMINI_API_KEY;

  const providerKey = readProviderKey(provider, environment);
  if (providerKey !== undefined) {
    childEnvironment.R2_PROVIDER_API_KEY = providerKey;
  }

  return childEnvironment;
}
