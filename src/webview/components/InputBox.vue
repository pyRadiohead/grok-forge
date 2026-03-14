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
