<script setup lang="ts">
import { ref } from "vue";

defineProps<{
  disabled: boolean;
  isGenerating: boolean;
  isLoadingFiles?: boolean;
}>();

const emit = defineEmits<{
  send: [text: string, withCodebase: boolean];
  stop: [];
}>();

const text = ref("");
const withCodebase = ref(false);

function handleSubmit() {
  const trimmed = text.value.trim();
  if (!trimmed) return;
  emit("send", trimmed, withCodebase.value);
  text.value = "";
  withCodebase.value = false;
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSubmit();
  }
}
</script>

<template>
  <div class="input-box">
    <textarea
      v-model="text"
      @keydown="handleKeydown"
      :disabled="disabled"
      placeholder="Message Grok... (Shift+Enter for newline)"
      rows="2"
    />
    <div class="input-actions">
      <button
        :class="['attach-btn', { active: withCodebase }]"
        @click="withCodebase = !withCodebase"
        :disabled="isGenerating"
        title="Attach workspace codebase as context"
      >
        <span v-if="isLoadingFiles">Reading…</span>
        <span v-else>{{ withCodebase ? '📁 Codebase ✓' : '📁 Codebase' }}</span>
      </button>

      <button
        v-if="isGenerating"
        class="stop-btn"
        @click="$emit('stop')"
      >
        Stop
      </button>
      <button
        v-else
        class="send-btn"
        :disabled="!text.trim()"
        @click="handleSubmit"
      >
        Send
      </button>
    </div>
  </div>
</template>

<style scoped>
.input-box {
  border-top: 1px solid var(--vscode-panel-border);
  padding: 8px;
}

textarea {
  width: 100%;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  padding: 8px;
  font-family: var(--vscode-font-family);
  font-size: 13px;
  resize: vertical;
  min-height: 40px;
}

textarea:focus {
  outline: 1px solid var(--vscode-focusBorder);
}

textarea:disabled {
  opacity: 0.6;
}

.input-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.send-btn, .stop-btn, .attach-btn {
  padding: 4px 10px;
  border: none;
  border-radius: 3px;
  font-size: 12px;
  cursor: pointer;
}

.attach-btn {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  margin-right: auto; /* push send/stop to the right */
}

.attach-btn:hover:not(:disabled) {
  background: var(--vscode-button-secondaryHoverBackground);
}

.attach-btn.active {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.attach-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.send-btn {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.send-btn:hover:not(:disabled) {
  background: var(--vscode-button-hoverBackground);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.stop-btn {
  background: var(--vscode-errorForeground);
  color: var(--vscode-editor-background);
}
</style>
