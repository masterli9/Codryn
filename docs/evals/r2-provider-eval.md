# R2 provider evaluation

Status: OpenAI live gate passed; Gemini comparison is blocked by the provider's Free Tier rate limit/quota.

The offline contract suite covers OpenAI Responses and Gemini Generate Content
function-call pairing without network access. The live gate requires a dated,
opt-in five-trial run, a cost profile, and at least four successful trials with
one success in each Git mode. Missing usage or unavailable API access is
recorded as unknown, never as zero or as a fake pass.

Run the local contract tests with the repository test command. The opt-in
entrypoint requires a complete pricing profile:

`npm.cmd run verify:r2:live -- --live --provider <id> --model <id> --max-cost-usd <positive> --input-usd-per-million <positive> --output-usd-per-million <positive> --pricing-source https://...`

For local use, copy `.env.example` to `.env` in the repository root and fill
in `R2_OPENAI_API_KEY` and/or `R2_GEMINI_API_KEY`. The npm entrypoints load
`.env` automatically when it exists. `.env` is ignored by Git and must never
be committed.

The runner performs five live trials (3 Git / 2 non-Git), reserves input plus
the maximum 4096 output tokens before each request, and stops at 12 requests
per trial or the configured USD cap. For a selected live run, provide the
matching local variable `R2_OPENAI_API_KEY` or `R2_GEMINI_API_KEY`.
The legacy `R2_PROVIDER_API_KEY` remains a compatibility fallback. The
selected key is passed to the child runner only through its environment and
is never written to argv, a report, or the repository. Missing usage remains
unknown and cannot pass the gate. OpenAI's authorized gate has passed with the
configured low-cost settings; Gemini must be rerun after its provider credit
resets or an appropriate paid/prepay tier is enabled.

The comparison requires both provider-specific variables, so the two child
runs cannot accidentally receive the other provider's key. It runs with
`R2_OPENAI_API_KEY` and `R2_GEMINI_API_KEY` separately and does not use the
legacy fallback for comparison.

The current comparison candidates are OpenAI `gpt-5.6-luna` with
`reasoning: none` and Gemini `gemini-3.6-flash` with
`thinkingLevel: minimal`.

The comparison command uses the same three variants twice per candidate (six
trials per candidate), records all attempts and hashes, and selects only from
complete data. Its offline default intentionally reports `not_run`; it does
not infer a winner from a provider name or historical model label.
