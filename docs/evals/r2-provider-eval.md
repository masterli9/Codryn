# R2 provider evaluation

Status (2026-10-05): the author selected OpenAI `gpt-6-luna` as the first R2/O1
adapter. Its five-trial acceptance gate passed 4/5 with usage reported in all
trials, meeting AC-O1-04. OD-04 is accepted through the author decision in PRD
v1.1 and ADR 0007; no head-to-head comparison with Gemini was performed or
required. This record makes no claim that GPT-6 Luna outperforms Gemini.

The accepted run had 27 valid tool calls and 0 invalid calls. Across all five
trials it used 40,360 input and 2,287 output tokens; the report calculated
`$0.0051795` from the supplied price profile. Mean end-to-end trial duration was
17.85 seconds, including fixture setup, orchestration, verification and return;
this is not API-only latency. One injected command failure was repaired. The
`test-failure` trial also had a deliberately injected competing edit; safe return
correctly refused to overwrite it, so the trial did not count as success. Review
corrected its `failureOwner` from `model` to `harness`; outcome, 4/5 result, usage
and cost are unchanged, and no live API run was repeated.
The sanitized report prepared for review is at
`docs/evals/r2-live-openai-gpt6-2026-10-05.json`
(SHA-256 `12294263CB45569B463E64D525B73699E4B3BA49194DB56D37131B15E573EDB7`).

The offline contract suite covers OpenAI Responses and Gemini Generate Content
function-call pairing without network access. The selected-provider acceptance
gate is a dated, opt-in five-trial run (3 Git / 2 non-Git), with at least four
successful trials and one success in each Git mode. Missing usage or unavailable
API access is recorded as unknown, never as zero or as a fake pass. The separate
six-trial head-to-head runner remains optional for a future author-requested
reconsideration; it is not a prerequisite for this selection.

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
unknown and cannot pass the gate. The earlier OpenAI `gpt-5.6-luna` gate is a
historical 4/5 result without a sanitized artifact; the accepted OpenAI
`gpt-6-luna` run is documented in `docs/r2-acceptance.md`. The 2026-10-05
Gemini 3.6 run used a 15-second minimum spacing
(four request starts per minute) and up to four HTTP 429 retries; it still
finished 2/5 with three `rate_limit` failures and unknown usage/cost in those
trials. This shows that faster request cadence alone did not resolve that
historical Gemini failure. The local report cannot determine whether the key's
Google project is Free Tier or which quota dimension was exhausted; check the
project tier and live quota in AI Studio before any later Gemini retry, if the
author reopens it. Google documents RPM,
input TPM, and RPD as separate project-level limits with model/tier-specific
values; [Gemini limits](https://ai.google.dev/gemini-api/docs/rate-limits) and
[429 troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting).

The raw paced report incorrectly labels those three failures as owned by the
harness even though their `failureCode` is `rate_limit`. The report-classifier
code now attributes provider rate limits to the API and has focused tests; the
historical JSON is preserved unchanged, so its owner field should not be used
to interpret the cause. The paced run used the four-retry setting in code, but
the report did not serialize that setting at the time; new Gemini live reports
now include `maxRateLimitRetries` explicitly.

The Gemini run used positive paid-list prices (`$0.75/$3.75` per million
tokens) only to reserve and estimate local cost under the runner's `$1` cap.
The report records `$0.2951145` reserved and `$0.0183045` known estimated cost;
three trials have unknown cost. These figures do not establish actual billing
or prove the project was on Free Tier. The raw sanitized report is ignored at
`.r2-artifacts/r2-live-gemini-paced-2026-10-05T161041Z.json` and is not included
in a PR.

The optional comparison requires both provider-specific variables, so the two
child runs cannot accidentally receive the other provider's key. Its explicit
`--live` mode invokes Gemini; do not run it unless the author reopens comparative
evaluation. The author-selected GPT-6 Luna acceptance does not need that script.

The checked-in comparison script still has historical candidates OpenAI
`gpt-5.6-luna` and Gemini `gemini-3.6-flash`.

The comparison command uses the same three variants twice per candidate (six
trials per candidate), records all attempts and hashes, and selects only from
complete data with measured usage/cost and at least one successful trial for
each provider. Its offline default intentionally reports `not_run`; it does not
infer a winner from a provider name or historical model label. PRD v1.1 and
ADR 0007 select OpenAI `gpt-6-luna` by author decision. The historical
comparison script and Gemini runs do not override that choice; OD-04 is not
waiting on a two-provider comparison.
