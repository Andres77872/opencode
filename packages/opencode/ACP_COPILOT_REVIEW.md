# ACP and Copilot Integration Review

## Overview

ACP in this package is implemented as an adapter over the normal OpenCode runtime, not as a second agent engine.

- The ACP entrypoint in `src/cli/cmd/acp.ts` starts the regular OpenCode server, creates an SDK client against that local server, and exposes ACP over stdio NDJSON with `AgentSideConnection`.
- The protocol-facing implementation lives mostly in `src/acp/agent.ts`, with lightweight ACP session state in `src/acp/session.ts`.
- Prompt execution, tool execution, persistence, provider selection, and auth all still run through the existing session and provider stack.
- GitHub Copilot is not wired into ACP directly. It becomes available to ACP because ACP uses the same plugin, provider, and LLM layers as the rest of OpenCode.

The practical result is that ACP inherits most OpenCode behavior automatically, but it also inherits the same provider constraints, auth state, and runtime side effects.

## Runtime Flow

The runtime path is:

```text
ACP client
  -> stdio NDJSON
  -> AgentSideConnection
  -> src/acp/agent.ts
  -> @opencode-ai/sdk/v2 client
  -> local OpenCode server
  -> session/runtime/provider stack
```

Key files in that path:

- `src/cli/cmd/acp.ts`: boots ACP mode and bridges stdio to the local server
- `src/acp/agent.ts`: ACP protocol adapter and event bridge
- `src/server/routes/global.ts`: global SSE stream used for ACP updates
- `src/session/prompt.ts`: normal prompt loop entrypoint
- `src/session/processor.ts`: persists streamed model output and tool state
- `src/session/llm.ts`: shared provider/model execution path

This design keeps ACP thin. The ACP layer mostly translates between ACP requests and existing OpenCode APIs.

## ACP Session Lifecycle

ACP session bookkeeping is handled by `ACPSessionManager` in `src/acp/session.ts`.

The ACP-side state tracks:

- `id`
- `cwd`
- `model`
- `variant`
- `modeId`
- `mcpServers`
- `createdAt`

Session behavior by operation:

- `newSession()`: creates a normal internal session through `sdk.session.create()` and stores ACP-side state
- `loadSession()`: restores ACP state and replays persisted history
- `unstable_forkSession()`: forks the internal session, restores ACP state, then replays history for the fork
- `unstable_resumeSession()`: restores ACP state and usage, but does not replay full history

That means `resume` is weaker than `load`. Clients that expect a reconstructed transcript after resume will not get the same behavior they get from load or fork.

Model, mode, and command availability are not hardcoded in ACP. `loadSessionMode()` pulls them from live server APIs:

- `sdk.config.providers()` for models and variants
- `sdk.app.agents()` for available modes
- `sdk.command.list()` for slash commands

ACP also synthesizes `compact` if it is not present in the command list.

## Event and Tool Streaming

ACP streaming is event-driven. It does not stream directly from the model provider into the ACP connection.

The source of truth is the persisted session state plus global bus events:

- `src/session/processor.ts` consumes `LLM.stream()`
- it persists `text`, `reasoning`, `tool`, and lifecycle parts with `Session.updatePart()` and `Session.updatePartDelta()`
- those writes emit events such as `message.part.updated`, `message.part.delta`, and `permission.asked`
- `src/acp/agent.ts` subscribes to the global event stream and converts those events into ACP `sessionUpdate` notifications

Current ACP update mapping is roughly:

- assistant text delta -> `agent_message_chunk`
- reasoning delta -> `agent_thought_chunk`
- tool start -> `tool_call`
- tool running/completed/error -> `tool_call_update`
- `todowrite` result -> `plan`
- latest assistant usage -> `usage_update`

History replay uses `processMessage()` in `src/acp/agent.ts` to reconstruct ACP-visible text, reasoning, file attachments, and tool state from stored session messages.

That is why the current implementation is more capable than `src/acp/README.md` suggests. The README still describes streaming, tool reporting, and persistence as more limited than the current code actually is.

## Prompt Handling and Permissions

ACP `prompt()` in `src/acp/agent.ts` is a translator from ACP prompt blocks into OpenCode parts.

It maps:

- ACP `text` -> OpenCode text part
- ACP `image` -> OpenCode file part backed by a data URL or remote URL
- ACP `resource_link` -> file part or text fallback depending on URI parsing
- ACP `resource` -> text part or binary file part

After translation, ACP routes to normal OpenCode APIs:

- regular prompt -> `sdk.session.prompt()`
- slash command -> `sdk.session.command()`
- `/compact` -> `sdk.session.summarize()`

Permission flow is also shared-runtime driven:

- OpenCode raises `permission.asked`
- ACP calls `connection.requestPermission()` on the ACP client
- ACP sends the result back with `sdk.permission.reply()`

For edit permissions, ACP does slightly more than pure relay behavior. It can apply the unified diff from permission metadata, compute the new file content locally with `diff.applyPatch`, and call `connection.writeTextFile()` so the ACP client can reflect the edit.

## Copilot Provider Integration

GitHub Copilot support lives outside ACP and is loaded through the normal plugin/provider stack.

Primary files:

- `src/plugin/index.ts`
- `src/plugin/copilot.ts`
- `src/provider/provider.ts`
- `src/provider/transform.ts`
- `src/provider/sdk/copilot/copilot-provider.ts`
- `src/provider/sdk/copilot/chat/*`
- `src/provider/sdk/copilot/responses/*`
- `src/provider/error.ts`
- `src/session/llm.ts`

### Plugin Layer

`src/plugin/index.ts` loads `CopilotAuthPlugin` as a built-in plugin, so ACP gets it automatically when it boots the normal server.

`src/plugin/copilot.ts` is responsible for:

- OAuth device flow for `github.com`
- OAuth device flow for GitHub Enterprise
- forcing Copilot-backed models to use `@ai-sdk/github-copilot`
- injecting Copilot-specific request headers and fetch behavior
- setting `x-initiator=agent` for subagent sessions

Important request shaping in the plugin includes:

- `Authorization: Bearer <token>`
- `Openai-Intent: conversation-edits`
- `User-Agent: opencode/<version>`
- `x-initiator: user|agent`
- `Copilot-Vision-Request: true` for vision traffic

### Provider Layer

`src/provider/provider.ts` integrates Copilot into provider resolution.

Important behaviors:

- `@ai-sdk/github-copilot` is mapped to the local custom wrapper in `src/provider/sdk/copilot/copilot-provider.ts`
- `github-copilot-enterprise` is synthesized from `github-copilot`
- auth loading is special-cased so enterprise auth can activate the same plugin path
- GPT-5-and-later Copilot models use the Responses API, except `gpt-5-mini`, which stays on Chat

That chat-versus-responses split is a real integration boundary. Copilot behavior can differ by model family because different code paths are used under `src/provider/sdk/copilot/chat/*` and `src/provider/sdk/copilot/responses/*`.

### Transform and LLM Layers

`src/provider/transform.ts` adapts shared provider options to Copilot expectations.

It does three especially important things:

- remaps provider options to the `copilot` namespace expected by the SDK
- adds Copilot cache control metadata
- defaults `store=false`

`src/session/llm.ts` adds another Copilot-specific behavior by omitting `maxOutputTokens` for providers whose ID includes `github-copilot`.

### Custom Copilot Wrapper

`src/provider/sdk/copilot/copilot-provider.ts` exposes:

- `chat(modelId)`
- `responses(modelId)`
- `languageModel(modelId)`

The chat implementation handles Copilot-specific chat response shaping, including `reasoning_text` and `reasoning_opaque` handling in `src/provider/sdk/copilot/chat/openai-compatible-chat-language-model.ts`.

The responses implementation handles Copilot/OpenAI Responses-style streaming and provider-executed tools in `src/provider/sdk/copilot/responses/openai-responses-language-model.ts`.

Notable Copilot-specific capabilities present in the wrapper layer:

- multi-turn reasoning metadata handling
- local shell tool support in the Responses path
- provider-executed tools such as web search, file search, image generation, and code interpreter

## Exact Coupling Boundaries

ACP and Copilot are architecturally separate at the protocol layer.

ACP owns:

- protocol negotiation
- ACP session bookkeeping
- ACP prompt-block translation
- history replay for load/fork
- event-to-ACP notification translation
- permission bridging

ACP does not own:

- Copilot auth
- Copilot OAuth flows
- provider registration
- model transport selection
- Copilot headers/fetch logic
- Copilot chat/responses implementations
- LLM request shaping

In practice, the coupling is indirect:

- ACP asks the shared runtime for available models
- Copilot appears in that model list because the built-in plugin and provider stack register it
- once an ACP session selects a Copilot model, all Copilot-specific behavior happens below ACP in the provider and LLM layers

There are no direct Copilot imports or Copilot-only branches in `src/acp/agent.ts`.

## ACP-Specific Side Effects

Setting `OPENCODE_CLIENT=acp` changes behavior in the shared runtime.

Two visible side effects:

- snapshot tracking is disabled in `src/snapshot/index.ts`
- `QuestionTool` is excluded unless `OPENCODE_ENABLE_QUESTION_TOOL` is set, as enforced by `src/tool/registry.ts`

Those differences mean ACP sessions do not behave exactly like CLI sessions even though they share the same runtime.

## Limitations and Risks

### 1. ACP authentication is incomplete

`authenticate()` in `src/acp/agent.ts` throws `Authentication not implemented`.

ACP advertises an auth method during `initialize()`, but actual ACP-native auth flow is not implemented. As a result, ACP can use Copilot only if Copilot auth already exists in normal OpenCode state.

### 2. Resume behavior is weaker than load behavior

`loadSession()` and `unstable_forkSession()` replay history. `unstable_resumeSession()` restores state and usage only.

That difference is easy for ACP clients to misunderstand.

### 3. MCP registration may be broader than ACP session-local intent

ACP passes MCP server definitions into `sdk.mcp.add()`. That works, but the registration path looks more like normal OpenCode configuration than a deeply isolated ACP-session-only scope.

### 4. README drift

`src/acp/README.md` is outdated relative to the current implementation. It still describes missing features that the code now supports, including streaming and history replay in some flows.

### 5. Copilot debugging spans multiple layers

If Copilot fails in ACP, the defect may live in any of these layers:

- plugin auth/device flow
- provider synthesis and auth loading
- transform option remapping
- custom chat model implementation
- custom responses model implementation
- shared `session/llm.ts` request shaping

ACP itself is often not the failing layer.

## Recommended Follow-Ups

1. Implement ACP `authenticate()` or explicitly document ACP as depending on pre-existing OpenCode auth.
2. Update `src/acp/README.md` so it matches the current implementation.
3. Decide whether `unstable_resumeSession()` should replay history or document its weaker contract clearly.
4. Add integration tests that exercise ACP with Copilot models on both chat and responses paths.
5. Add maintainer documentation for ACP-specific runtime side effects, especially snapshot disabling and question-tool gating.
6. Review whether MCP registration through ACP should be more isolated per session.

## Bottom Line

ACP is well integrated into this project because it reuses the existing runtime instead of duplicating it.

That makes the design efficient and low-friction, but it also means ACP is only as self-sufficient as the shared runtime beneath it. For Copilot specifically, ACP is not the integration point; the real integration lives in the built-in Copilot plugin, the provider registry, the Copilot-specific provider wrapper, and the shared LLM pipeline.

So the current state is:

- ACP and Copilot are cleanly separated in code structure
- ACP can use Copilot models through the shared runtime
- the biggest missing piece is first-class ACP-native authentication
