const providerFailureCodes = new Set(['auth', 'rate_limit', 'timeout', 'interrupted', 'provider_error']);

export const geminiLiveMaxRateLimitRetries = 4;

export function classifyFailureOwner({
  failureCode,
  adapterError = false,
  harnessError = false,
  harnessInjectedFailure = false,
  verificationStatus,
}) {
  if (failureCode === 'invalid_tool_call') return 'adapter';
  if (adapterError || providerFailureCodes.has(failureCode)) return 'api';
  if (harnessError || harnessInjectedFailure || (typeof failureCode === 'string' && failureCode.startsWith('R2_LIVE_'))) return 'harness';
  if (verificationStatus === 'unverified' || verificationStatus === 'stale') return 'harness';
  return 'model';
}

export function createGeminiLiveReportSettings(provider, series, requestPacing) {
  if (provider !== 'gemini' || series !== 'live') return {};
  return { requestPacing, maxRateLimitRetries: geminiLiveMaxRateLimitRetries };
}
