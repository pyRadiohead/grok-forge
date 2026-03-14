# UI & Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-API-key toolbar UI with a multi-model settings panel, a resizable chat area, an `@` codebase button, and a per-model dropdown — all as specified in the design doc.

**Architecture:** The extension host owns all sensitive data (API keys, file contents, model configs) and exposes them to the webview only through controlled message types. The webview is purely presentational: it sends `selectedModelIndex` with each message (not the API key itself) and the extension host assembles `RequestConfig`. Settings changes flow webview → extension host → `modelsLoaded` refresh.

**Tech Stack:** TypeScript (extension host, CommonJS), Vue 3 Composition API with `<script setup>` (webview, IIFE bundle), esbuild with esbuild-plugin-vue3, VS Code `SecretStorage` + `globalState`.

**Spec:** `docs/superpowers/specs/2026-03-14-ui-settings-redesign-design.md`

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/config.ts` | Modify | Export `ModelConfig` and `RequestConfig`; remove old types |
| `src/api/grok-client.ts` | Modify | Accept `RequestConfig` instead of `GrokConfig`; remove tools |
| `src/chat/message-handler.ts` | Modify | Updated message types; `HandlerContext` with `getRequestConfig`/`getCachedCodebase` |
| `src/chat/chat-provider.ts` | Modify | Model loading, codebase caching, settings persistence, chat height |
| `src/extension.ts` | Modify | Remove `setApiKey` command |
| `package.json` | Modify | Remove `setApiKey` from contributes.commands |
| `src/webview/components/SettingsView.vue` | **Create** | Model card list with add/remove/save; validation |
| `src/webview/components/InputBox.vue` | Modify | `@` chip flow, model dropdown, new props/emits |
| `src/webview/App.vue` | Modify | Header states, drag handle, settings routing, skeleton state |

---

## Chunk 1: Backend

### Task 1: Update `src/config.ts`

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: Replace file contents**

```ts
export interface ModelConfig {
  title: string;
  modelId: string;
  apiKey: string;         // "" if missing/unconfigured
  unconfigured?: boolean; // true when apiKey was absent/empty at load or save time
}

export interface RequestConfig {
  modelId: string;
  apiKey: string;
  store: false; // instructs xAI not to store conversation server-side; always false
}
```

- [ ] **Step 2: Verify compile fails on the right imports**

Run: `npm run compile 2>&1 | head -40`
Expected: Errors in `grok-client.ts`, `message-handler.ts`, `chat-provider.ts` referencing removed `GrokConfig` / `SINGLE_MODEL` / `MULTI_AGENT_MODEL`. That means config.ts itself compiled.

---

### Task 2: Update `src/api/grok-client.ts`

**Files:**
- Modify: `src/api/grok-client.ts`

- [ ] **Step 1: Replace imports and signature**

Change the top of the file:
```ts
import { RequestConfig } from "../config";
```
Remove the `GrokConfig` import line entirely.

- [ ] **Step 2: Update `chat` function signature and body**

Replace from `async function chat(` through the closing `};` of the body object (the `if (config.tools.length > 0)` block is removed entirely). Note the field rename: `config.model` → `config.modelId`.

```ts
async function chat(
  messages: ChatMessage[],
  config: RequestConfig,
  callbacks: StreamCallbacks,
  abortSignal?: AbortSignal
) {
  const body: Record<string, unknown> = {
    model: config.modelId,
    input: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
    store: config.store,
  };

  let response: Response;
```

Everything from `let response: Response;` to the end of the file remains unchanged.

- [ ] **Step 3: Verify compile**

Run: `npm run compile 2>&1; echo "Exit: $?"`
Expected: Exit code 0. No lines mentioning `grok-client.ts` in error output.

---

### Task 3: Rewrite `src/chat/message-handler.ts`

**Files:**
- Modify: `src/chat/message-handler.ts`

- [ ] **Step 1: Write new file**

```ts
import { RequestConfig } from "../config";
import { createGrokClient, ChatMessage } from "../api/grok-client";

export type WebviewMessage =
  | { type: "sendMessage"; text: string; withCodebase: boolean; selectedModelIndex: number }
  | { type: "stopGeneration" }
  | { type: "newChat" }
  | { type: "readCodebase" }
  | { type: "saveSettings"; models: Array<{ title: string; modelId: string; apiKey: string }> }
  | { type: "saveChatHeight"; height: number };

export interface HandlerContext {
  messages: ChatMessage[];
  abortController: AbortController | undefined;
  postMessage: (msg: unknown) => void;
  setAbortController: (ac: AbortController | undefined) => void;
  getRequestConfig: (index: number) => RequestConfig | null;
  getCachedCodebase: () => string | null;
}

export function handleMessage(msg: WebviewMessage, ctx: HandlerContext) {
  switch (msg.type) {
    case "sendMessage":
      return handleSend(msg.text, msg.withCodebase, msg.selectedModelIndex, ctx);
    case "stopGeneration":
      ctx.abortController?.abort();
      ctx.setAbortController(undefined);
      return;
    // newChat, readCodebase, saveSettings, saveChatHeight handled in chat-provider
  }
}

async function handleSend(
  text: string,
  withCodebase: boolean,
  selectedModelIndex: number,
  ctx: HandlerContext
) {
  const requestConfig = ctx.getRequestConfig(selectedModelIndex);
  if (!requestConfig) {
    ctx.postMessage({
      type: "error",
      message: "Invalid model selection. Please reload the panel.",
    });
    return;
  }

  let messageContent = text;
  if (withCodebase) {
    const codebaseText = ctx.getCachedCodebase();
    if (codebaseText) {
      messageContent = `Here is the current workspace codebase:\n\n${codebaseText}\n\n---\n\n${text}`;
    }
  }

  ctx.messages.push({ role: "user", content: messageContent });
  ctx.postMessage({ type: "userMessage", text }); // show original text, not the codebase blob

  const ac = new AbortController();
  ctx.setAbortController(ac);
  ctx.postMessage({ type: "assistantStart" });

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
    onError(error) {
      settled = true;
      // Spec §7: user message stays in history so the user can retry by resending.
      // Do NOT pop the user message here.
      ctx.postMessage({ type: "error", message: error.message });
      ctx.postMessage({ type: "assistantEnd" });
      ctx.setAbortController(undefined);
    },
  }, ac.signal);

  // Aborted path: client returns without calling onFinish or onError
  if (!settled) {
    ctx.messages.pop();
    if (accumulated) {
      ctx.messages.push({ role: "assistant", content: accumulated });
    }
    ctx.postMessage({ type: "assistantEnd" });
    ctx.setAbortController(undefined);
  }
}
```

- [ ] **Step 2: Verify compile**

Run: `npm run compile 2>&1; echo "Exit: $?"`
Expected: Exit code 0. No lines mentioning `message-handler.ts` in error output.

---

### Task 4: Rewrite `src/chat/chat-provider.ts`

**Files:**
- Modify: `src/chat/chat-provider.ts`

- [ ] **Step 1: Write new file**

```ts
import * as vscode from "vscode";
import { handleMessage, WebviewMessage } from "./message-handler";
import { ChatMessage } from "../api/grok-client";
import { ModelConfig, RequestConfig } from "../config";

const FILE_GLOB = "**/*.{ts,tsx,js,jsx,vue,py,go,rs,java,cs,cpp,c,h,md,css,scss,html,sh}";
const EXCLUDE_GLOB = "{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/.vscode/**,**/coverage/**,**/__pycache__/**,**/*.min.js,**/*.map,**/.env,**/.env.*,**/*.pem,**/*.key,**/*.p12,**/package-lock.json,**/yarn.lock,**/pnpm-lock.yaml}";
const MAX_FILES = 200;
const MAX_CHARS = 80_000;

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private messages: ChatMessage[] = [];
  private models: ModelConfig[] = [];
  private cachedCodebase: string | null = null;
  private abortController?: AbortController;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "dist"),
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
      ],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => this.onMessage(msg),
      undefined,
      this.context.subscriptions
    );

    this.loadAndSendModels();
  }

  newChat() {
    this.messages = [];
    this.cachedCodebase = null;
    this.abortController?.abort();
    this.abortController = undefined;
    this.postMessage({ type: "clearChat" });
  }

  getRequestConfig(index: number): RequestConfig | null {
    const model = this.models[index];
    if (!model) return null;
    return { modelId: model.modelId, apiKey: model.apiKey, store: false };
  }

  private async loadAndSendModels() {
    const storedHeight: number | undefined = this.context.globalState.get("grokforge.chatHeight");

    const timeoutHandle = setTimeout(() => {
      this.postMessage({ type: "modelsLoaded", models: [], chatHeight: storedHeight });
    }, 5000);

    try {
      const modelMeta: Array<{ title: string; modelId: string }> =
        this.context.globalState.get("grokforge.models") ?? [];

      const models: ModelConfig[] = await Promise.all(
        modelMeta.map(async (m, i) => {
          let apiKey = "";
          let unconfigured = false;
          try {
            const key = await this.context.secrets.get(`grokforge.apiKey.${i}`);
            if (key) {
              apiKey = key;
            } else {
              unconfigured = true;
            }
          } catch {
            unconfigured = true;
          }
          return { title: m.title, modelId: m.modelId, apiKey, unconfigured: unconfigured ? true : undefined };
        })
      );

      clearTimeout(timeoutHandle);
      this.models = models;
      this.postMessage({ type: "modelsLoaded", models, chatHeight: storedHeight });
    } catch {
      clearTimeout(timeoutHandle);
      this.postMessage({ type: "modelsLoaded", models: [], chatHeight: storedHeight });
    }
  }

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

  private async handleReadCodebase() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this.postMessage({ type: "codebaseError", message: "No workspace open." });
      return;
    }
    try {
      const { text, fileCount, workspaceName } = await this.readWorkspaceFiles();
      this.cachedCodebase = text || null;
      this.postMessage({ type: "codebaseReady", fileCount, workspaceName });
    } catch (err) {
      this.postMessage({
        type: "codebaseError",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async handleSaveSettings(
    incomingModels: Array<{ title: string; modelId: string; apiKey: string }>
  ) {
    const previousCount: number =
      (this.context.globalState.get<Array<unknown>>("grokforge.models") ?? []).length;
    const newCount = incomingModels.length;

    // 1. Write globalState first (minimises corruption window)
    await this.context.globalState.update(
      "grokforge.models",
      incomingModels.map(({ title, modelId }) => ({ title, modelId }))
    );

    // 2. Write API keys in display order
    for (let i = 0; i < newCount; i++) {
      await this.context.secrets.store(`grokforge.apiKey.${i}`, incomingModels[i].apiKey);
    }

    // 3. Delete orphaned tail keys
    for (let i = newCount; i < previousCount; i++) {
      await this.context.secrets.delete(`grokforge.apiKey.${i}`);
    }

    // 4. Reload and send updated model list to webview
    await this.loadAndSendModels();
  }

  private async readWorkspaceFiles(): Promise<{ text: string; fileCount: number; workspaceName: string }> {
    const folders = vscode.workspace.workspaceFolders!;
    const workspaceName = folders[0].name;
    const files = await vscode.workspace.findFiles(FILE_GLOB, EXCLUDE_GLOB, MAX_FILES);

    let total = 0;
    const parts: string[] = [];

    for (const file of files) {
      if (total >= MAX_CHARS) break;
      try {
        const bytes = await vscode.workspace.fs.readFile(file);
        const content = Buffer.from(bytes).toString("utf8");
        if (content.includes("\x00")) continue;
        const rel = vscode.workspace.asRelativePath(file);
        const entry = `\`\`\`${rel}\n${content}\n\`\`\``;
        if (total + entry.length > MAX_CHARS) break;
        parts.push(entry);
        total += entry.length;
      } catch {
        continue;
      }
    }

    return { text: parts.join("\n\n"), fileCount: parts.length, workspaceName };
  }

  private postMessage(msg: unknown) {
    this.view?.webview.postMessage(msg);
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.js")
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.css")
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline';">
  <link rel="stylesheet" href="${cssUri}">
  <title>GrokForge</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
```

- [ ] **Step 2: Verify compile**

Run: `npm run compile 2>&1; echo "Exit: $?"`
Expected: Exit code 0. No lines mentioning `chat-provider.ts` in error output.

---

### Task 5: Update `src/extension.ts` and `package.json`

**Files:**
- Modify: `src/extension.ts`
- Modify: `package.json`

- [ ] **Step 1: Remove `setApiKey` command from `extension.ts`**

Replace the full file with:
```ts
import * as vscode from "vscode";
import { ChatViewProvider } from "./chat/chat-provider";

export function activate(context: vscode.ExtensionContext) {
  const chatProvider = new ChatViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("grokforge.chat", chatProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),

    vscode.commands.registerCommand("grokforge.newChat", () => {
      chatProvider.newChat();
    })
  );
}

export function deactivate() {}
```

- [ ] **Step 2: Remove `setApiKey` from `package.json` contributes.commands**

In `package.json`, replace the `"commands"` array under `"contributes"` with:
```json
"commands": [
  {
    "command": "grokforge.newChat",
    "title": "GrokForge: New Chat"
  }
]
```

- [ ] **Step 3: Verify clean compile**

Run: `npm run compile 2>&1`
Expected: Zero errors. Output contains two build lines (extension + webview).

- [ ] **Step 4: Commit**

```bash
git add src/config.ts src/api/grok-client.ts src/chat/message-handler.ts src/chat/chat-provider.ts src/extension.ts package.json
git commit -m "refactor: replace GrokConfig with multi-model RequestConfig/ModelConfig

- config.ts: remove SINGLE_MODEL, MULTI_AGENT_MODEL, GrokConfig
- grok-client.ts: accept RequestConfig, remove tools
- message-handler.ts: new message types, getRequestConfig/getCachedCodebase context
- chat-provider.ts: model loading, codebase cache, settings persistence
- extension.ts + package.json: remove setApiKey command"
```

---

## Chunk 2: Frontend

### Task 6: Create `src/webview/components/SettingsView.vue`

**Files:**
- Create: `src/webview/components/SettingsView.vue`

- [ ] **Step 1: Create the file**

```vue
<script setup lang="ts">
import { ref, watch } from "vue";

interface ModelEntry {
  title: string;
  modelId: string;
  apiKey: string;
}

const props = defineProps<{
  models: ModelEntry[];
}>();

const emit = defineEmits<{
  saveSettings: [payload: { models: ModelEntry[] }];
  back: [];
}>();

// Deep-copy props into local editable state
const cards = ref<(ModelEntry & { titleError: boolean; modelIdError: boolean; apiKeyWarning: boolean })[]>([]);

watch(
  () => props.models,
  (incoming) => {
    cards.value = incoming.map((m) => ({
      ...m,
      titleError: false,
      modelIdError: false,
      apiKeyWarning: false,
    }));
  },
  { immediate: true }
);

function addModel() {
  cards.value.push({ title: "", modelId: "", apiKey: "", titleError: false, modelIdError: false, apiKeyWarning: false });
}

function removeModel(index: number) {
  cards.value.splice(index, 1);
}

function save() {
  let hasError = false;

  for (const card of cards.value) {
    card.titleError = card.title.trim() === "";
    card.modelIdError = card.modelId.trim() === "";
    card.apiKeyWarning = card.apiKey.trim() === "";
    if (card.titleError || card.modelIdError) hasError = true;
  }

  if (hasError) return;

  emit("saveSettings", {
    models: cards.value.map(({ title, modelId, apiKey }) => ({ title, modelId, apiKey })),
  });
}
</script>

<template>
  <div class="settings">
    <div class="section-header">
      <span class="section-label">Models</span>
      <button class="add-btn" @click="addModel">+ Add Model</button>
    </div>

    <div class="cards">
      <div
        v-for="(card, i) in cards"
        :key="i"
        class="card"
      >
        <div class="card-row card-title-row">
          <span class="field-label">Title</span>
          <button class="remove-btn" @click="removeModel(i)" title="Remove">✕</button>
        </div>
        <input
          v-model="card.title"
          :class="['field-input', { error: card.titleError }]"
          placeholder="Display name (e.g. Grok Reasoning)"
          @input="card.titleError = false"
        />

        <span class="field-label">Model ID</span>
        <input
          v-model="card.modelId"
          :class="['field-input', 'monospace', { error: card.modelIdError }]"
          placeholder="xAI model identifier"
          @input="card.modelIdError = false"
        />

        <span class="field-label">API Key</span>
        <input
          v-model="card.apiKey"
          type="password"
          :class="['field-input', 'monospace', { warning: card.apiKeyWarning }]"
          placeholder="xai-..."
          @input="card.apiKeyWarning = false"
        />
      </div>

      <div v-if="cards.length === 0" class="empty-cards">
        No models — click <strong>+ Add Model</strong> to add one.
      </div>
    </div>

    <div class="save-row">
      <button class="save-btn" @click="save">Save Settings</button>
    </div>
  </div>
</template>

<style scoped>
.settings {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  overflow-y: auto;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-label {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.add-btn {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  border-radius: 3px;
  padding: 3px 10px;
  font-size: 11px;
  cursor: pointer;
}
.add-btn:hover { background: var(--vscode-button-hoverBackground); }

.cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card {
  background: var(--vscode-sideBar-background, #252526);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 5px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.field-label {
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.field-input {
  width: 100%;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: 3px;
  padding: 5px 7px;
  font-size: 12px;
  font-family: var(--vscode-font-family);
  box-sizing: border-box;
}
.field-input:focus { outline: 1px solid var(--vscode-focusBorder); }
.field-input.monospace { font-family: var(--vscode-editor-font-family); font-size: 11px; }
.field-input.error { border-color: var(--vscode-inputValidation-errorBorder); }
.field-input.warning { border-color: var(--vscode-inputValidation-warningBorder); }

.remove-btn {
  background: none;
  border: none;
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}
.remove-btn:hover { color: var(--vscode-errorForeground); }

.empty-cards {
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  text-align: center;
  padding: 16px 0;
}

.save-row {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
}

.save-btn {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  border-radius: 3px;
  padding: 7px 18px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.save-btn:hover { background: var(--vscode-button-hoverBackground); }
</style>
```

- [ ] **Step 2: Verify compile**

Run: `npm run compile 2>&1 | grep -i "error"`
Expected: No errors

---

### Task 7: Rewrite `src/webview/components/InputBox.vue`

**Files:**
- Modify: `src/webview/components/InputBox.vue`

- [ ] **Step 1: Write new file**

```vue
<script setup lang="ts">
import { ref, computed } from "vue";

interface ModelMeta {
  title: string;
  unconfigured?: boolean;
}

const props = defineProps<{
  models: ModelMeta[];
  selectedModelIndex: number | null;
  withCodebase: boolean;
  fileCount: number;
  workspaceName: string;
  codebaseError: string | null;
  disabled: boolean;      // true when no models at all
  isGenerating: boolean;
}>();

const emit = defineEmits<{
  send: [payload: { text: string; withCodebase: boolean }];
  stop: [];
  attachCodebase: [];
  detachCodebase: [];
  modelChange: [index: number];
}>();

const text = ref("");

const selectedModel = computed(() =>
  props.selectedModelIndex !== null ? props.models[props.selectedModelIndex] : null
);

const sendDisabled = computed(() => {
  if (props.disabled || props.selectedModelIndex === null) return true;
  if (selectedModel.value?.unconfigured) return true;
  return !text.value.trim();
});

const textareaPlaceholder = computed(() => {
  if (props.disabled) return "No models configured";
  if (selectedModel.value?.unconfigured) return "API key missing — open Settings";
  return "Message Grok… (Shift+Enter for newline)";
});

function handleSubmit() {
  if (sendDisabled.value) return;
  emit("send", { text: text.value.trim(), withCodebase: props.withCodebase });
  text.value = "";
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSubmit();
  }
}

function onModelChange(e: Event) {
  const idx = Number((e.target as HTMLSelectElement).value);
  emit("modelChange", idx);
}
</script>

<template>
  <div class="input-zone">
    <!-- Context chip row -->
    <div v-if="withCodebase" class="chip-row">
      <span class="context-chip">
        @ {{ workspaceName }} ({{ fileCount }} files)
        <button class="chip-remove" @click="$emit('detachCodebase')" title="Detach codebase">×</button>
      </span>
    </div>

    <!-- Codebase error -->
    <div v-if="codebaseError" class="codebase-error">{{ codebaseError }}</div>

    <!-- Textarea -->
    <textarea
      v-model="text"
      @keydown="handleKeydown"
      :disabled="disabled || isGenerating"
      :placeholder="textareaPlaceholder"
      rows="2"
    />

    <!-- Controls row -->
    <div class="controls">
      <!-- Left: @ button -->
      <!-- Disabled only when no models (disabled prop) or codebase already attached (use × to detach).
           NOT disabled during generation — spec says no-op when chip shown, not disabled during streaming. -->
      <button
        class="at-btn"
        :disabled="disabled || withCodebase"
        @click="$emit('attachCodebase')"
        title="Attach codebase as context"
      >@</button>

      <span class="spacer" />

      <!-- Model dropdown -->
      <select
        v-if="models.length > 0"
        class="model-select"
        :value="selectedModelIndex ?? 0"
        @change="onModelChange"
        :disabled="isGenerating"
      >
        <option v-for="(m, i) in models" :key="i" :value="i">{{ m.title }}</option>
      </select>
      <select v-else class="model-select" disabled>
        <option>No models</option>
      </select>

      <!-- Send / Stop button -->
      <button
        v-if="isGenerating"
        class="stop-btn"
        @click="$emit('stop')"
      >■</button>
      <button
        v-else
        class="send-btn"
        :disabled="sendDisabled"
        @click="handleSubmit"
        title="Send"
      >↑</button>
    </div>
  </div>
</template>

<style scoped>
.input-zone {
  border-top: 1px solid var(--vscode-panel-border);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chip-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.context-chip {
  background: #1a3a1a;
  color: #4ec994;
  border: 1px solid #2d5a2d;
  border-radius: 12px;
  padding: 2px 8px;
  font-size: 10px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.chip-remove {
  background: none;
  border: none;
  color: #4ec994;
  cursor: pointer;
  padding: 0;
  font-size: 12px;
  line-height: 1;
}

.codebase-error {
  font-size: 11px;
  color: var(--vscode-errorForeground);
}

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
textarea:focus { outline: 1px solid var(--vscode-focusBorder); }
textarea:disabled { opacity: 0.6; }

.controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.spacer { flex: 1; }

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
.at-btn:hover:not(:disabled) { color: var(--vscode-foreground); }
.at-btn:disabled { opacity: 0.4; cursor: default; }

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
.model-select:disabled { opacity: 0.6; cursor: default; }

.send-btn, .stop-btn {
  border: none;
  border-radius: 4px;
  padding: 4px 13px;
  font-size: 13px;
  cursor: pointer;
  line-height: 1;
}
.send-btn {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}
.send-btn:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
.send-btn:disabled { opacity: 0.5; cursor: default; }

.stop-btn {
  background: var(--vscode-errorForeground);
  color: var(--vscode-editor-background);
}
</style>
```

- [ ] **Step 2: Verify compile**

Run: `npm run compile 2>&1 | grep -i "error"`
Expected: No errors

---

### Task 8: Rewrite `src/webview/App.vue`

**Files:**
- Modify: `src/webview/App.vue`

- [ ] **Step 1: Write new file**

```vue
<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from "vue";
import ChatMessage from "./components/ChatMessage.vue";
import InputBox from "./components/InputBox.vue";
import SettingsView from "./components/SettingsView.vue";

interface ModelConfig {
  title: string;
  modelId: string;
  apiKey: string;
  unconfigured?: boolean;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  isStreaming?: boolean;
}

interface Usage {
  promptTokens: number;
  completionTokens: number;
}

const vscode = acquireVsCodeApi();

// View state
const view = ref<"chat" | "settings">("chat");
const modelsReady = ref(false);
const models = ref<ModelConfig[]>([]);
const selectedModelIndex = ref<number | null>(null);

// Chat state
const messages = ref<Message[]>([]);
const isGenerating = ref(false);
const error = ref<string | null>(null);
const lastUsage = ref<Usage | null>(null);
const sessionTotal = ref<Usage>({ promptTokens: 0, completionTokens: 0 });

// Codebase state (owned by App, reflected in InputBox via props)
const withCodebase = ref(false);
const codebaseFileCount = ref(0);
const codebaseWorkspaceName = ref("");
const codebaseError = ref<string | null>(null);

// Drag handle
const chatContainer = ref<HTMLElement | null>(null);
const panelContainer = ref<HTMLElement | null>(null);
const chatHeightPx = ref(0);
const isDragging = ref(false);
let dragStartY = 0;
let dragStartHeight = 0;
let resizeObserver: ResizeObserver | null = null;

// Derived
const hasModels = computed(() => modelsReady.value && models.value.length > 0);

const showDragHandle = computed(() => {
  const panel = panelContainer.value;
  if (!panel) return false;
  return hasModels.value && panel.offsetHeight >= 260;
});

function clampHeight(h: number): number {
  const panel = panelContainer.value;
  if (!panel) return h;
  const min = 120;
  const max = panel.offsetHeight - 140;
  if (max < min) return h; // panel too small — don't clamp
  return Math.min(max, Math.max(min, h));
}

function applyHeight(h: number) {
  const clamped = clampHeight(h);
  chatHeightPx.value = clamped;
  return clamped;
}

// Drag handle logic
function onDragStart(e: MouseEvent) {
  isDragging.value = true;
  dragStartY = e.clientY;
  dragStartHeight = chatHeightPx.value;
  document.addEventListener("mousemove", onDragMove);
  document.addEventListener("mouseup", onDragEnd);
  e.preventDefault();
}

function onDragMove(e: MouseEvent) {
  if (!isDragging.value) return;
  const delta = e.clientY - dragStartY;
  applyHeight(dragStartHeight + delta);
}

function onDragEnd() {
  isDragging.value = false;
  document.removeEventListener("mousemove", onDragMove);
  document.removeEventListener("mouseup", onDragEnd);
  // Persist final height
  vscode.postMessage({ type: "saveChatHeight", height: chatHeightPx.value });
}

function scrollToBottom() {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
    }
  });
}

// Header actions
function onNewChat() {
  vscode.postMessage({ type: "newChat" });
}

// Input zone handlers
function onSend(payload: { text: string; withCodebase: boolean }) {
  error.value = null;
  codebaseError.value = null;
  vscode.postMessage({
    type: "sendMessage",
    text: payload.text,
    withCodebase: payload.withCodebase,
    selectedModelIndex: selectedModelIndex.value ?? 0,
  });
}

function onAttachCodebase() {
  codebaseError.value = null;
  vscode.postMessage({ type: "readCodebase" });
}

function onDetachCodebase() {
  withCodebase.value = false;
  codebaseFileCount.value = 0;
  codebaseWorkspaceName.value = "";
}

function onModelChange(index: number) {
  selectedModelIndex.value = index;
}

// Settings handlers
function onSaveSettings(payload: { models: Array<{ title: string; modelId: string; apiKey: string }> }) {
  vscode.postMessage({ type: "saveSettings", models: payload.models });
  view.value = "chat";
}

// Message handler from extension host
function handleExtensionMessage(event: MessageEvent) {
  const msg = event.data;
  switch (msg.type) {
    case "modelsLoaded": {
      models.value = msg.models ?? [];
      modelsReady.value = true;
      selectedModelIndex.value = models.value.length > 0 ? 0 : null;
      // Apply persisted chat height
      if (msg.chatHeight !== undefined) {
        nextTick(() => {
          const clamped = applyHeight(msg.chatHeight);
          if (clamped !== msg.chatHeight) {
            vscode.postMessage({ type: "saveChatHeight", height: clamped });
          }
        });
      } else {
        nextTick(() => {
          const panel = panelContainer.value;
          if (panel) applyHeight(Math.floor(panel.offsetHeight * 0.6));
        });
      }
      break;
    }
    case "codebaseReady":
      withCodebase.value = true;
      codebaseFileCount.value = msg.fileCount;
      codebaseWorkspaceName.value = msg.workspaceName;
      break;
    case "codebaseError":
      codebaseError.value = msg.message;
      break;
    case "userMessage":
      messages.value.push({ role: "user", content: msg.text });
      scrollToBottom();
      break;
    case "assistantStart":
      isGenerating.value = true;
      messages.value.push({ role: "assistant", content: "", reasoning: "", isStreaming: true });
      scrollToBottom();
      break;
    case "assistantDelta": {
      const last = messages.value[messages.value.length - 1];
      if (last?.role === "assistant") last.content += msg.delta;
      scrollToBottom();
      break;
    }
    case "reasoningDelta": {
      const last = messages.value[messages.value.length - 1];
      if (last?.role === "assistant") last.reasoning = (last.reasoning || "") + msg.delta;
      scrollToBottom();
      break;
    }
    case "assistantEnd": {
      const last = messages.value[messages.value.length - 1];
      if (last) last.isStreaming = false;
      isGenerating.value = false;
      if (msg.usage) {
        lastUsage.value = msg.usage;
        sessionTotal.value.promptTokens += msg.usage.promptTokens;
        sessionTotal.value.completionTokens += msg.usage.completionTokens;
      }
      break;
    }
    case "error":
      error.value = msg.message;
      isGenerating.value = false;
      break;
    case "clearChat":
      messages.value = [];
      error.value = null;
      lastUsage.value = null;
      sessionTotal.value = { promptTokens: 0, completionTokens: 0 };
      withCodebase.value = false;
      codebaseFileCount.value = 0;
      codebaseError.value = null;
      break;
  }
}

onMounted(() => {
  window.addEventListener("message", handleExtensionMessage);

  // Set up ResizeObserver to re-clamp on panel resize
  if (panelContainer.value) {
    resizeObserver = new ResizeObserver(() => {
      if (chatHeightPx.value > 0) {
        const clamped = applyHeight(chatHeightPx.value);
        vscode.postMessage({ type: "saveChatHeight", height: clamped });
      }
    });
    resizeObserver.observe(panelContainer.value);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("message", handleExtensionMessage);
  resizeObserver?.disconnect();
  document.removeEventListener("mousemove", onDragMove);
  document.removeEventListener("mouseup", onDragEnd);
});
</script>

<template>
  <div class="app" ref="panelContainer">

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

    <!-- Chat view -->
    <template v-if="view === 'chat'">

      <!-- Loading skeleton -->
      <div v-if="!modelsReady" class="skeleton">
        <div class="skeleton-line" />
        <div class="skeleton-line short" />
      </div>

      <template v-else>
        <!-- Chat container (resizable) -->
        <div
          ref="chatContainer"
          class="chat-container"
          :style="hasModels ? { height: chatHeightPx + 'px' } : { flex: '1' }"
        >
          <!-- No-models message -->
          <div v-if="!hasModels" class="no-models">
            No models configured — add one in ⚙ Settings.
          </div>

          <!-- Message list -->
          <template v-else>
            <div v-if="messages.length === 0" class="empty-state">
              Send a message to start chatting with Grok.
            </div>
            <ChatMessage
              v-for="(msg, i) in messages"
              :key="i"
              :message="msg"
            />
            <div v-if="error" class="error">{{ error }}</div>
          </template>
        </div>

        <!-- Drag handle: only when models exist and panel is tall enough -->
        <div
          v-if="showDragHandle"
          class="drag-handle"
          @mousedown="onDragStart"
          title="Drag to resize"
        >
          <span class="drag-dots">• • •</span>
        </div>

        <!-- Token usage bar: only when models exist -->
        <div v-if="hasModels" class="token-bar">
          <template v-if="lastUsage">
            ↑{{ lastUsage.promptTokens.toLocaleString() }}
            ↓{{ lastUsage.completionTokens.toLocaleString() }} tokens
            <span class="token-total">
              (total: {{ (sessionTotal.promptTokens + sessionTotal.completionTokens).toLocaleString() }})
            </span>
          </template>
        </div>

        <!-- Input zone -->
        <InputBox
          :models="models"
          :selected-model-index="selectedModelIndex"
          :with-codebase="withCodebase"
          :file-count="codebaseFileCount"
          :workspace-name="codebaseWorkspaceName"
          :codebase-error="codebaseError"
          :disabled="!hasModels"
          :is-generating="isGenerating"
          @send="onSend"
          @stop="() => vscode.postMessage({ type: 'stopGeneration' })"
          @attach-codebase="onAttachCodebase"
          @detach-codebase="onDetachCodebase"
          @model-change="onModelChange"
        />
      </template>
    </template>

    <!-- Settings view -->
    <SettingsView
      v-else
      :models="models"
      @save-settings="onSaveSettings"
      @back="view = 'chat'"
    />

  </div>
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
}
</style>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* Header */
.header {
  background: #000;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  flex-shrink: 0;
}
.header-title {
  font-weight: 700;
  font-size: 14px;
  color: #fff;
}
.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}
.header-btn {
  background: none;
  border: none;
  color: #aaa;
  font-size: 13px;
  cursor: pointer;
  padding: 0;
}
.header-btn:hover { color: #fff; }
.header-btn.highlighted { color: var(--vscode-button-background, #0078d4); }

/* Chat container */
.chat-container {
  overflow-y: auto;
  padding: 8px;
  flex-shrink: 0;
}

/* Drag handle */
.drag-handle {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 12px;
  border-top: 1px solid var(--vscode-panel-border);
  cursor: ns-resize;
  flex-shrink: 0;
  user-select: none;
}
.drag-dots {
  color: #444;
  font-size: 9px;
  letter-spacing: 3px;
}

/* Token bar */
.token-bar {
  padding: 2px 12px;
  display: flex;
  justify-content: flex-end;
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
  flex-shrink: 0;
}
.token-total { opacity: 0.7; }

/* States */
.skeleton {
  flex: 1;
  padding: 20px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.skeleton-line {
  height: 12px;
  background: var(--vscode-input-background);
  border-radius: 4px;
  opacity: 0.4;
  animation: shimmer 1.2s infinite;
}
.skeleton-line.short { width: 60%; }

@keyframes shimmer {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.6; }
}

.no-models {
  color: var(--vscode-descriptionForeground);
  font-size: 13px;
  text-align: center;
  padding: 30px 20px;
  line-height: 1.5;
}

.empty-state {
  color: var(--vscode-descriptionForeground);
  text-align: center;
  margin-top: 30px;
  font-size: 13px;
}

.error {
  color: var(--vscode-errorForeground);
  background: var(--vscode-inputValidation-errorBackground);
  border: 1px solid var(--vscode-inputValidation-errorBorder);
  padding: 6px 10px;
  border-radius: 4px;
  margin: 6px 0;
  font-size: 12px;
}
</style>
```

- [ ] **Step 2: Verify compile**

Run: `npm run compile 2>&1`
Expected: Zero errors. Two build lines output.

- [ ] **Step 3: Manual smoke test**

Launch the extension: Press `F5` in VS Code (opens Extension Development Host).

Verify:
1. Panel opens with a loading skeleton briefly, then shows "No models configured — add one in ⚙ Settings." with the settings button highlighted
2. Click "⚙ Settings" → settings panel opens with header showing "← Back" and "Settings" (GrokForge title on left)
3. Click "+ Add Model" → a model card appears with Title, Model ID, API Key fields
4. Fill in Title, Model ID; leave API Key blank → click "Save Settings" → yellow border on API Key field, but save still proceeds and settings panel closes
5. Chat view shows model in dropdown; send button is disabled; textarea shows placeholder "API key missing — open Settings" (confirms unconfigured state)
6. Go back to settings → fill in a real API Key → Save → chat view, send button now enabled
7. Type a message → send → streaming response appears
8. "@ button" → clicking it sends `readCodebase` → green chip appears (if workspace open)
9. Drag the `• • •` handle → chat area resizes
10. "New Chat" button → chat clears

- [ ] **Step 4: Commit**

```bash
git add src/webview/components/SettingsView.vue src/webview/components/InputBox.vue src/webview/App.vue
git commit -m "feat: UI & settings redesign — multi-model panel, resizable chat, @ codebase

- SettingsView.vue: model card list with title/modelId/apiKey fields, validation
- InputBox.vue: @ button with codebase chip, model dropdown, icon send/stop
- App.vue: header states, drag-to-resize chat, skeleton load, no-models state"
```

---

## Final Verification

- [ ] Run `npm run compile` — zero errors
- [ ] Run `npm run lint` — no new lint errors
- [ ] Manual end-to-end: add model → send message → streaming works → @ codebase → settings round-trip preserves keys
