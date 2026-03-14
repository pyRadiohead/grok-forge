# Custom Instructions Design

## Goal

Add a layered system prompt mechanism to GrokForge that shapes model personality and response style, and maximises multi-agent model capabilities through explicit orchestration guidance.

## Architecture

Two-layer system: a global baseline instruction set that applies to every conversation across all models, plus an optional per-model override that appends to the global baseline. At send time the extension assembles the effective system prompt and injects it as a `{ role: "system" }` message at the head of the `input` array. If both layers are empty, no system message is sent.

## Data Model

### Storage

```ts
// globalState — new key
"grokforge.globalInstructions": string   // default ""

// globalState — existing "grokforge.models" entry gains one field
// (instructions is persisted alongside title/modelId, NOT in secrets)
interface ModelMeta {
  title: string;
  modelId: string;
  instructions?: string;   // per-model override, default ""
}
```

`handleSaveSettings` must persist both layers:

```ts
// 1. Write globalInstructions
await this.context.globalState.update("grokforge.globalInstructions", msg.globalInstructions);

// 2. Write model meta (title + modelId + instructions — no API keys here)
await this.context.globalState.update(
  "grokforge.models",
  incomingModels.map(({ title, modelId, instructions }) => ({ title, modelId, instructions }))
);
```

`globalInstructions` is loaded once at startup into an instance field (`private globalInstructions = ""`) and refreshed at the end of `handleSaveSettings` (before calling `loadAndSendModels`). This avoids async reads on every message send.

### ModelConfig (src/config.ts)

`ModelConfig` gains `instructions` so the runtime model array can carry it to `getRequestConfig`:

```ts
export interface ModelConfig {
  title: string;
  modelId: string;
  apiKey: string;
  unconfigured?: boolean;
  instructions?: string;   // loaded from globalState alongside title/modelId
}
```

### RequestConfig (src/config.ts)

```ts
export interface RequestConfig {
  modelId: string;
  apiKey: string;
  store: false;
  tools?: string[];
  systemPrompt?: string;   // assembled: global + model-specific; undefined if both empty
}
```

### Assembly (chat-provider.ts — getRequestConfig)

`getRequestConfig` reads from the `globalInstructions` instance field and the model's `instructions` field:

```ts
getRequestConfig(index: number): RequestConfig | null {
  const model = this.models[index];
  if (!model) return null;
  const systemPrompt = buildSystemPrompt(this.globalInstructions, model.instructions ?? "") ?? undefined;
  return { modelId: model.modelId, apiKey: model.apiKey, store: false, systemPrompt };
}

function buildSystemPrompt(global: string, modelSpecific: string): string | null {
  const parts = [global, modelSpecific].map(s => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join("\n\n") : null;
}
```

### modelsLoaded message

The extension-host-to-webview `modelsLoaded` message must include `globalInstructions` so the webview can pre-populate the Settings textarea on open:

```ts
this.postMessage({
  type: "modelsLoaded",
  models,
  chatHeight: storedHeight,
  globalInstructions: this.globalInstructions,
});
```

`App.vue` stores `globalInstructions` in a `ref<string>` and passes it to `SettingsView` as a prop. `SettingsView` initialises its local `globalInstructions` ref from that prop when mounted.

### API injection (grok-client.ts)

```ts
const input = config.systemPrompt
  ? [{ role: "system", content: config.systemPrompt }, ...messages]
  : messages;
```

The xAI Responses API accepts `role: "system"` as the first input item (OpenAI-compatible format).

## Settings UI

### Global instructions section (top of Settings, above model list)

```
┌─ Custom Instructions (Global) ──────────────────────────┐
│ Load template: [dropdown ▼]                              │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Applied to every conversation across all models.     │ │
│ │                                                      │ │
│ │ [textarea, ~5 rows]                                  │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Per-model instructions (expandable section inside each model row)

```
┌─ grok-4.20-multi-agent ──────────────────────────────────┐
│ Title: [___]  Model ID: [___]  API Key: [***]            │
│ ▼ Model-specific instructions                            │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Appended after global instructions.                  │ │
│ │ Load template: [dropdown ▼]                          │ │
│ │ [textarea, ~4 rows]                                  │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

Per-model section is collapsed by default; clicking the label toggles it.

### saveSettings message (no new message types)

The existing `saveSettings` webview message is extended:

```ts
{
  type: "saveSettings";
  globalInstructions: string;
  models: Array<{ title: string; modelId: string; apiKey: string; instructions: string }>;
}
```

### Template replacement behaviour

Selecting a template loads its text into the active textarea, replacing current content. No confirmation dialog — browser-native textarea undo (Ctrl+Z) restores the prior text because Vue's `v-model` binding preserves DOM undo history.

## Template Library

Six built-in templates, hardcoded in `src/webview/prompts.ts`. Selecting a template replaces the textarea content. Templates appear in both the global and per-model dropdowns.

### 1. Coding assistant
```
You are a senior software engineer. Write clean, idiomatic, well-structured code.
Before answering, think through the problem. If the request is ambiguous, ask one clarifying question before proceeding.
Prefer editing existing patterns over introducing new abstractions. YAGNI.
When reviewing code, cite specific lines and explain the why, not just the what.
```

### 2. Multi-agent deep researcher *(designed for grok-4.20-multi-agent)*
```
You are a multi-agent research system. For every non-trivial task:
1. Decompose into independent subtasks that can be investigated in parallel.
2. Assign each subtask to a focused sub-agent with a clear, narrow scope.
3. Each sub-agent must use web_search or x_search to ground its findings in current sources.
4. After sub-agents complete, synthesize results: identify agreements, conflicts, and gaps.
5. Produce a final answer with source attribution per claim.

For simple factual questions, respond directly without decomposition.
Always show your reasoning and which sub-agent contributed each key finding.
```

### 3. Deep researcher *(single model, reasoning variant)*
```
You are a thorough research assistant. Use web_search to verify facts before asserting them.
Cite sources inline. When sources conflict, present both perspectives and explain the discrepancy.
Structure your responses: summary first, then detailed findings, then caveats.
```

### 4. Code reviewer
```
You are an expert code reviewer. For every review:
- Security: flag injection risks, secret exposure, unvalidated input.
- Correctness: identify logic errors, edge cases, off-by-one issues.
- Performance: note O(n²) patterns, unnecessary allocations, blocking I/O.
- Maintainability: flag unclear naming, missing error handling, violations of single responsibility.
Be specific: reference line numbers and explain the risk, not just the symptom.
```

### 5. Concise assistant
```
Be direct and concise. No preamble, no summaries of what you just said.
Lead with the answer, then add context only if essential.
Use bullet points for lists. Skip pleasantries.
```

### 6. Multi-agent investigator
```
You are a multi-agent investigator. When given a complex problem:
1. Identify 3–5 distinct angles to investigate (technical, contextual, historical, contrarian, practical).
2. Assign one sub-agent per angle. Each must independently research its angle using web_search.
3. Sub-agents must not assume — every claim needs a source or "unverified".
4. Synthesize: produce a structured brief with sections per angle, then a unified conclusion.
5. Flag the top 1–2 unresolved questions that would most change the conclusion.
```

## Files Changed

| File | Change |
|---|---|
| `src/config.ts` | Add `instructions?: string` to `ModelConfig`; add `systemPrompt?: string` to `RequestConfig` |
| `src/chat/chat-provider.ts` | Add `globalInstructions` instance field; load from globalState on startup; persist in `handleSaveSettings`; assemble in `getRequestConfig`; include in `modelsLoaded` message |
| `src/chat/message-handler.ts` | Update `saveSettings` WebviewMessage type to include `globalInstructions` and `instructions` per model |
| `src/api/grok-client.ts` | Prepend `{ role: "system" }` item to `input` when `config.systemPrompt` is set |
| `src/webview/components/SettingsView.vue` | Add `globalInstructions` prop + textarea; add `instructions` textarea per model row (collapsed); add template dropdown for both |
| `src/webview/App.vue` | Store `globalInstructions` ref from `modelsLoaded`; pass as prop to `SettingsView`; include in `saveSettings` postMessage |

New file: `src/webview/prompts.ts` — exports `TEMPLATES: Array<{ name: string; content: string }>`. Imported by `SettingsView.vue` only.

## Vertex AI Upgrade Path

This design is intentionally structured so the local implementation is a thin shell around the `RequestConfig` interface. Upgrading to Vertex AI means:

1. Replace `createGrokClient` with `createVertexClient` that POSTs to a Vertex AI endpoint.
2. `systemPrompt` on `RequestConfig` becomes a Vertex Prompt Management template ID (or the assembled string is sent as a grounding instruction to the Vertex agent).
3. The settings UI gains a "Vertex AI" provider toggle; no other UI changes needed.

What Vertex AI Agent Builder would add that local cannot:

| Capability | Local (this spec) | Vertex AI (future) |
|---|---|---|
| System prompt | Static text, per-user | Managed, versioned, team-shared in Vertex Prompt Management |
| Tool use | web_search, x_search, code_execution (xAI server-side) | Vertex Extensions + custom tools (internal APIs, GCS, BigQuery) |
| Search grounding | xAI web_search | Google Search grounding (fresher, higher-quality citations) |
| Agent memory | None (conversation history only) | Vertex Agent Engine — persistent memory across sessions |
| Orchestration | Model handles sub-agents internally | Vertex Reasoning Engine — Python-defined multi-agent graphs |
| Model choice | xAI Grok only | Grok via Model Garden + Gemini, Claude, Llama in same interface |

The extension's streaming display, session history, and VS Code integration are all unchanged in the Vertex path.
