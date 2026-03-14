# Style Fixes & Chat Sessions Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add larger UI controls (style fixes) and per-workspace chat session persistence with a history panel.

**Architecture:** Style fixes are pure CSS/attribute changes in three Vue components. Sessions are stored in `workspaceState` as `ChatSession[]`; the extension host manages all session state; the webview renders a new `HistoryView.vue` component and sends session messages through the existing postMessage channel.

**Tech Stack:** TypeScript (extension host, CommonJS), Vue 3 `<script setup>` (webview, IIFE bundle), VS Code `workspaceState` for persistence, esbuild build pipeline.

**Spec:** `docs/superpowers/specs/2026-03-14-style-and-chat-sessions-design.md`

---

## Chunk 1: Style Fixes + Type Definitions

### Task 1: ChatMessage.vue — increase message font size to 18px

**Files:**
- Modify: `src/webview/components/ChatMessage.vue`

The `.message-body` CSS rule currently has `font-size: 13px`. Change it to `18px`.

- [ ] **Step 1: Edit ChatMessage.vue**

In `src/webview/components/ChatMessage.vue`, in the `<style scoped>` block, change:

```css
.message-body {
  font-size: 13px;
  line-height: 1.5;
}
```

to:

```css
.message-body {
  font-size: 18px;
  line-height: 1.5;
}
```

- [ ] **Step 2: Build and verify**

```bash
cd /home/yurii/grok-forge && npm run compile
```

Expected: Build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/webview/components/ChatMessage.vue
git commit -m "style: increase chat message font size to 18px"
```

---

### Task 2: InputBox.vue — increase all controls 2×

**Files:**
- Modify: `src/webview/components/InputBox.vue`

The `rows` attribute on `<textarea>` needs to go from `2` to `3`. Multiple CSS properties need updating per the spec §1 table.

- [ ] **Step 1: Update textarea rows attribute**

In `src/webview/components/InputBox.vue`, in the `<template>` block, change:

```html
      rows="2"
```

to:

```html
      rows="3"
```

- [ ] **Step 2: Update textarea CSS**

In the `<style scoped>` block, change:

```css
textarea {
  width: 100%;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  padding: 8px;
  font-family: var(--vscode-font-family);
  font-size: 12px;
  resize: none;
  box-sizing: border-box;
}
```

to:

```css
textarea {
  width: 100%;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  padding: 14px;
  font-family: var(--vscode-font-family);
  font-size: 16px;
  resize: none;
  box-sizing: border-box;
}
```

- [ ] **Step 3: Update @ button CSS**

In the `<style scoped>` block, change:

```css
.at-btn {
  background: none;
  border: 1px solid var(--vscode-panel-border);
  color: var(--vscode-descriptionForeground);
  border-radius: 4px;
  padding: 3px 9px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  line-height: 1;
}
```

to:

```css
.at-btn {
  background: none;
  border: 1px solid var(--vscode-panel-border);
  color: var(--vscode-descriptionForeground);
  border-radius: 4px;
  padding: 6px 14px;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  line-height: 1;
}
```

- [ ] **Step 4: Update model select CSS**

In the `<style scoped>` block, change:

```css
.model-select {
  background: var(--vscode-dropdown-background, #252526);
  color: var(--vscode-dropdown-foreground, #ccc);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 11px;
  cursor: pointer;
  max-width: 170px;
}
```

to:

```css
.model-select {
  background: var(--vscode-dropdown-background, #252526);
  color: var(--vscode-dropdown-foreground, #ccc);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  padding: 6px 14px;
  font-size: 14px;
  cursor: pointer;
  max-width: 170px;
}
```

- [ ] **Step 5: Update send/stop button CSS**

In the `<style scoped>` block, change:

```css
.send-btn, .stop-btn {
  border: none;
  border-radius: 4px;
  padding: 4px 13px;
  font-size: 13px;
  cursor: pointer;
  line-height: 1;
}
```

to:

```css
.send-btn, .stop-btn {
  border: none;
  border-radius: 4px;
  padding: 8px 20px;
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
}
```

- [ ] **Step 6: Build and verify**

```bash
cd /home/yurii/grok-forge && npm run compile
```

Expected: Build completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/webview/components/InputBox.vue
git commit -m "style: increase InputBox controls 2x per spec §1"
```

---

### Task 3: App.vue — increase chat area default height and minimum clamp

**Files:**
- Modify: `src/webview/App.vue`

Two changes: default height multiplier `0.6` → `0.85`, and clamp minimum `120` → `300`.

- [ ] **Step 1: Update default height multiplier**

In `src/webview/App.vue`, in the `modelsLoaded` handler inside `handleExtensionMessage`, change:

```ts
          if (panel) applyHeight(Math.floor(panel.offsetHeight * 0.6));
```

to:

```ts
          if (panel) applyHeight(Math.floor(panel.offsetHeight * 0.85));
```

- [ ] **Step 2: Update clamp minimum**

In `src/webview/App.vue`, in the `clampHeight` function, change:

```ts
  const min = 120;
```

to:

```ts
  const min = 300;
```

- [ ] **Step 3: Build and verify**

```bash
cd /home/yurii/grok-forge && npm run compile
```

Expected: Build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/webview/App.vue
git commit -m "style: increase chat area default height to 85% and min to 300px"
```

---

### Task 4: config.ts — add StoredMessage and ChatSession interfaces

**Files:**
- Modify: `src/config.ts`

Append two new exported interfaces. Do not change or remove existing ones.

- [ ] **Step 1: Add interfaces to config.ts**

Append to the end of `src/config.ts`:

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

- [ ] **Step 2: Build and verify**

```bash
cd /home/yurii/grok-forge && npm run compile
```

Expected: Build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat: add StoredMessage and ChatSession types to config.ts"
```

---

### Task 5: message-handler.ts — extend WebviewMessage union and HandlerContext

**Files:**
- Modify: `src/chat/message-handler.ts`

Three additions:
1. Add `loadSession`, `deleteSession`, `renameSession` to the `WebviewMessage` union (type safety only — these are handled in `chat-provider.ts`, not here).
2. Add `onAssistantFinish` optional callback to `HandlerContext`.
3. In `handleSend`: add `reasoningAccumulated` local variable, accumulate in `onReasoning`, and call `ctx.onAssistantFinish` at end of `onFinish`.

- [ ] **Step 1: Update WebviewMessage union**

In `src/chat/message-handler.ts`, change:

```ts
export type WebviewMessage =
  | { type: "sendMessage"; text: string; withCodebase: boolean; selectedModelIndex: number }
  | { type: "stopGeneration" }
  | { type: "newChat" }
  | { type: "readCodebase" }
  | { type: "saveSettings"; models: Array<{ title: string; modelId: string; apiKey: string }> }
  | { type: "saveChatHeight"; height: number };
```

to:

```ts
export type WebviewMessage =
  | { type: "sendMessage"; text: string; withCodebase: boolean; selectedModelIndex: number }
  | { type: "stopGeneration" }
  | { type: "newChat" }
  | { type: "readCodebase" }
  | { type: "saveSettings"; models: Array<{ title: string; modelId: string; apiKey: string }> }
  | { type: "saveChatHeight"; height: number }
  | { type: "loadSession"; sessionId: string }
  | { type: "deleteSession"; sessionId: string }
  | { type: "renameSession"; sessionId: string; title: string };
```

- [ ] **Step 2: Add onAssistantFinish to HandlerContext**

In `src/chat/message-handler.ts`, change:

```ts
export interface HandlerContext {
  messages: ChatMessage[];
  abortController: AbortController | undefined;
  postMessage: (msg: unknown) => void;
  setAbortController: (ac: AbortController | undefined) => void;
  getRequestConfig: (index: number) => RequestConfig | null;
  getCachedCodebase: () => string | null;
}
```

to:

```ts
export interface HandlerContext {
  messages: ChatMessage[];
  abortController: AbortController | undefined;
  postMessage: (msg: unknown) => void;
  setAbortController: (ac: AbortController | undefined) => void;
  getRequestConfig: (index: number) => RequestConfig | null;
  getCachedCodebase: () => string | null;
  onAssistantFinish?: (userText: string, assistantContent: string, reasoning: string) => void;
}
```

- [ ] **Step 3: Add reasoningAccumulated and onAssistantFinish call in handleSend**

In `src/chat/message-handler.ts`, in the `handleSend` function, replace the partial block below. **Only replace through the closing `},` of `onFinish` — the `onError` callback and the `!settled` abort-path block that follow are left entirely unchanged.** (`text` refers to the outer `handleSend` parameter — raw user-typed text.)

Change:

```ts
  let accumulated = "";
  let settled = false;

  const client = createGrokClient(requestConfig.apiKey);
  await client.chat(ctx.messages, requestConfig, {
    onText(delta) {
      accumulated += delta;
      ctx.postMessage({ type: "assistantDelta", delta });
    },
    onReasoning(delta) {
      ctx.postMessage({ type: "reasoningDelta", delta });
    },
    onFinish(usage) {
      settled = true;
      ctx.messages.push({ role: "assistant", content: accumulated });
      ctx.postMessage({ type: "assistantEnd", usage });
      ctx.setAbortController(undefined);
    },
```

to:

```ts
  let accumulated = "";
  let reasoningAccumulated = "";
  let settled = false;

  const client = createGrokClient(requestConfig.apiKey);
  await client.chat(ctx.messages, requestConfig, {
    onText(delta) {
      accumulated += delta;
      ctx.postMessage({ type: "assistantDelta", delta });
    },
    onReasoning(delta) {
      reasoningAccumulated += delta;
      ctx.postMessage({ type: "reasoningDelta", delta });
    },
    onFinish(usage) {
      settled = true;
      ctx.messages.push({ role: "assistant", content: accumulated });
      ctx.postMessage({ type: "assistantEnd", usage });
      ctx.setAbortController(undefined);
      ctx.onAssistantFinish?.(text, accumulated, reasoningAccumulated);
    },
```

- [ ] **Step 4: Build and verify**

```bash
cd /home/yurii/grok-forge && npm run compile
```

Expected: Build completes with no errors.

- [ ] **Step 5: Make handleMessage async so `await handleMessage()` in chat-provider waits for streaming**

In `src/chat/message-handler.ts`, change:

```ts
export function handleMessage(msg: WebviewMessage, ctx: HandlerContext) {
```

to:

```ts
export async function handleMessage(msg: WebviewMessage, ctx: HandlerContext): Promise<void> {
```

This ensures that `await handleMessage(msg, ctx)` in `chat-provider.ts` actually waits for the streaming to complete before `sendSessionsLoaded()` fires. Without this, `handleMessage` returns `void` for `stopGeneration` and an implicit `Promise<void>` for `sendMessage` — TypeScript treats the overall return type as `void`, so `await` would resolve immediately instead of waiting.

- [ ] **Step 6: Build and verify**

```bash
cd /home/yurii/grok-forge && npm run compile
```

Expected: Build completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/chat/message-handler.ts
git commit -m "feat: extend HandlerContext with onAssistantFinish; accumulate reasoning in handleSend"
```

---

## Chunk 2: Session Logic + History UI

### Task 6: chat-provider.ts — full session management

**Files:**
- Modify: `src/chat/chat-provider.ts`

This is the largest change. Add: session state fields, session loading at startup, session creation on first message, `await handleMessage` with `sendSessionsLoaded`, handlers for `loadSession`/`deleteSession`/`renameSession`, updated `newChat`, and `sendSessionsLoaded` helper.

Import `ChatSession` and `StoredMessage` from `../config`. Also import `ChatSession` type for cast in `loadSession`.

- [ ] **Step 1: Update imports**

In `src/chat/chat-provider.ts`, change:

```ts
import { ModelConfig, RequestConfig } from "../config";
```

to:

```ts
import { ModelConfig, RequestConfig, ChatSession, StoredMessage } from "../config";
```

- [ ] **Step 2: Add session state fields to the class**

In `src/chat/chat-provider.ts`, in the `ChatViewProvider` class, change:

```ts
  private view?: vscode.WebviewView;
  private messages: ChatMessage[] = [];
  private models: ModelConfig[] = [];
  private cachedCodebase: string | null = null;
  private abortController?: AbortController;
```

to:

```ts
  private view?: vscode.WebviewView;
  private messages: ChatMessage[] = [];
  private models: ModelConfig[] = [];
  private cachedCodebase: string | null = null;
  private abortController?: AbortController;
  private sessions: ChatSession[] = [];
  private activeSessionId: string | undefined = undefined;
```

- [ ] **Step 3: Load sessions at startup in resolveWebviewView**

In `src/chat/chat-provider.ts`, in `resolveWebviewView`, change:

```ts
    this.loadAndSendModels();
```

to:

```ts
    // Load sessions from workspaceState
    this.sessions = this.context.workspaceState.get<ChatSession[]>("grokforge.sessions") ?? [];
    this.activeSessionId = this.context.workspaceState.get<string>("grokforge.activeSessionId");

    // Restore active session messages if applicable
    if (this.activeSessionId) {
      const active = this.sessions.find(s => s.id === this.activeSessionId);
      if (active) {
        // ChatMessage only has { role, content } — reasoning is not stored there.
        // Reasoning is available in session.messages (StoredMessage[]) and will be
        // sent to the webview via sessionLoaded when a session is explicitly loaded.
        this.messages = active.messages.map(m => ({ role: m.role, content: m.content }));
      } else {
        this.activeSessionId = undefined;
      }
    }

    this.loadAndSendModels();
```

Note: `loadAndSendModels` calls `postMessage`, so sessions must be loaded before it, but the `sessionsLoaded` message is sent separately via `sendSessionsLoaded` after `modelsLoaded` is sent. Add a call to `sendSessionsLoaded()` at the end of `loadAndSendModels` (after both success and failure paths that call `postMessage({ type: "modelsLoaded" ... })`).

- [ ] **Step 4: Send sessionsLoaded from loadAndSendModels**

In `src/chat/chat-provider.ts`, in `loadAndSendModels`, there are two `postMessage({ type: "modelsLoaded" ... })` calls (one in the timeout and one in the try block, one in catch). Add `this.sendSessionsLoaded()` after each one:

Change the timeout callback from:
```ts
      this.postMessage({ type: "modelsLoaded", models: [], chatHeight: storedHeight });
```
to:
```ts
      this.postMessage({ type: "modelsLoaded", models: [], chatHeight: storedHeight });
      this.sendSessionsLoaded();
```

Change the try block success path from:
```ts
      clearTimeout(timeoutHandle);
      this.models = models;
      this.postMessage({ type: "modelsLoaded", models, chatHeight: storedHeight });
```
to:
```ts
      clearTimeout(timeoutHandle);
      this.models = models;
      this.postMessage({ type: "modelsLoaded", models, chatHeight: storedHeight });
      this.sendSessionsLoaded();
```

Change the catch block from:
```ts
      clearTimeout(timeoutHandle);
      this.postMessage({ type: "modelsLoaded", models: [], chatHeight: storedHeight });
```
to:
```ts
      clearTimeout(timeoutHandle);
      this.postMessage({ type: "modelsLoaded", models: [], chatHeight: storedHeight });
      this.sendSessionsLoaded();
```

- [ ] **Step 5: Update newChat to abort first, clean up ghost session, send sessionsLoaded**

In `src/chat/chat-provider.ts`, replace the entire `newChat` method:

```ts
  newChat() {
    this.messages = [];
    this.cachedCodebase = null;
    this.abortController?.abort();
    this.abortController = undefined;
    this.postMessage({ type: "clearChat" });
  }
```

with:

```ts
  newChat() {
    // 1. Abort any active controller first
    this.abortController?.abort();
    this.abortController = undefined;

    // 2. Remove ghost session (created but has zero stored messages)
    if (this.activeSessionId) {
      const idx = this.sessions.findIndex(s => s.id === this.activeSessionId);
      if (idx !== -1 && this.sessions[idx].messages.length === 0) {
        this.sessions.splice(idx, 1);
        this.context.workspaceState.update("grokforge.sessions", this.sessions);
      }
    }

    // 3. Clear active session
    this.activeSessionId = undefined;
    this.context.workspaceState.update("grokforge.activeSessionId", undefined);

    // 4. Clear runtime state
    this.messages = [];
    this.cachedCodebase = null;

    // 5. Notify webview
    this.postMessage({ type: "clearChat" });
    this.sendSessionsLoaded();
  }
```

- [ ] **Step 6: Update onMessage to create session on first send, await handleMessage, and call sendSessionsLoaded**

In `src/chat/chat-provider.ts`, replace the entire `onMessage` method:

```ts
  private async onMessage(msg: WebviewMessage) {
    switch (msg.type) {
      case "newChat":
        this.newChat();
        return;
      case "readCodebase":
        await this.handleReadCodebase();
        return;
      case "saveSettings":
        await this.handleSaveSettings(msg.models);
        return;
      case "saveChatHeight":
        await this.context.globalState.update("grokforge.chatHeight", msg.height);
        return;
      default:
        handleMessage(msg, {
          messages: this.messages,
          abortController: this.abortController,
          postMessage: (m) => this.postMessage(m),
          setAbortController: (ac) => { this.abortController = ac; },
          getRequestConfig: (i) => this.getRequestConfig(i),
          getCachedCodebase: () => this.cachedCodebase,
        });
    }
  }
```

with:

```ts
  private async onMessage(msg: WebviewMessage) {
    switch (msg.type) {
      case "newChat":
        this.newChat();
        return;
      case "readCodebase":
        await this.handleReadCodebase();
        return;
      case "saveSettings":
        await this.handleSaveSettings(msg.models);
        return;
      case "saveChatHeight":
        await this.context.globalState.update("grokforge.chatHeight", msg.height);
        return;
      case "loadSession":
        await this.handleLoadSession(msg.sessionId);
        return;
      case "deleteSession":
        await this.handleDeleteSession(msg.sessionId);
        return;
      case "renameSession":
        await this.handleRenameSession(msg.sessionId, msg.title);
        return;
      default: {
        // Create a new session on first message if no active session
        if (msg.type === "sendMessage" && !this.activeSessionId) {
          const rawText: string = (msg as { type: "sendMessage"; text: string }).text;
          const title = rawText.length > 40 ? rawText.slice(0, 40) + "…" : rawText;
          const newSession: ChatSession = {
            id: Date.now().toString(),
            title,
            createdAt: Date.now(),
            messages: [],
          };
          this.activeSessionId = newSession.id;
          this.sessions.unshift(newSession);
          if (this.sessions.length > 20) {
            this.sessions.pop();
          }
          await this.context.workspaceState.update("grokforge.sessions", this.sessions);
          await this.context.workspaceState.update("grokforge.activeSessionId", this.activeSessionId);
          this.sendSessionsLoaded();
        }

        await handleMessage(msg, {
          messages: this.messages,
          abortController: this.abortController,
          postMessage: (m) => this.postMessage(m),
          setAbortController: (ac) => { this.abortController = ac; },
          getRequestConfig: (i) => this.getRequestConfig(i),
          getCachedCodebase: () => this.cachedCodebase,
          onAssistantFinish: (userText, assistantContent, reasoning) => {
            this.handleAssistantFinish(userText, assistantContent, reasoning);
          },
        });

        // Send fresh session list after every send (success, error, or abort)
        this.sendSessionsLoaded();
      }
    }
  }
```

- [ ] **Step 7: Add handleAssistantFinish private method**

Add after `handleSaveSettings` and before `readWorkspaceFiles`:

```ts
  private handleAssistantFinish(userText: string, assistantContent: string, reasoning: string) {
    if (!this.activeSessionId) return;
    const session = this.sessions.find(s => s.id === this.activeSessionId);
    if (!session) return;
    session.messages.push({ role: "user", content: userText });
    session.messages.push({
      role: "assistant",
      content: assistantContent,
      reasoning: reasoning || undefined,
    });
    this.context.workspaceState.update("grokforge.sessions", this.sessions);
  }
```

- [ ] **Step 8: Add handleLoadSession private method**

Add after `handleAssistantFinish`:

```ts
  private async handleLoadSession(sessionId: string) {
    // Abort any in-progress generation
    this.abortController?.abort();
    this.abortController = undefined;

    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) return;

    // ChatMessage only has { role, content } — do not include reasoning here.
    this.messages = session.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
    this.activeSessionId = sessionId;
    await this.context.workspaceState.update("grokforge.activeSessionId", sessionId);

    this.postMessage({
      type: "sessionLoaded",
      messages: session.messages,
      sessionId,
    });
  }
```

- [ ] **Step 9: Add handleDeleteSession private method**

Add after `handleLoadSession`:

```ts
  private async handleDeleteSession(sessionId: string) {
    // Abort if deleting the active session
    if (sessionId === this.activeSessionId && this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }

    this.sessions = this.sessions.filter(s => s.id !== sessionId);
    await this.context.workspaceState.update("grokforge.sessions", this.sessions);

    if (sessionId === this.activeSessionId) {
      this.activeSessionId = undefined;
      await this.context.workspaceState.update("grokforge.activeSessionId", undefined);
      this.messages = [];
      this.cachedCodebase = null;
      this.postMessage({ type: "clearChat" });
    }

    this.sendSessionsLoaded();
  }
```

- [ ] **Step 10: Add handleRenameSession private method**

Add after `handleDeleteSession`:

```ts
  private async handleRenameSession(sessionId: string, title: string) {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) return;
    session.title = title;
    await this.context.workspaceState.update("grokforge.sessions", this.sessions);
    this.sendSessionsLoaded();
  }
```

- [ ] **Step 11: Add sendSessionsLoaded private helper**

Add after `handleRenameSession`:

```ts
  private sendSessionsLoaded() {
    this.postMessage({
      type: "sessionsLoaded",
      sessions: this.sessions,
      activeSessionId: this.activeSessionId ?? null,
    });
  }
```

- [ ] **Step 12: Build and verify**

```bash
cd /home/yurii/grok-forge && npm run compile
```

Expected: Build completes with no TypeScript errors.

- [ ] **Step 13: Commit**

```bash
git add src/chat/chat-provider.ts
git commit -m "feat: add chat session persistence to chat-provider"
```

---

### Task 7: Create HistoryView.vue

**Files:**
- Create: `src/webview/components/HistoryView.vue`

New component. Props: `sessions: ChatSession[]`, `activeSessionId: string | null`. Emits: `loadSession`, `deleteSession`, `renameSession`, `back`. Sessions grouped by date. Active badge. Double-click to rename. ✕ to delete. Empty state.

Note: The webview bundle is browser-side; `ChatSession` and `StoredMessage` types from `src/config.ts` are TypeScript types only — they are safely importable (no Node.js APIs used in those types).

- [ ] **Step 1: Create HistoryView.vue**

Create `src/webview/components/HistoryView.vue` with this content:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import type { ChatSession } from "../../config";

const props = defineProps<{
  sessions: ChatSession[];
  activeSessionId: string | null;
}>();

const emit = defineEmits<{
  loadSession: [sessionId: string];
  deleteSession: [sessionId: string];
  renameSession: [sessionId: string, title: string];
  back: [];
}>();

// Inline rename state
const editingId = ref<string | null>(null);
const editingTitle = ref("");

function startRename(session: ChatSession) {
  editingId.value = session.id;
  editingTitle.value = session.title;
}

function confirmRename(sessionId: string) {
  const trimmed = editingTitle.value.trim();
  if (trimmed) {
    emit("renameSession", sessionId, trimmed);
  }
  editingId.value = null;
}

function cancelRename() {
  editingId.value = null;
}

function onRenameKeydown(e: KeyboardEvent, sessionId: string) {
  if (e.key === "Enter") {
    e.preventDefault();
    confirmRename(sessionId);
  } else if (e.key === "Escape") {
    cancelRename();
  }
}

// Date grouping
function formatGroupLabel(dateStr: string): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const d = new Date(dateStr);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

interface SessionGroup {
  label: string;
  dateStr: string;
  sessions: ChatSession[];
}

const grouped = computed<SessionGroup[]>(() => {
  const map = new Map<string, ChatSession[]>();
  for (const s of props.sessions) {
    const dateStr = new Date(s.createdAt).toDateString();
    if (!map.has(dateStr)) map.set(dateStr, []);
    map.get(dateStr)!.push(s);
  }
  return Array.from(map.entries()).map(([dateStr, sessions]) => ({
    label: formatGroupLabel(dateStr),
    dateStr,
    sessions,
  }));
});
</script>

<template>
  <div class="history-view">
    <!-- Empty state -->
    <div v-if="sessions.length === 0" class="empty-state">
      No saved chats yet — start a conversation to save it here.
    </div>

    <!-- Session groups -->
    <template v-else>
      <div v-for="group in grouped" :key="group.dateStr" class="group">
        <div class="group-label">{{ group.label }}</div>

        <div
          v-for="session in group.sessions"
          :key="session.id"
          :class="['session-card', { active: session.id === activeSessionId }]"
          @click="emit('loadSession', session.id)"
        >
          <!-- Title: normal or editing -->
          <div class="session-main">
            <template v-if="editingId === session.id">
              <input
                class="rename-input"
                v-model="editingTitle"
                @blur="confirmRename(session.id)"
                @keydown="onRenameKeydown($event, session.id)"
                @click.stop
                autofocus
              />
            </template>
            <template v-else>
              <div
                class="session-title"
                @dblclick.stop="startRename(session)"
              >{{ session.title }}</div>
            </template>
            <div class="session-meta">
              {{ formatTime(session.createdAt) }} · {{ session.messages.length }} messages
            </div>
          </div>

          <!-- Active badge + delete -->
          <div class="session-actions">
            <span v-if="session.id === activeSessionId" class="active-badge">active</span>
            <button
              class="delete-btn"
              @click.stop="emit('deleteSession', session.id)"
              title="Delete session"
            >✕</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.history-view {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.empty-state {
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  text-align: center;
  margin-top: 40px;
  line-height: 1.5;
}

.group-label {
  font-size: 10px;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0 2px;
  margin-top: 6px;
  margin-bottom: 2px;
}

.group:first-child .group-label {
  margin-top: 2px;
}

.session-card {
  background: #2a2a2a;
  border: 1px solid #333;
  border-radius: 5px;
  padding: 8px 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.session-card:hover {
  border-color: #555;
}

.session-card.active {
  background: #37373d;
  border-color: #555;
}

.session-main {
  flex: 1;
  min-width: 0;
}

.session-title {
  color: #ccc;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-card:not(.active) .session-title {
  font-weight: 400;
  color: #aaa;
}

.session-meta {
  color: #555;
  font-size: 10px;
  margin-top: 2px;
}

.rename-input {
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-focusBorder, #0078d4);
  border-radius: 3px;
  color: #ccc;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 6px;
  width: 100%;
  outline: none;
}

.session-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.active-badge {
  background: var(--vscode-button-background, #0078d4);
  color: var(--vscode-button-foreground, #fff);
  font-size: 9px;
  border-radius: 3px;
  padding: 1px 5px;
}

.delete-btn {
  background: none;
  border: none;
  color: #555;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.delete-btn:hover {
  color: var(--vscode-errorForeground);
}
</style>
```

- [ ] **Step 2: Build and verify**

```bash
cd /home/yurii/grok-forge && npm run compile
```

Expected: Build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/webview/components/HistoryView.vue
git commit -m "feat: add HistoryView component with date grouping, rename, delete"
```

---

### Task 8: App.vue — wire up history view and session state

**Files:**
- Modify: `src/webview/App.vue`

Changes:
1. Import `HistoryView` and `ChatSession` type.
2. Add `'history'` to the `view` union.
3. Add `sessions` and `activeSessionId` refs.
4. Handle `sessionsLoaded` and `sessionLoaded` in `handleExtensionMessage`.
5. Add `onLoadSession`, `onDeleteSession`, `onRenameSession` handlers.
6. Add ☰ button to chat-mode header.
7. Add history-mode header with ← Back.
8. Mount `HistoryView` when `view === 'history'`.

- [ ] **Step 1: Update script setup — imports and new state**

In `src/webview/App.vue`, in `<script setup>`, change:

```ts
import ChatMessage from "./components/ChatMessage.vue";
import InputBox from "./components/InputBox.vue";
import SettingsView from "./components/SettingsView.vue";
```

to:

```ts
import ChatMessage from "./components/ChatMessage.vue";
import InputBox from "./components/InputBox.vue";
import SettingsView from "./components/SettingsView.vue";
import HistoryView from "./components/HistoryView.vue";
import type { ChatSession } from "../config";
```

- [ ] **Step 2: Add ChatSession type locally and sessions refs**

In `src/webview/App.vue`, change:

```ts
// View state
const view = ref<"chat" | "settings">("chat");
```

to:

```ts
// View state
const view = ref<"chat" | "settings" | "history">("chat");
```

Then, after `const selectedModelIndex = ref<number | null>(null);`, add:

```ts
// Sessions state
const sessions = ref<ChatSession[]>([]);
const activeSessionId = ref<string | null>(null);
```

- [ ] **Step 3: Add session message handlers to handleExtensionMessage**

In `src/webview/App.vue`, in `handleExtensionMessage`, after the `case "clearChat":` block (before the closing `}`), add:

```ts
    case "sessionsLoaded":
      sessions.value = msg.sessions ?? [];
      activeSessionId.value = msg.activeSessionId ?? null;
      break;
    case "sessionLoaded": {
      // Full UI state reset on session load
      error.value = null;
      lastUsage.value = null;
      sessionTotal.value = { promptTokens: 0, completionTokens: 0 };
      isGenerating.value = false;
      withCodebase.value = false;
      codebaseFileCount.value = 0;
      codebaseWorkspaceName.value = "";
      codebaseError.value = null;
      messages.value = (msg.messages ?? []).map((m: { role: "user" | "assistant"; content: string; reasoning?: string }) => ({
        ...m,
        isStreaming: false,
      }));
      activeSessionId.value = msg.sessionId;
      scrollToBottom();
      break;
    }
```

- [ ] **Step 4: Add session action handlers**

In `src/webview/App.vue`, after the `onSaveSettings` function, add:

```ts
// Session handlers
function onLoadSession(id: string) {
  vscode.postMessage({ type: "loadSession", sessionId: id });
  view.value = "chat";
}

function onDeleteSession(id: string) {
  vscode.postMessage({ type: "deleteSession", sessionId: id });
}

function onRenameSession(id: string, title: string) {
  vscode.postMessage({ type: "renameSession", sessionId: id, title });
}
```

- [ ] **Step 5: Update the header template**

In `src/webview/App.vue`, in `<template>`, change the header block:

```html
    <!-- Header: always visible, two states -->
    <header class="header">
      <span class="header-title">GrokForge</span>
      <div class="header-actions">
        <template v-if="view === 'chat'">
          <button class="header-btn" @click="onNewChat">+ New Chat</button>
          <button
            class="header-btn"
            :class="{ highlighted: modelsReady && !hasModels }"
            @click="view = 'settings'"
          >⚙ Settings</button>
        </template>
        <template v-else>
          <button class="header-btn" @click="view = 'chat'">← Back</button>
        </template>
      </div>
    </header>
```

to:

```html
    <!-- Header: always visible, three states -->
    <header class="header">
      <span class="header-title">GrokForge</span>
      <div class="header-actions">
        <template v-if="view === 'chat'">
          <button class="header-btn" @click="view = 'history'" title="Chat history">☰</button>
          <button class="header-btn" @click="onNewChat">+ New</button>
          <button
            class="header-btn"
            :class="{ highlighted: modelsReady && !hasModels }"
            @click="view = 'settings'"
          >⚙</button>
        </template>
        <template v-else>
          <button class="header-btn" @click="view = 'chat'">← Back</button>
        </template>
      </div>
    </header>
```

- [ ] **Step 6: Mount HistoryView in template**

In `src/webview/App.vue`, in `<template>`, change the bottom of the template where `SettingsView` is mounted:

```html
    <!-- Settings view -->
    <SettingsView
      v-else
      :models="models"
      @save-settings="onSaveSettings"
      @back="view = 'chat'"
    />
```

to:

```html
    <!-- Settings view -->
    <SettingsView
      v-else-if="view === 'settings'"
      :models="models"
      @save-settings="onSaveSettings"
      @back="view = 'chat'"
    />

    <!-- History view -->
    <HistoryView
      v-else-if="view === 'history'"
      :sessions="sessions"
      :active-session-id="activeSessionId"
      @load-session="onLoadSession"
      @delete-session="onDeleteSession"
      @rename-session="onRenameSession"
      @back="view = 'chat'"
    />
```

Also update the `v-if` on the chat template block — change `<template v-if="view === 'chat'">` — it's already conditional via the `v-if`, but now that settings uses `v-else-if`, make sure the chat block still uses `v-if="view === 'chat'"`. The chat block already has this condition, so no change needed there.

- [ ] **Step 7: Build and verify**

```bash
cd /home/yurii/grok-forge && npm run compile
```

Expected: Build completes with no errors.

- [ ] **Step 8: Commit**

```bash
git add src/webview/App.vue
git commit -m "feat: wire up HistoryView and session state in App.vue"
```

---

## Verification

After all tasks are complete:

1. Run `npm run compile` — must succeed with no errors.
2. Press F5 in VS Code to launch the Extension Development Host.
3. Open the GrokForge sidebar panel.
4. **Style check**: Chat messages should render at 18px. Input textarea should be noticeably larger (3 rows, 16px font, 14px padding). Model select, @ button, and send button should all be larger.
5. **Chat area height**: On first open (no persisted height), chat area should occupy ~85% of the panel height (not ~60% as before).
6. **Session creation**: Send a message. Open the ☰ history panel. The session should appear with its title auto-set to the first 40 chars of the message.
7. **Session switching**: Send messages in multiple sessions. Switch between them via the history panel. Each session should restore its messages correctly.
8. **Inline rename**: Double-click a session title in the history panel. An input should appear. Edit and press Enter. The new title should persist.
9. **Delete session**: Click ✕ on a session. It should be removed. Deleting the active session should clear the chat.
10. **New Chat**: Press "+ New" button. The previous session should be saved. Starting a new message should create a new session.
11. **Persistence**: Close and reopen the VS Code window. The sessions should still be present.
