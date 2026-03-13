<script setup lang="ts">
import { computed } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
import AgentTrace from "./AgentTrace.vue";

const props = defineProps<{
  message: {
    role: "user" | "assistant";
    content: string;
    reasoning?: string;
    isStreaming?: boolean;
  };
}>();

const renderedContent = computed(() => {
  if (!props.message.content) return "";
  const raw = marked.parse(props.message.content, { async: false }) as string;
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
});
</script>

<template>
  <div :class="['message', message.role]">
    <div class="message-header">
      {{ message.role === 'user' ? 'You' : 'Grok' }}
      <span v-if="message.isStreaming" class="streaming-dot" />
    </div>

    <AgentTrace
      v-if="message.reasoning"
      :content="message.reasoning"
      :is-streaming="message.isStreaming"
    />

    <div class="message-body" v-html="renderedContent" />
  </div>
</template>

<style scoped>
.message {
  margin-bottom: 12px;
  padding: 8px 10px;
  border-radius: 6px;
}

.message.user {
  background: var(--vscode-input-background);
}

.message.assistant {
  background: var(--vscode-editor-inactiveSelectionBackground);
}

.message-header {
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--vscode-descriptionForeground);
  display: flex;
  align-items: center;
  gap: 6px;
}

.streaming-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  background: var(--vscode-charts-green);
  border-radius: 50%;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.message-body {
  font-size: 13px;
  line-height: 1.5;
}

.message-body :deep(pre) {
  background: var(--vscode-textCodeBlock-background);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  margin: 6px 0;
}

.message-body :deep(code) {
  font-family: var(--vscode-editor-font-family);
  font-size: var(--vscode-editor-font-size);
}

.message-body :deep(p) {
  margin: 4px 0;
}
</style>
