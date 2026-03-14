# GrokForge UI & Settings Redesign — Design Spec

**Date:** 2026-03-14
**Status:** Approved

---

## Overview

Redesign the GrokForge VS Code sidebar to be cleaner and more discoverable, inspired by Augment Code's input zone pattern. Simultaneously introduce a proper multi-model settings system with per-model API keys.

Two concerns are addressed together because they are tightly coupled: the model dropdown in the input zone is populated from models defined in settings, and each model carries its own API key used at request time.

---

## 1. Header

Two header states share the same DOM element — only the right-side content changes via a `view: 'chat' | 'settings'` reactive ref.

Both states: black background (`#000`), "GrokForge" bold 14px title on the left.

**Chat state (default):** Right side: "**+ New Chat**" and "**⚙ Settings**" text buttons, 13px.

**Settings state:** Right side: "**← Back**" text button only, 13px.

---

## 2. Chat Area

- Remove the top toolbar row (Multi-Agent, Web, X, Code buttons) entirely
- Chat messages fill the space between header and drag handle
- A **drag handle** (`• • •`) is a 12px-tall bar between the chat container and the input zone; dragging it changes `chatContainer.style.height`
  - **Default height:** 60% of the panel height
  - **Minimum:** 120px; **Maximum:** panel height minus 140px (leaves room for input zone)
  - If the panel height is less than 260px (120 + 140), the drag handle is hidden and the chat container takes all available space above the input zone
  - Persisted to `globalState` as `grokforge.chatHeight` (pixels); loaded on init and clamped to `[120, panelHeight - 140]` before applying — if clamping changes the value, the clamped value is written back to `globalState`
  - On first launch (no stored value), default to 60% of panel height
  - A `ResizeObserver` on the panel container re-applies the clamp whenever the panel is resized; the updated (clamped) pixel value is written back to `globalState`
- Token usage bar below the drag handle: `↑{in} ↓{out} tokens (total: {session})`, right-aligned, 10px muted text
  - Token counts use the **existing field names** from `StreamCallbacks.onFinish`: `promptTokens` and `completionTokens`. The extension host includes these in each `assistantEnd` message as `{ usage: { promptTokens, completionTokens } }`.
  - `{in}` = `promptTokens` (per-response); `{out}` = `completionTokens` (per-response); `{session}` = cumulative sum of `promptTokens + completionTokens` since the last New Chat
- **In no-models state:** the drag handle and token bar are hidden; the entire panel body shows the no-models empty state message

---

## 3. Input Zone

### Structure (top to bottom)

1. **Context chips row** (only shown when codebase attached): green pill `@ {workspace} ({n} files) ×`
   - The `×` detaches codebase; next message sends without context
2. **Textarea**: full-width, 2-row default, Shift+Enter for newline; disabled when no models
3. **Controls row** below textarea:
   - **Left:** `@` button — if no codebase attached: emits `attachCodebase` event to `App.vue`; if chip already shown: no-op (use `×` to detach). Disabled when no models.
   - **Right:** model dropdown → send button (`↑`); send disabled when no models or selected model is unconfigured

### `@` Button — Codebase Attachment Flow

The file data is owned by the **extension host**, not the webview. `App.vue` owns the `vscode` API object and all `postMessage` calls:

1. User clicks `@` in `InputBox.vue` → `InputBox.vue` emits `attachCodebase` event to `App.vue`
2. `App.vue` calls `vscode.postMessage({ type: 'readCodebase' })`
3. Extension host runs `readWorkspaceFiles()` (extension-host only; excluded: `.env*`, `*.pem`, `*.key`, lock files); stores file contents in memory
4. On success: extension host sends `{ type: 'codebaseReady', fileCount: n }` to webview; `App.vue` sets `withCodebase = true` and passes `fileCount` + `workspaceName` as props to `InputBox.vue`, which shows the context chip
5. On failure (no workspace open, or all reads fail): extension host sends `{ type: 'codebaseError', message: string }`; `App.vue` passes the error message to `InputBox.vue` as a prop; `InputBox.vue` shows a brief inline error near the `@` button; `withCodebase` stays `false`
6. When the user clicks `×` to detach, `InputBox.vue` emits `detachCodebase` to `App.vue`; `App.vue` sets `withCodebase = false`; extension host clears its stored file contents when it next receives a `sendMessage` with `withCodebase: false`, or on New Chat

### `sendMessage` Payload

```ts
{ type: 'sendMessage', text: string, withCodebase: boolean, selectedModelIndex: number }
```

`InputBox.vue` emits `send({ text, withCodebase })` to `App.vue`. `App.vue` adds `selectedModelIndex` from its own reactive state and calls `vscode.postMessage(...)`. `InputBox.vue` never calls `postMessage` directly.

The extension host injects cached file data into the request context when `withCodebase` is `true`. The webview never carries file data.

### Model Dropdown

- `<select>` styled to match VS Code dark theme
- Options = model titles from in-memory model list, in list order
- `selectedModelIndex` is **session-only** (not in `globalState`); initializes to `0` if models exist, or `null` if models list is empty
- Resets to `0` (or `null` if empty) on New Chat, on extension reload, and when a fresh `modelsLoaded` message is received (including after save — intentional; index 0 is the safe reset when the model list may have changed)
- When `selectedModelIndex` is `null`, dropdown shows a placeholder "No models" and send is disabled

### Unconfigured model state

When the selected model has `unconfigured: true`:
- Send button is disabled
- Textarea remains **enabled** (user can type) but shows placeholder text: `"API key missing — open Settings"`

### No models configured

Chat area shows: *"No models configured — add one in ⚙ Settings."*
Send button, `@` button, and textarea are disabled. The "⚙ Settings" button in the header is visually highlighted (brighter color).

---

## 4. Settings Panel

Activated by "⚙ Settings". Swaps the panel body; header transitions to Settings state.

### `SettingsView.vue` Props and Events

```ts
// Props
interface SettingsViewProps {
  models: Array<{ title: string; modelId: string; apiKey: string }>;
  // Pre-populated from App.vue's in-memory model list.
  // apiKey is "" for unconfigured models (password field shows blank).
}

// Emitted events
// 'saveSettings' → { models: Array<{ title: string; modelId: string; apiKey: string }> }
//   emitted in current display order with no gaps
// 'back' → void
//   emitted when ← Back clicked; App.vue sets view = 'chat'
```

`App.vue` renders `<SettingsView :models="models" @saveSettings="handleSave" @back="view = 'chat'" />` when `view === 'settings'`. On `handleSave`, `App.vue` calls `vscode.postMessage({ type: 'saveSettings', models })`.

**Note on API keys passing through the webview:** API key values pass through the webview's JavaScript context in the settings flow — the user is explicitly entering and editing them. This is deliberate. The constraint "the webview never handles apiKeys directly" (Section 5) applies to **request time only**: during chat, the webview sends `selectedModelIndex`, not the key itself. In the settings flow, keys travel webview → extension host for storage in SecretStorage.

### Model Cards

Each model is a card. Fields:

| Label | Type | Notes |
|---|---|---|
| TITLE | Text input | Display name shown in dropdown |
| MODEL ID | Monospace text input | xAI model identifier |
| API KEY | Password input, monospace | Stored in SecretStorage |

Each card has a **✕** remove button (top-right). **`+ Add Model`** appends a new empty card. A single **`Save Settings`** button persists everything.

### Validation on Save

- Empty **Title** or **Model ID** → red border on that field; save blocked
- Empty **API Key** → yellow warning border on that field; save **allowed** (user may add key later)
- A model with an empty API Key is saved as `""` in SecretStorage and loaded as `unconfigured: true`

### Persistence

**Non-secret** → `globalState` key `grokforge.models`:
```json
[{ "title": "Grok Reasoning", "modelId": "grok-4.20-beta-0309-reasoning" }, …]
```

**API Keys** → `SecretStorage` keys `grokforge.apiKey.0`, `grokforge.apiKey.1`, …

**On save** (sequential; no transaction guarantee):

Write order minimizes corruption: `globalState` first, then SecretStorage. A crash after step 2 but before step 4 leaves models with correct titles/IDs but missing keys → `unconfigured: true`, which is recoverable.

1. **Capture** `previousCount = context.globalState.get('grokforge.models')?.length ?? 0` synchronously before any writes. This captured value is used in step 4 — do not re-read `globalState` after writing.
2. Write `[{ title, modelId }]` array to `globalState` (`grokforge.models`)
3. Write `grokforge.apiKey.{i}` for each card in current display order, indices `0..newCount-1` (empty string if blank). `SettingsView.vue` emits models in display order with no gaps.
4. Delete `grokforge.apiKey.{i}` for `i = newCount..previousCount-1` (removes orphaned tail keys)

**Note on stale orphans:** A prior crashed save may leave keys beyond `previousCount` in SecretStorage. These are unreachable and harmless; they may be overwritten on future saves. Acceptable for v1.

**After a successful save**, the extension host re-assembles `ModelConfig[]` and sends a fresh `modelsLoaded` message to the webview, updating its in-memory model list and resetting `selectedModelIndex` to `0`.

**On load (extension init)**:
1. Read `grokforge.models` from `globalState`; if absent or empty → empty array → no-models state
2. For each model at index `i`, call `SecretStorage.get('grokforge.apiKey.{i}')`:
   - Returns a non-empty string → use as apiKey
   - Returns `""`, `undefined`, or throws → use `""`, set `unconfigured: true`
3. Assemble `ModelConfig[]` and send to webview via `postMessage({ type: 'modelsLoaded', models })`
4. Webview renders a loading skeleton until `modelsLoaded` arrives; once received, renders models or no-models state. Header buttons remain interactive during skeleton state.
5. If the extension host's async load has not completed within 5 seconds, the host sends `{ type: 'modelsLoaded', models: [] }` as a fallback — the timer is on the extension host side and fires if SecretStorage calls stall.

---

## 5. Data Model

```ts
interface ModelConfig {
  title: string;
  modelId: string;
  apiKey: string;          // "" if missing/unconfigured
  unconfigured?: boolean;  // true when apiKey was absent/empty at load or save time
}

// Session-only, never persisted
interface SessionState {
  selectedModelIndex: number | null; // null when models list is empty
  withCodebase: boolean;
}

// Assembled by extension host before calling grok-client
interface RequestConfig {
  modelId: string;
  apiKey: string;
  store: false;  // instructs xAI not to store the conversation server-side; always false in this release
}
```

**RequestConfig assembly:** the webview sends `selectedModelIndex` with each `sendMessage`. The extension host looks up `models[selectedModelIndex]` from its in-memory list. If the index is out of bounds, the handler rejects the request and sends an inline error to the webview — it does not crash. The webview never handles apiKeys at request time.

---

## 6. Component Changes

| File | Change |
|---|---|
| `App.vue` | `view` ref (`chat`/`settings`); remove toolbar; drag-handle with min/max/clamp-on-load/ResizeObserver/small-panel fallback; token bar using `promptTokens`/`completionTokens` (hidden in no-models state); model dropdown; no-models empty state; reset `selectedModelIndex` on `modelsLoaded`; post `sendMessage` with `selectedModelIndex`; handle `attachCodebase`/`detachCodebase` events from `InputBox.vue`; pass `withCodebase`, `fileCount`, `workspaceName`, `codebaseError` as props to `InputBox.vue`; pass `models` prop to `SettingsView` |
| `InputBox.vue` | Remove tool buttons and 📁; add `@` button that emits `attachCodebase`; show context chip and detach (`×`) based on props; show inline codebase error from prop; emit `detachCodebase`; emit `send({ text, withCodebase })` |
| `SettingsView.vue` | **New component** — receives `models` prop; model card list with add/remove; validation; emits `saveSettings` (models in display order) and `back` |
| `chat-provider.ts` | Load models on init (async, per-key error handling, 5s fallback timeout); send `modelsLoaded`; handle `saveSettings` (write globalState first, then SecretStorage keys, then delete tail orphans, then re-send `modelsLoaded`); handle `readCodebase` (call `readWorkspaceFiles()`, store result in provider instance); handle `sendMessage` with `withCodebase` flag (inject cached file data) and bounds check on `selectedModelIndex`; handle `newChat` (clear cached file data); remove `grokforge.setApiKey` command handler |
| `config.ts` | Remove `SINGLE_MODEL` / `MULTI_AGENT_MODEL` / `GrokConfig`; export `ModelConfig` and `RequestConfig` |
| `message-handler.ts` | `WebviewMessage.sendMessage` adds `selectedModelIndex: number` and `withCodebase: boolean`; `HandlerContext` adds `getCachedCodebase(): string | null` method (replaces direct `readWorkspaceFiles()` call); handler resolves `RequestConfig` via `ctx.getRequestConfig(index)` with out-of-bounds guard; injects `ctx.getCachedCodebase()` when `withCodebase` is `true` |
| `grok-client.ts` | Accepts `RequestConfig` instead of `GrokConfig` |
| `extension.ts` | Remove `grokforge.setApiKey` command registration (replaced by settings UI) |

---

## 7. Error States

| Situation | Behavior |
|---|---|
| No models in settings | Drag handle + token bar hidden; chat area shows prompt; ⚙ highlighted; send + @ + textarea disabled |
| Selected model is `unconfigured` | Send button disabled; textarea enabled but shows placeholder "API key missing — open Settings" |
| `selectedModelIndex` out of bounds at request time | Extension host rejects, sends inline error to webview; no crash |
| API error at request time | User message remains visible in chat; assistant bubble shows the error message inline; history is NOT rolled back |
| Empty Title or Model ID on save | Red border on invalid field; save blocked |
| Empty API Key on save | Yellow warning border; save allowed; model marked unconfigured |
| SecretStorage key absent or empty at load | That model loaded with `unconfigured: true`; remaining models load normally |
| `readCodebase` fails (no workspace or all reads fail) | Extension host sends `codebaseError`; `App.vue` passes error to `InputBox.vue`; inline error shown near `@` button; `withCodebase` stays false |
| Extension host load stalls for 5s | Fallback `modelsLoaded` with empty array sent; webview exits skeleton, shows no-models state |

---

## 8. Out of Scope

- Conversation persistence across sessions
- Syntax highlighting in code blocks
- Tab autocomplete
- User-configurable `store` flag (hardcoded `false`)
