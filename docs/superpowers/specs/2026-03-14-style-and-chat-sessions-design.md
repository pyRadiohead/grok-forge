# Style Fixes & Chat Sessions — Design Spec

**Date:** 2026-03-14
**Status:** Approved

---

## Overview

Two sets of changes:

1. **Style fixes** — larger chat area, larger fonts, larger input controls
2. **Chat sessions** — per-workspace session persistence with a history panel (☰ burger), auto-save, inline rename, and delete

---

## §1 — Style Changes

### Chat area

| Property | Before | After |
|---|---|---|
| Default height | `panel.offsetHeight * 0.6` | `panel.offsetHeight * 0.85` |
| Min height (drag clamp) | 120px | 300px |
| Message font size | 12–13px | 18px |

The `clampHeight` logic in `App.vue` remains unchanged; only the default and minimum values change.

### InputBox controls (all 2× larger)

| Element | Property | Before | After |
|---|---|---|---|
| `textarea` | font-size | 12px | 16px |
| `textarea` | padding | 8px | 14px |
| `textarea` | rows | 2 | 3 |
| Model `<select>` | font-size | 11px | 14px |
| Model `<select>` | padding | 3px 8px | 6px 14px |
| `@` button | font-size | 13px | 18px |
| `@` button | padding | 3px 9px | 6px 14px |
| Send/Stop button | font-size | 13px | 18px |
| Send/Stop button | padding | 4px 13px | 8px 20px |

---

## §2 — Chat Sessions Data Model

### Types (added to `src/config.ts`)

```ts
export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  // content stores the raw user-typed text (the `text` field of the sendMessage
  // webview message), NOT the codebase-prefixed messageContent. This prevents
  // giant codebase blobs being stored per-message.
  reasoning?: string;
  // isStreaming intentionally omitted — runtime-only field
}

export interface ChatSession {
  id: string;          // Date.now().toString() — unique enough, sortable
  title: string;       // Auto-set from first raw user text (≤40 chars + "…"), user-editable
  createdAt: number;   // Unix ms timestamp
  messages: StoredMessage[];
}
```

### Storage

- **Key:** `grokforge.sessions` in `workspaceState` — per-workspace, stored locally with the workspace
- **Key:** `grokforge.activeSessionId` in `workspaceState` — `string | undefined`
- **Format:** `ChatSession[]`, newest first
- **Cap:** Maximum 20 sessions. When saving would exceed 20, the oldest entry (last in array) is dropped.
- **Note:** `workspaceState` is local to the workspace; it is not synced or backed up by VS Code. Data persists until the extension is uninstalled or the workspace data is cleared.
- **Size:** Each `StoredMessage` stores only the raw user text (not codebase blobs), so 20 sessions × ~20 messages × ~500 chars ≈ ~200 KB — well within `workspaceState`'s practical limits.

---

## §3 — Session Lifecycle

### On extension load (`resolveWebviewView`)

1. Load sessions from `workspaceState.get("grokforge.sessions") ?? []`
2. Load `activeSessionId` from `workspaceState.get("grokforge.activeSessionId")`
3. If `activeSessionId` matches a session, restore its `messages` to `this.messages` (cast to `ChatMessage[]` — same shape)
4. Send `sessionsLoaded` (with `activeSessionId`) alongside `modelsLoaded` (separate messages, both sent at init)

### On first message sent (new blank chat)

When `this.activeSessionId` is `undefined` and the first message is sent (handled in `chat-provider.ts`'s `onMessage` before delegating to `handleMessage`):

1. Create a new `ChatSession`:
   - `id = Date.now().toString()`
   - `createdAt = Date.now()`
   - `title` = first 40 chars of the raw `msg.text` field (the user-typed text, not the codebase-prefixed `messageContent`) + `…` if truncated
   - `messages = []` (messages are added on `onFinish`)
2. Set `this.activeSessionId` to the new id; save to `workspaceState`
3. Prepend session to the sessions array (enforce 20-cap); save array to `workspaceState`
4. Send `sessionsLoaded` immediately (so the history panel shows the in-progress session during streaming)

### On assistant reply complete (`onFinish`) — via HandlerContext

`HandlerContext` is extended with one optional callback:
```ts
onAssistantFinish?: (userText: string, assistantContent: string, reasoning: string) => void;
```

`handleSend` must accumulate reasoning in a local variable (in addition to streaming it to the webview):
```ts
let reasoningAccumulated = "";
// in onReasoning:
onReasoning(delta) {
  reasoningAccumulated += delta;   // accumulate for session storage
  ctx.postMessage({ type: "reasoningDelta", delta });
},
```

`handleSend` calls `ctx.onAssistantFinish?.(text, accumulated, reasoningAccumulated)` at the end of `onFinish` (after `ctx.setAbortController(undefined)`).

In `chat-provider.ts`, this callback **only saves to workspaceState** — it does NOT send `sessionsLoaded`:
1. Finds the active session by `this.activeSessionId`
2. Appends `{ role: "user", content: userText }` and `{ role: "assistant", content: assistantContent, reasoning: reasoning || undefined }` to `session.messages`
3. Saves updated session array to `workspaceState`

`userText` is the raw `text` parameter, not `messageContent` — keeping storage free of codebase blobs.

### Sending `sessionsLoaded` after every send (success, error, or abort)

To avoid a double-send problem, `sessionsLoaded` is **never** sent inside `onAssistantFinish`. Instead, `chat-provider.ts`'s `onMessage` switch uses `await`:

```ts
default:
  await handleMessage(msg, ctx);
  // After handleMessage returns (success, error, or abort), send fresh session list
  this.sendSessionsLoaded();
```

`sendSessionsLoaded()` is a private helper that reads the current sessions array and `activeSessionId` from `this` and posts `sessionsLoaded`. This single call site covers all paths exactly once, with no duplication.

**Requirement:** `onMessage` must use `await handleMessage(msg, ctx)` (not a fire-and-forget call). This is a change from the current code.

### On `newChat`

1. **Abort any active controller first** (mirrors `loadSession`/`deleteSession` pattern)
2. If current session has **zero messages**, remove it from the sessions array and save (prevents "ghost" empty-titled sessions accumulating)
3. Set `this.activeSessionId = undefined`; save to `workspaceState`
4. Clear `this.messages = []`, `this.cachedCodebase = null`
5. Post `clearChat` to webview
6. Post `sessionsLoaded` with updated sessions and `activeSessionId: null`

### On `loadSession { sessionId }` (handled in `chat-provider.ts` switch)

1. **If `abortController` is active:** abort it, clear `this.abortController`
2. Find session by id; if not found, do nothing
3. Set `this.messages` to a copy of `session.messages` (as `ChatMessage[]`)
4. Set `this.activeSessionId = sessionId`; save to `workspaceState`
5. Post `sessionLoaded { messages: session.messages, sessionId }` to webview

The webview, on receiving `sessionLoaded`, resets all UI state (see §4) then populates messages.

### On `deleteSession { sessionId }` (handled in `chat-provider.ts` switch)

1. **If `sessionId === this.activeSessionId` and `abortController` is active:** abort it, clear `this.abortController`
2. Remove session from array; save to `workspaceState`
3. If deleted session was active:
   - Set `this.activeSessionId = undefined`; save to `workspaceState`
   - Clear `this.messages = []`, `this.cachedCodebase = null`
   - Post `clearChat` to webview
4. Post `sessionsLoaded` with updated sessions and current `activeSessionId`

### On `renameSession { sessionId, title }` (handled in `chat-provider.ts` switch)

1. Find session, update its `title`
2. Save to `workspaceState`
3. Post `sessionsLoaded` with updated sessions and current `activeSessionId`

---

## §4 — UI Changes

### Header (chat mode)

Add ☰ button to the right-side button group, leftmost position:

```
GrokForge          ☰  + New  ⚙
```

☰ sets `view = 'history'` in the webview (same pattern as `view = 'settings'`).

### Header (history mode)

```
GrokForge          ← Back
```

← Back sets `view = 'chat'`.

### New component: `src/webview/components/HistoryView.vue`

**Props:** `sessions: ChatSession[]`, `activeSessionId: string | null`

**Emits:** `loadSession(sessionId: string)`, `deleteSession(sessionId: string)`, `renameSession(sessionId: string, title: string)`, `back`

**Layout:**
- Sessions grouped by date: "Today", "Yesterday", date strings for older ("Mar 13", etc.)
- Each session card shows: title, formatted time, message count, ✕ delete button
- Active session card: highlighted background + "active" badge
- Double-click on title → inline `<input>` for rename; blur or Enter confirms; Escape cancels and restores original title

**Empty state:** "No saved chats yet — start a conversation to save it here."

**Streaming guard:** The history panel does not disable session loading during generation; the extension host aborts streaming before loading (see §3 `loadSession`). Deleting the active session during streaming is allowed for the same reason.

### `App.vue` changes

- Add `'history'` to the `view` union type: `ref<'chat' | 'settings' | 'history'>('chat')`
- Add `sessions = ref<ChatSession[]>([])` and `activeSessionId = ref<string | null>(null)`
- Handle `sessionsLoaded { sessions, activeSessionId }` → update both refs
- Handle `sessionLoaded { messages, sessionId }`:
  - Reset: `error = null`, `lastUsage = null`, `sessionTotal = { promptTokens: 0, completionTokens: 0 }`, `isGenerating = false`, `withCodebase = false`, `codebaseFileCount = 0`, `codebaseWorkspaceName = ""`, `codebaseError = null`
  - Set `messages.value` to the payload messages (with `isStreaming: false` for all)
  - Set `activeSessionId.value = sessionId`
  - `scrollToBottom()`
- `onLoadSession(id)` → post `loadSession { sessionId: id }`, set `view = 'chat'`
- `onDeleteSession(id)` → post `deleteSession { sessionId: id }`
- `onRenameSession(id, title)` → post `renameSession { sessionId: id, title }`

---

## §5 — Message Protocol

### Webview → Extension (additions to `WebviewMessage` in `message-handler.ts`)

```ts
| { type: "loadSession"; sessionId: string }
| { type: "deleteSession"; sessionId: string }
| { type: "renameSession"; sessionId: string; title: string }
```

**Routing:** All three are handled in `chat-provider.ts`'s `onMessage` switch — **not** passed to `handleMessage()`. They require access to `workspaceState`, `this.activeSessionId`, and `this.messages`, which are only available on the provider. The `WebviewMessage` union in `message-handler.ts` is updated purely for type safety.

`openHistory` is handled purely in the webview (`view = 'history'`) — no extension message needed.

### Extension → Webview (new messages)

```ts
| {
    type: "sessionsLoaded";
    sessions: ChatSession[];       // full array, newest first, max 20
    activeSessionId: string | null;
  }
// Sent: at init; after send completes (via onMessage default branch, covers success/error/abort); after newChat, delete, rename

| {
    type: "sessionLoaded";
    messages: StoredMessage[];
    sessionId: string;
  }
// Sent: when extension loads a session in response to loadSession message
```

---

## §6 — Files Affected

| File | Change |
|---|---|
| `src/config.ts` | Add `StoredMessage`, `ChatSession` interfaces |
| `src/chat/message-handler.ts` | Add `loadSession`, `deleteSession`, `renameSession` to `WebviewMessage` union; extend `HandlerContext` with `onAssistantFinish` callback; add `reasoningAccumulated` local var; call `onAssistantFinish` in `onFinish` |
| `src/chat/chat-provider.ts` | Session state (`sessions`, `activeSessionId`), all session handlers, `onAssistantFinish` implementation (saves only), `sendSessionsLoaded()` helper, `await handleMessage()` in `onMessage` default branch |
| `src/webview/components/HistoryView.vue` | **New file** — session list, date grouping, inline rename, delete |
| `src/webview/components/InputBox.vue` | Style size increases (§1) |
| `src/webview/components/ChatMessage.vue` | Font size increase to 18px |
| `src/webview/App.vue` | `view` union adds `'history'`, sessions state, `sessionLoaded` full reset, history routing, message handlers |
