# R2 provider evaluation

Status: not run. This file intentionally does not select a provider or model.

The offline contract suite covers OpenAI Responses and Gemini Generate Content
function-call pairing without network access. The live gate requires a dated,
opt-in five-trial run, a cost profile, and at least four successful trials with
one success in each Git mode. Missing usage or unavailable API access is
recorded as unknown, never as zero or as a fake pass.

Run the local contract tests with the repository test command. The opt-in
entrypoint is `npm.cmd run verify:r2:live -- --live --provider <id> --model
<id> --max-cost-usd <positive>`; the provider key is accepted only from the
session environment variable `R2_PROVIDER_API_KEY` and is never written to a
report. No live run was authorized in this implementation session.
