# R2 provider contract

Stav ověření: offline contract implementation, 6 September 2026. Live API
availability, pricing and data-processing terms remain an opt-in M4 gate.

Codryn exposes one `ModelAdapter` contract to core. Infrastructure adapters
translate provider-native streams into validated `ModelStreamEvent` values.
Neither adapter executes a tool. The harness remains responsible for schema
validation, permission, execution and the tool result.

## OpenAI Responses

The adapter uses `POST /v1/responses` with `stream: true`, `store: false`,
custom `function` tools and `parallel_tool_calls: false`. The native
`response.output_item.added` item records the provider function call ID;
`response.function_call_arguments.done` is the only point at which a complete
tool call is emitted. The internal UUID is mapped bijectively to that external
ID for the next `function_call_output` item.

Reference: [OpenAI Responses create](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)
and [function calling](https://developers.openai.com/api/docs/guides/function-calling).

## Gemini Generate Content

The adapter uses the documented `streamGenerateContent` shape with
`functionDeclarations`. It iterates every returned part, preserving assistant
parts in the adapter's in-memory run state and sends a `functionResponse` in
the next request. Opaque provider details are never serialized into Codryn's
database or sent to another provider. The adapter accepts no automatic tool
execution.

Reference: [Gemini function calling](https://ai.google.dev/gemini-api/docs/generate-content/function-calling)
and [Generate Content API](https://ai.google.dev/api/generate-content).

## Secret and context boundary

The API key is obtained through `SessionSecret` and is visible only to the
transport closure. It is not part of `ModelRequest`, event payloads, provider
body, or diagnostics. Context policy blocks fixed sensitive paths, `.git`,
`userData` and unsupported ignore syntax before live transmission. The root
`.codrynignore` is refreshed before each read, search or workspace observation,
so a changed policy is applied before the next context build rather than being
silently cached.

The transport limits one response to 2 MiB, one tool-argument JSON value to
64 KiB, one run to 32 orchestration steps, and one provider stream to a 30 s
idle timeout or 120 s total timeout. Caller cancellation aborts the fetch and
reader. These limits are harness boundaries, not a shell sandbox.

This is an API-contract adapter, not a shell sandbox. Project commands keep
their separate explicit permission and process-tree limits.
