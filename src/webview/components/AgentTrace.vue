<script setup lang="ts">
import { ref } from "vue";

defineProps<{
  content: string;
  isStreaming?: boolean;
}>();

const expanded = ref(false);
</script>

<template>
  <div class="agent-trace">
    <button class="trace-toggle" @click="expanded = !expanded">
      <span class="arrow">{{ expanded ? '▾' : '▸' }}</span>
      Reasoning{{ isStreaming ? '...' : '' }}
    </button>
    <div v-show="expanded" class="trace-content">
      <pre>{{ content }}</pre>
    </div>
  </div>
</template>

<style scoped>
.agent-trace {
  margin: 4px 0;
}

.trace-toggle {
  background: none;
  border: none;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  font-size: 11px;
  padding: 2px 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.trace-toggle:hover {
  color: var(--vscode-foreground);
}

.arrow {
  font-size: 10px;
  width: 10px;
}

.trace-content {
  border-left: 2px solid var(--vscode-panel-border);
  padding-left: 10px;
  margin: 4px 0 4px 4px;
}

.trace-content pre {
  font-family: var(--vscode-editor-font-family);
  font-size: 11px;
  line-height: 1.4;
  color: var(--vscode-descriptionForeground);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}
</style>
