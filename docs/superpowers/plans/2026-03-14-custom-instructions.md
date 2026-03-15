# Custom Instructions Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a layered custom-instructions system (global baseline + per-model override) that injects a `{ role: "system" }` message at the head of every API request, with a template library and a polished Settings UI.

**Architecture:** Two-layer assembly: a `globalInstructions` string (persisted in `globalState`) is concatenated with a per-model `instructions` string (persisted alongside `title`/`modelId` in `globalState`), producing an optional `systemPrompt` on `RequestConfig` that `grok-client.ts` prepends to the `input` array. The Settings UI exposes both layers with a shared template dropdown.

**Tech Stack:** TypeScript (extension host), Vue 3 Composition API with `<script setup>` (webview), VS Code `globalState` for persistence, VS Code `secrets` for API keys (unchanged).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/config.ts` | Modify | Add `instructions?` to `ModelConfig`; add `systemPrompt?` to `RequestConfig` |
| `src/webview/prompts.ts` | **Create** | Export `TEMPLATES` constant — 6 built-in instruction templates |
| `src/api/grok-client.ts` | Modify | Prepend `{ role: "system" }` item to `input` when `config.systemPrompt` is set |
| `src/chat/message-handler.ts` | Modify | Extend `saveSettings` WebviewMessage type with `globalInstructions` + per-model `instructions` |
| `src/chat/chat-provider.ts` | Modify | `globalInstructions` instance field; load/refresh lifecycle; `getRequestConfig` assembly; `modelsLoaded` delivery; `handleSaveSettings` persistence |
| `src/webview/components/SettingsView.vue` | Modify | Global instructions textarea + template dropdown (top); per-model collapsible instructions textarea + template dropdown (inside each card) |
| `src/webview/App.vue` | Modify | `globalInstructions` ref; populate from `modelsLoaded`; pass to `SettingsView`; include in `saveSettings` postMessage |

---

## Chunk 1: Types, Templates, API Injection

### Task 1: Extend `src/config.ts` interfaces

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: Open `src/config.ts` and add `instructions?` to `ModelConfig`**

  Replace the `ModelConfig` interface (currently ends at line 6) with:

  ```ts
  export interface ModelConfig {
    title: string;
    modelId: string;
    apiKey: string;         // "" if missing/unconfigured
    unconfigured?: boolean; // true when apiKey was absent/empty at load or save time
    instructions?: string;  // per-model system prompt override, loaded from globalState
  }
  ```

- [ ] **Step 2: Add `systemPrompt?` to `RequestConfig`**

  Replace the `RequestConfig` interface (lines 8-13) with:

  ```ts
  export interface RequestConfig {
    modelId: string;
    apiKey: string;
    store: false; // instructs xAI not to store conversation server-side; always false
    tools?: string[]; // server-side tool names: web_search, x_search, code_execution
    systemPrompt?: string; // assembled: global + model-specific; undefined if both empty
  }
  ```

- [ ] **Step 3: Verify the build passes**

  ```bash
  cd /home/yurii/grok-forge && npm run compile
  ```

  Expected: no TypeScript errors, `dist/extension.js` and `dist/webview.js` produced.

- [ ] **Step 4: Commit**

  ```bash
  cd /home/yurii/grok-forge
  git add src/config.ts
  git commit -m "feat: add instructions field to ModelConfig and systemPrompt to RequestConfig"
  ```

---

### Task 2: Create `src/webview/prompts.ts` — template library

**Files:**
- Create: `src/webview/prompts.ts`

- [ ] **Step 1: Create the file with all 6 templates**

  This file is imported by `SettingsView.vue` only — do not import it from extension-host code.

  ```ts
  // src/webview/prompts.ts
  // Built-in instruction templates. Selecting one replaces the active textarea content.
  // Ctrl+Z (DOM undo history) restores prior text because Vue v-model preserves it.

  export interface Template {
    name: string;
    content: string;
  }

  export const TEMPLATES: Template[] = [
    {
      name: "Coding assistant",
      content: `You are a senior software engineer. Write clean, idiomatic, well-structured code.
  Before answering, think through the problem. If the request is ambiguous, ask one clarifying question before proceeding.
  Prefer editing existing patterns over introducing new abstractions. YAGNI.
  When reviewing code, cite specific lines and explain the why, not just the what.`,
    },
    {
      name: "Multi-agent deep researcher",
      content: `You are a multi-agent research system. For every non-trivial task:
  1. Decompose into independent subtasks that can be investigated in parallel.
  2. Assign each subtask to a focused sub-agent with a clear, narrow scope.
  3. Each sub-agent must use web_search or x_search to ground its findings in current sources.
  4. After sub-agents complete, synthesize results: identify agreements, conflicts, and gaps.
  5. Produce a final answer with source attribution per claim.

  For simple factual questions, respond directly without decomposition.
  Always show your reasoning and which sub-agent contributed each key finding.`,
    },
    {
      name: "Deep researcher",
      content: `You are a thorough research assistant. Use web_search to verify facts before asserting them.
  Cite sources inline. When sources conflict, present both perspectives and explain the discrepancy.
  Structure your responses: summary first, then detailed findings, then caveats.`,
    },
    {
      name: "Code reviewer",
      content: `You are an expert code reviewer. For every review:
  - Security: flag injection risks, secret exposure, unvalidated input.
  - Correctness: identify logic errors, edge cases, off-by-one issues.
  - Performance: note O(n²) patterns, unnecessary allocations, blocking I/O.
  - Maintainability: flag unclear naming, missing error handling, violations of single responsibility.
  Be specific: reference line numbers and explain the risk, not just the symptom.`,
    },
    {
      name: "Concise assistant",
      content: `Be direct and concise. No preamble, no summaries of what you just said.
  Lead with the answer, then add context only if essential.
  Use bullet points for lists. Skip pleasantries.`,
    },
    {
      name: "Multi-agent investigator",
      content: `You are a multi-agent investigator. When given a complex problem:
  1. Identify 3–5 distinct angles to investigate (technical, contextual, historical, contrarian, practical).
  2. Assign one sub-agent per angle. Each must independently research its angle using web_search.
  3. Sub-agents must not assume — every claim needs a source or "unverified".
  4. Synthesize: produce a structured brief with sections per angle, then a unified conclusion.
  5. Flag the top 1–2 unresolved questions that would most change the conclusion.`,
    },
  ];
  ```

- [ ] **Step 2: Verify the build passes**

  ```bash
  cd /home/yurii/grok-forge && npm run compile
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  cd /home/yurii/grok-forge
  git add src/webview/prompts.ts
  git commit -m "feat: add template library to src/webview/prompts.ts"
  ```

---

### Task 3: Inject system prompt in `src/api/grok-client.ts`

**Files:**
- Modify: `src/api/grok-client.ts:25-31`

- [ ] **Step 1: Replace the `body` initialization block in `chat()` (lines 25-30)**

  Current code:

  ```ts
  const body: Record<string, unknown> = {
    model: config.modelId,
    input: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
    store: config.store,
  };
  ```

  Replace with:

  ```ts
  const inputMessages = messages.map((m) => ({ role: m.role, content: m.content }));
  const input = config.systemPrompt
    ? [{ role: "system", content: config.systemPrompt }, ...inputMessages]
    : inputMessages;

  const body: Record<string, unknown> = {
    model: config.modelId,
    input,
    stream: true,
    store: config.store,
  };
  ```

  Both branches of `input` now produce plain `{ role, content }` objects with a consistent element type. The xAI Responses API accepts `role: "system"` as the first input item (OpenAI-compatible format).

- [ ] **Step 2: Verify the build passes**

  ```bash
  cd /home/yurii/grok-forge && npm run compile
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  cd /home/yurii/grok-forge
  git add src/api/grok-client.ts
  git commit -m "feat: prepend system message to input when systemPrompt is set"
  ```

---

### Task 4: Extend `saveSettings` message type in `src/chat/message-handler.ts`

**Files:**
- Modify: `src/chat/message-handler.ts:9`

- [ ] **Step 1: Update the `saveSettings` union member**

  Current line 9:

  ```ts
  | { type: "saveSettings"; models: Array<{ title: string; modelId: string; apiKey: string }> }
  ```

  Replace with:

  ```ts
  | { type: "saveSettings"; globalInstructions: string; models: Array<{ title: string; modelId: string; apiKey: string; instructions: string }> }
  ```

  > **Important:** This task is a type-union update only. The `saveSettings` case is **dispatched** in `chat-provider.ts:143-144` — `message-handler.ts` does **not** contain the handler body (see comment at line 33). After this type change, `npm run compile` will produce a TypeScript error in `chat-provider.ts` because `handleSaveSettings` still accepts the old signature. **Do not run the build check here.** The build will be verified green at the end of Task 5, which updates the handler to match.

- [ ] **Step 2: Commit (build check deferred to Task 5)**

  ```bash
  cd /home/yurii/grok-forge
  git add src/chat/message-handler.ts
  git commit -m "feat: extend saveSettings message type with globalInstructions and per-model instructions"
  ```

---

## Chunk 2: Provider Wiring and Settings UI

### Task 5: Wire `globalInstructions` in `src/chat/chat-provider.ts`

**Files:**
- Modify: `src/chat/chat-provider.ts`

This task has 4 sub-changes. Make them all, then compile once at the end.

- [ ] **Step 1: Add `globalInstructions` instance field and `buildSystemPrompt` helper**

  After line 18 (`private activeSessionId: string | undefined = undefined;`), add:

  ```ts
  private globalInstructions = "";
  ```

  After the closing `}` of the class (after line 377, before the `getNonce` function at line 379), add this free function:

  ```ts
  function buildSystemPrompt(global: string, modelSpecific: string): string | null {
    const parts = [global, modelSpecific].map(s => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts.join("\n\n") : null;
  }
  ```

- [ ] **Step 2: Load `globalInstructions` from `globalState` on startup**

  In `loadAndSendModels()`, at line 95 (after `const storedHeight...`), add:

  ```ts
  // Load globalInstructions once per startup (refreshed after save)
  this.globalInstructions = this.context.globalState.get<string>("grokforge.globalInstructions") ?? "";
  ```

  Also update the `modelMeta` type annotation at line 103 to carry `instructions`:

  ```ts
  const modelMeta: Array<{ title: string; modelId: string; instructions?: string }> =
    this.context.globalState.get("grokforge.models") ?? [];
  ```

  And update the `return` inside `modelMeta.map` (line 120) to include `instructions`:

  ```ts
  return { title: m.title, modelId: m.modelId, apiKey, unconfigured: unconfigured ? true : undefined, instructions: m.instructions };
  ```

- [ ] **Step 3: Include `globalInstructions` in the `modelsLoaded` message**

  There are three `postMessage` calls that send `modelsLoaded` — at lines 98, 126, and 131. Update all three:

  Line 98 (timeout fallback):
  ```ts
  this.postMessage({ type: "modelsLoaded", models: [], chatHeight: storedHeight, globalInstructions: this.globalInstructions });
  ```

  Line 126 (success path):
  ```ts
  this.postMessage({ type: "modelsLoaded", models, chatHeight: storedHeight, globalInstructions: this.globalInstructions });
  ```

  Line 131 (catch fallback):
  ```ts
  this.postMessage({ type: "modelsLoaded", models: [], chatHeight: storedHeight, globalInstructions: this.globalInstructions });
  ```

- [ ] **Step 4: Update `getRequestConfig` to assemble `systemPrompt`**

  Replace lines 88-92:

  ```ts
  getRequestConfig(index: number): RequestConfig | null {
    const model = this.models[index];
    if (!model) return null;
    return { modelId: model.modelId, apiKey: model.apiKey, store: false };
  }
  ```

  With:

  ```ts
  getRequestConfig(index: number): RequestConfig | null {
    const model = this.models[index];
    if (!model) return null;
    const assembled = buildSystemPrompt(this.globalInstructions, model.instructions ?? "");
    const systemPrompt = assembled ?? undefined;
    return { modelId: model.modelId, apiKey: model.apiKey, store: false, systemPrompt };
  }
  ```

- [ ] **Step 5: Update `handleSaveSettings` to persist `globalInstructions` and per-model `instructions`**

  Replace the entire `handleSaveSettings` method (lines 219-243) with:

  ```ts
  private async handleSaveSettings(
    globalInstructions: string,
    incomingModels: Array<{ title: string; modelId: string; apiKey: string; instructions: string }>
  ) {
    const previousCount: number =
      (this.context.globalState.get<Array<unknown>>("grokforge.models") ?? []).length;
    const newCount = incomingModels.length;

    // 1. Persist globalInstructions
    await this.context.globalState.update("grokforge.globalInstructions", globalInstructions);
    this.globalInstructions = globalInstructions;

    // 2. Write globalState (title + modelId + instructions — no API keys here)
    await this.context.globalState.update(
      "grokforge.models",
      incomingModels.map(({ title, modelId, instructions }) => ({ title, modelId, instructions }))
    );

    // 3. Write API keys in display order
    for (let i = 0; i < newCount; i++) {
      await this.context.secrets.store(`grokforge.apiKey.${i}`, incomingModels[i].apiKey);
    }

    // 4. Delete orphaned tail keys
    for (let i = newCount; i < previousCount; i++) {
      await this.context.secrets.delete(`grokforge.apiKey.${i}`);
    }

    // 5. Reload and send updated model list to webview
    await this.loadAndSendModels();
  }
  ```

  Also update the `case "saveSettings"` dispatch at lines 143-144 to pass both new arguments:

  ```ts
  case "saveSettings":
    await this.handleSaveSettings(msg.globalInstructions, msg.models);
    return;
  ```

- [ ] **Step 6: Verify the full build passes**

  ```bash
  cd /home/yurii/grok-forge && npm run compile
  ```

  Expected: no TypeScript errors. If there are errors, read them carefully — they will point to exact lines.

- [ ] **Step 7: Commit**

  ```bash
  cd /home/yurii/grok-forge
  git add src/chat/chat-provider.ts
  git commit -m "feat: wire globalInstructions lifecycle in chat-provider — load, persist, assemble, deliver"
  ```

---

### Task 6: Update `src/webview/components/SettingsView.vue`

**Files:**
- Modify: `src/webview/components/SettingsView.vue`

This is the most involved UI change. Read the current file carefully before editing.

- [ ] **Step 1: Update the `<script setup>` — add imports, props, and new state**

  Replace the entire `<script setup>` block (lines 1-59) with:

  ```vue
  <script setup lang="ts">
  import { ref, watch } from "vue";
  import { TEMPLATES } from "../prompts";

  interface ModelEntry {
    title: string;
    modelId: string;
    apiKey: string;
    instructions?: string;
  }

  const props = defineProps<{
    models: ModelEntry[];
    globalInstructions: string;
  }>();

  const emit = defineEmits<{
    saveSettings: [payload: { globalInstructions: string; models: Array<{ title: string; modelId: string; apiKey: string; instructions: string }> }];
    back: [];
  }>();

  // Global instructions local state (initialised from prop on mount)
  const globalInstructions = ref(props.globalInstructions);

  // Per-model cards local state
  interface CardEntry extends ModelEntry {
    titleError: boolean;
    modelIdError: boolean;
    apiKeyWarning: boolean;
    instructionsOpen: boolean; // whether the per-model instructions section is expanded
  }

  const cards = ref<CardEntry[]>([]);

  watch(
    () => props.models,
    (incoming) => {
      cards.value = incoming.map((m) => ({
        ...m,
        instructions: m.instructions ?? "",
        titleError: false,
        modelIdError: false,
        apiKeyWarning: false,
        instructionsOpen: false,
      }));
    },
    { immediate: true }
  );

  // Also sync globalInstructions prop → local ref (e.g. if settings opened twice)
  watch(() => props.globalInstructions, (v) => { globalInstructions.value = v; });

  function addModel() {
    cards.value.push({
      title: "", modelId: "", apiKey: "", instructions: "",
      titleError: false, modelIdError: false, apiKeyWarning: false, instructionsOpen: false,
    });
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
      globalInstructions: globalInstructions.value,
      models: cards.value.map(({ title, modelId, apiKey, instructions }) => ({
        title, modelId, apiKey, instructions: instructions ?? "",
      })),
    });
  }
  </script>
  ```

- [ ] **Step 2: Replace the `<template>` block**

  Replace the entire `<template>` block (lines 61-112) with:

  ```vue
  <template>
    <div class="settings">

      <!-- Global instructions section -->
      <div class="global-instructions">
        <div class="section-header">
          <span class="section-label">Custom Instructions (Global)</span>
          <select
            class="template-select"
            @change="(e) => { globalInstructions = TEMPLATES[Number((e.target as HTMLSelectElement).value)].content; (e.target as HTMLSelectElement).value = ''; }"
          >
            <option value="" disabled selected>Load template…</option>
            <option v-for="(t, i) in TEMPLATES" :key="i" :value="i">{{ t.name }}</option>
          </select>
        </div>
        <textarea
          v-model="globalInstructions"
          class="instructions-textarea"
          rows="5"
          placeholder="Applied to every conversation across all models."
        />
      </div>

      <!-- Model list section -->
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

          <!-- Per-model instructions (collapsible) -->
          <button
            class="instructions-toggle"
            @click="card.instructionsOpen = !card.instructionsOpen"
          >
            {{ card.instructionsOpen ? '▼' : '▶' }} Model-specific instructions
          </button>
          <div v-if="card.instructionsOpen" class="per-model-instructions">
            <div class="per-model-header">
              <span class="field-label">Appended after global instructions.</span>
              <select
                class="template-select"
                @change="(e) => { card.instructions = TEMPLATES[Number((e.target as HTMLSelectElement).value)].content; (e.target as HTMLSelectElement).value = ''; }"
              >
                <option value="" disabled selected>Load template…</option>
                <option v-for="(t, j) in TEMPLATES" :key="j" :value="j">{{ t.name }}</option>
              </select>
            </div>
            <textarea
              v-model="card.instructions"
              class="instructions-textarea"
              rows="4"
              placeholder="Appended after global instructions."
            />
          </div>
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
  ```

  > **Vue ref note:** In `<script setup>` templates, `ref` values are automatically unwrapped — `v-model="globalInstructions"` binds to the string value of the ref, and `globalInstructions = '...'` in an event handler correctly calls `.value` assignment. Do NOT use `v-model="globalInstructions.value"` — that would bind to `undefined` since template auto-unwrapping has already resolved `globalInstructions` to a string.

- [ ] **Step 3: Append new CSS rules to the `<style scoped>` block**

  Add the following styles to the end of the existing `<style scoped>` block (before the closing `</style>`):

  ```css
  .global-instructions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 5px;
    padding: 10px;
    background: var(--vscode-sideBar-background, #252526);
  }

  .instructions-textarea {
    width: 100%;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 3px;
    padding: 6px 8px;
    font-family: var(--vscode-font-family);
    font-size: 12px;
    resize: vertical;
    box-sizing: border-box;
  }
  .instructions-textarea:focus { outline: 1px solid var(--vscode-focusBorder); }

  .template-select {
    background: var(--vscode-dropdown-background, #252526);
    color: var(--vscode-dropdown-foreground, #ccc);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 3px;
    padding: 2px 6px;
    font-size: 11px;
    cursor: pointer;
  }

  .instructions-toggle {
    background: none;
    border: none;
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
    cursor: pointer;
    text-align: left;
    padding: 2px 0;
  }
  .instructions-toggle:hover { color: var(--vscode-foreground); }

  .per-model-instructions {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding-top: 4px;
  }

  .per-model-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  ```

- [ ] **Step 4: Verify the build passes**

  ```bash
  cd /home/yurii/grok-forge && npm run compile
  ```

  Expected: no errors. If you see a Vue template error about `applyTemplate` or `globalInstructions.value` binding, see the alternative approach noted in Step 2.

- [ ] **Step 5: Commit**

  ```bash
  cd /home/yurii/grok-forge
  git add src/webview/components/SettingsView.vue
  git commit -m "feat: add global and per-model instruction textareas with template dropdowns to SettingsView"
  ```

---

### Task 7: Wire `globalInstructions` in `src/webview/App.vue`

**Files:**
- Modify: `src/webview/App.vue`

- [ ] **Step 1: Add `globalInstructions` ref to App's state**

  After line 56 (`const toolsEnabled = ref(false);`), add:

  ```ts
  // Custom instructions (global layer) — populated from modelsLoaded, passed to SettingsView
  const globalInstructions = ref("");
  ```

- [ ] **Step 2: Populate `globalInstructions` in the `modelsLoaded` handler**

  In the `case "modelsLoaded":` block (around line 179-197), add one line after `models.value = msg.models ?? [];`:

  ```ts
  if (msg.globalInstructions !== undefined) globalInstructions.value = msg.globalInstructions;
  ```

- [ ] **Step 3: Update `onSaveSettings` to pass `globalInstructions` and per-model `instructions`**

  Replace the `onSaveSettings` handler (lines 155-158):

  ```ts
  function onSaveSettings(payload: { globalInstructions: string; models: Array<{ title: string; modelId: string; apiKey: string; instructions: string }> }) {
    vscode.postMessage({ type: "saveSettings", globalInstructions: payload.globalInstructions, models: payload.models });
    view.value = "chat";
  }
  ```

- [ ] **Step 4: Pass `globalInstructions` prop to `SettingsView`**

  In the template, the `SettingsView` component is at lines 385-390. Replace it with:

  ```vue
  <SettingsView
    v-else-if="view === 'settings'"
    :models="models"
    :global-instructions="globalInstructions"
    @save-settings="onSaveSettings"
    @back="view = 'chat'"
  />
  ```

- [ ] **Step 5: Verify the full build passes with no errors**

  ```bash
  cd /home/yurii/grok-forge && npm run compile && npm run lint
  ```

  Expected: clean output. If lint shows Vue prop-type warnings for `globalInstructions`, ensure the prop is declared as `string` (not `ref<string>`) in the SettingsView `defineProps` — it should be, since props are always unwrapped.

- [ ] **Step 6: Manual end-to-end verification (F5 in VS Code)**

  1. Press F5 to launch Extension Development Host.
  2. Open the GrokForge panel in the sidebar.
  3. Click ⚙ Settings.
  4. Verify the **Custom Instructions (Global)** section appears at the top with a textarea and template dropdown.
  5. Select a template from the dropdown — verify it fills the textarea.
  6. Press Ctrl+Z — verify the prior content is restored.
  7. Type some global instruction text and click **Save Settings**.
  8. Re-open ⚙ Settings — verify the global instructions text persisted.
  9. Expand **Model-specific instructions** inside a model card — verify the per-model textarea and template dropdown appear.
  10. Enter per-model instructions and save.
  11. Send a message — if you have access to the xAI API, inspect the request (or add a `console.log` temporarily in `grok-client.ts`) to confirm the `system` message appears as the first item in `input`.

- [ ] **Step 7: Commit**

  ```bash
  cd /home/yurii/grok-forge
  git add src/webview/App.vue
  git commit -m "feat: wire globalInstructions in App.vue — populate from modelsLoaded, pass to SettingsView, include in saveSettings"
  ```

---

## Final Verification

- [ ] **Run full build and lint**

  ```bash
  cd /home/yurii/grok-forge && npm run compile && npm run lint
  ```

  Expected: no TypeScript errors, no lint warnings.

- [ ] **Confirm all 6 commits are present**

  ```bash
  git log --oneline -7
  ```

  Expected output (newest first):
  ```
  <sha> feat: wire globalInstructions in App.vue — populate from modelsLoaded, pass to SettingsView, include in saveSettings
  <sha> feat: add global and per-model instruction textareas with template dropdowns to SettingsView
  <sha> feat: wire globalInstructions lifecycle in chat-provider — load, persist, assemble, deliver
  <sha> feat: extend saveSettings message type with globalInstructions and per-model instructions
  <sha> feat: prepend system message to input when systemPrompt is set
  <sha> feat: add template library to src/webview/prompts.ts
  <sha> feat: add instructions field to ModelConfig and systemPrompt to RequestConfig
  ```
