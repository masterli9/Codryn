# R2 provider evaluation

Status: offline contract and harness ready; no live provider selected.

The offline contract suite covers OpenAI Responses and Gemini Generate Content
function-call pairing without network access. The live gate requires a dated,
opt-in five-trial run, a cost profile, and at least four successful trials with
one success in each Git mode. Missing usage or unavailable API access is
recorded as unknown, never as zero or as a fake pass.

Run the local contract tests with the repository test command. The opt-in
entrypoint requires a complete pricing profile:

`npm.cmd run verify:r2:live -- --live --provider <id> --model <id> --max-cost-usd <positive> --input-usd-per-million <positive> --output-usd-per-million <positive> --pricing-source https://...`

The runner performs five live trials (3 Git / 2 non-Git), reserves input plus
the maximum 4096 output tokens before each request, and stops at 12 requests
per trial or the configured USD cap. The provider key is accepted only from
the session environment variable `R2_PROVIDER_API_KEY` and is never written
to argv, a report, or the repository. Missing usage remains unknown and
cannot pass the gate. No live run was authorized in this implementation
session.

The comparison command uses the same three variants twice per candidate (six
trials per candidate), records all attempts and hashes, and selects only from
complete data. Its offline default intentionally reports `not_run`; it does
not infer a winner from a provider name or historical model label.
