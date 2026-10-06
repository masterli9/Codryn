# OD-04 – R2 provider selection

Status: accepted by author decision; selected-model acceptance gate passed.

The first live R2/O1 adapter is OpenAI Responses with `gpt-6-luna`. The author
selected this model directly on 2026-10-05. This is an explicit product choice,
not a claim that GPT-6 Luna won a head-to-head comparison against Gemini.

The five-trial GPT-6 Luna acceptance gate completed with 4/5 successes, meeting
AC-O1-04. All five trials reported usage: 40,360 input and 2,287 output tokens,
with 27 valid and 0 invalid tool calls. Mean end-to-end trial duration was
17.85 seconds (not API-only latency). The estimated cost from the supplied
price profile was `$0.0051795`; the runner reserved `$0.0701687` under a `$1`
cap. These are local estimates, not a verified provider invoice. The failed
`test-failure` trial had a deliberately injected competing edit; safe return
correctly refused to overwrite it and reported `result_verified_conflicted`.
It remains a non-success under the 4/5 gate; review corrected its `failureOwner`
to `harness` without changing trial outcome or metrics. The sanitized report
prepared for review is available at
`docs/evals/r2-live-openai-gpt6-2026-10-05.json` with SHA-256
`12294263CB45569B463E64D525B73699E4B3BA49194DB56D37131B15E573EDB7`.

The earlier Gemini `gemini-3.6-flash` acceptance run reached 2/5 with three
`rate_limit` failures. No further Gemini calls or six-trial head-to-head are
required for this author-directed choice. The evidence does not establish
relative quality or claim that GPT-6 Luna outperforms Gemini. The provider-
neutral adapter boundary remains, and a second adapter may be considered under
FR-LLM-04 later.

Before sending private project content, apply the notice and explicit consent
required by FR-LLM-09 and FR-LLM-13 in PRD v1.1. Reopen this decision only by a
new author instruction; a different first model must also pass the minimum
contract checks and AC-O1-04 acceptance gate.
