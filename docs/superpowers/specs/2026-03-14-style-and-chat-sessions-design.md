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
  reasoning?: string;
  // isStreaming intentionally omitted — runtime-only field
}

export interface ChatSession {
  id: string;          // Date.now().toString() — unique enough, sortable
  title: string;       // Auto-set from first user message (≤40 chars + "…"), user-editable
  createdAt: number;   // Unix ms timestamp
  messages: StoredMessage[];
}
```

### Storage

- **Key:** `grokforge.sessions` in `workspaceState` — per-workspace, automatically backed up by VS Code
- **Format:** `ChatSession[]`, newest first
- **Cap:** Maximum 20 sessions. When saving would exceed 20, the oldest entry (last in array) is dropped.
- **Active session:** `grokforge.activeSessionId` in `workspaceState` — the `id` of the currently active session. `undefined` means a new unsaved session.

---

## §3 — Session Lifecycle

### On extension load (`resolveWebviewView`)

1. Load sessions from `workspaceState.get("grokforge.sessions") ?? []`
2. Load `activeSessionId` from `workspaceState.get("grokforge.activeSessionId")`
3. If `activeSessionId` matches a session, restore its messages to `this.messages`
4. Send `sessionsLoaded` alongside `modelsLoaded` (piggybacked on same init flow, separate message)

### On first message sent (new blank chat)

When `this.activeSessionId` is `undefined` and the first message is sent:

1. Create a new `ChatSession` with `id = Date.now().toString()`, `createdAt = Date.now()`, `title` = first 40 chars of user message + `…` if truncated, `messages = []`
2. Set `this.activeSessionId` to the new id
3. Save to `workspaceState`

### On assistant reply complete (`onFinish`)

1. Append user + assistant messages to the active session's `messages` array
2. Save updated session to workspaceState (replace entry with matching id)
3. Send `sessionsLoaded` with updated sessions array (so history panel stays current)

### On `newChat` (user clicks "+ New Chat" or fires `grokforge.newChat`)

1. If current session has messages, it is already persisted — no extra save needed
2. Set `this.activeSessionId = undefined`
3. Clear `this.messages = []`, `this.cachedCodebase = null`
4. Update `workspaceState` `activeSessionId` to `undefined`
5. Post `clearChat` to webview

### On `loadSession { sessionId }`

1. Find session by id
2. Set `this.messages` to a copy of `session.messages` (as `ChatMessage[]`)
3. Set `this.activeSessionId = sessionId`
4. Save `activeSessionId` to workspaceState
5. Post `sessionLoaded { messages: session.messages, sessionId }` to webview

### On `deleteSession { sessionId }`

1. Remove session from array
2. Save updated array to workspaceState
3. If deleted session was active → treat as `newChat` (clear state)
4. Post `sessionsLoaded` with updated sessions, plus `clearChat` if active was deleted

### On `renameSession { sessionId, title }`

1. Find session, update its `title`
2. Save to workspaceState
3. Post `sessionsLoaded` with updated sessions

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
- Sessions grouped by date: "Today", "Yesterday", date strings for older
- Each session card shows: title, timestamp, message count, ✕ delete button
- Active session card: highlighted background + "active" badge
- Double-click on title → inline `<input>` for rename; blur or Enter confirms; Escape cancels

**Empty state:** "No saved chats yet — start a conversation to save it here."

### `App.vue` changes

- Add `view: 'history'` to the view union type
- Add `sessions` ref and `activeSessionId` ref, populated by `sessionsLoaded` message
- Handle `sessionsLoaded` → update `sessions` and `activeSessionId`
- Handle `sessionLoaded` → replace messages array, scroll to bottom
- `onLoadSession(id)` → post `loadSession { sessionId: id }`, set `view = 'chat'`
- `onDeleteSession(id)` → post `deleteSession { sessionId: id }`
- `onRenameSession(id, title)` → post `renameSession { sessionId: id, title }`

---

## §5 — Message Protocol

### Webview → Extension (additions to `WebviewMessage`)

```ts
| { type: "loadSession"; sessionId: string }
| { type: "deleteSession"; sessionId: string }
| { type: "renameSession"; sessionId: string; title: string }
```

`openHistory` is handled purely in the webview (`view = 'history'`) — no extension message needed.

### Extension → Webview (new messages)

```ts
| { type: "sessionsLoaded"; sessions: ChatSession[] }
// Sent: at init, after every onFinish, after delete/rename
// sessions is the full array (newest first), max 20 entries

| { type: "sessionLoaded"; messages: StoredMessage[]; sessionId: string }
// Sent: when user loads a session from history
```

---

## §6 — Files Affected

| File | Change |
|---|---|
| `src/config.ts` | Add `StoredMessage`, `ChatSession` interfaces |
| `src/chat/message-handler.ts` | Add `loadSession`, `deleteSession`, `renameSession` to `WebviewMessage` union |
| `src/chat/chat-provider.ts` | Session state, persistence, load/delete/rename handlers, save-on-finish |
| `src/webview/components/HistoryView.vue` | **New file** |
| `src/webview/components/InputBox.vue` | Style size increases |
| `src/webview/components/ChatMessage.vue` | Font size increase to 18px |
| `src/webview/App.vue` | `view` union, sessions state, history routing, message handlers |
