<script setup lang="ts">
import { ref, onMounted, nextTick } from "vue";
import ChatMessage from "./components/ChatMessage.vue";
import InputBox from "./components/InputBox.vue";

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
const messages = ref<Message[]>([]);
const isGenerating = ref(false);
const isLoadingFiles = ref(false);
const error = ref<string | null>(null);
const lastUsage = ref<Usage | null>(null);
const totalUsage = ref<Usage>({ promptTokens: 0, completionTokens: 0 });
const hasApiKey = ref<boolean | null>(null); // null = not yet known
const lastCodebaseFileCount = ref(0);
const chatContainer = ref<HTMLElement | null>(null);

const multiAgent = ref(false);
const tools = ref<string[]>([]);

function scrollToBottom() {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
    }
  });
}

function sendMessage(text: string, withCodebase: boolean) {
  error.value = null;
  vscode.postMessage({ type: "sendMessage", text, withCodebase });
}

function stopGeneration() {
  vscode.postMessage({ type: "stopGeneration" });
}

function toggleMultiAgent() {
  multiAgent.value = !multiAgent.value;
  vscode.postMessage({ type: "updateConfig", config: { multiAgent: multiAgent.value } });
}

function toggleTool(tool: string) {
  const idx = tools.value.indexOf(tool);
  if (idx >= 0) tools.value.splice(idx, 1);
  else tools.value.push(tool);
  vscode.postMessage({ type: "updateConfig", config: { tools: [...tools.value] } });
}

onMounted(() => {
  window.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.type) {
      case "apiKeyStatus":
        hasApiKey.value = msg.hasKey;
        break;
      case "loadingFiles":
        isLoadingFiles.value = true;
        break;
      case "filesLoaded":
        isLoadingFiles.value = false;
        lastCodebaseFileCount.value = msg.fileCount;
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
          totalUsage.value.promptTokens += msg.usage.promptTokens;
          totalUsage.value.completionTokens += msg.usage.completionTokens;
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
        totalUsage.value = { promptTokens: 0, completionTokens: 0 };
        lastCodebaseFileCount.value = 0;
        break;
    }
  });
});
</script>

<template>
  <div class="app">
    <!-- API key not set -->
    <div v-if="hasApiKey === false" class="no-key">
      <p>No xAI API key set.</p>
      <p>Open the Command Palette and run:<br><code>GrokForge: Set xAI API Key</code></p>
    </div>

    <template v-else>
      <div class="toolbar">
        <button
          :class="['tool-btn', { active: multiAgent }]"
          @click="toggleMultiAgent"
          title="Toggle multi-agent mode"
        >
          Multi-Agent
        </button>
        <button
          v-for="tool in ['web_search', 'x_search', 'code_execution']"
          :key="tool"
          :class="['tool-btn', 'small', { active: tools.includes(tool) }]"
          @click="toggleTool(tool)"
          :title="`Toggle ${tool}`"
        >
          {{ tool === 'web_search' ? 'Web' : tool === 'x_search' ? 'X' : 'Code' }}
        </button>
      </div>

      <div ref="chatContainer" class="chat-container">
        <div v-if="messages.length === 0" class="empty-state">
          Send a message to start chatting with Grok.
        </div>
        <ChatMessage
          v-for="(msg, i) in messages"
          :key="i"
          :message="msg"
        />
        <div v-if="isLoadingFiles" class="info">Reading workspace files…</div>
        <div v-if="error" class="error">{{ error }}</div>
      </div>

      <div class="status-bar">
        <span v-if="lastCodebaseFileCount > 0" class="context-badge">
          📁 {{ lastCodebaseFileCount }} files
        </span>
        <span class="spacer" />
        <span v-if="lastUsage" class="usage" :title="`Session total: ${totalUsage.promptTokens.toLocaleString()} in / ${totalUsage.completionTokens.toLocaleString()} out`">
          ↑{{ lastUsage.promptTokens.toLocaleString() }} ↓{{ lastUsage.completionTokens.toLocaleString() }} tokens
          <span class="usage-total"> (total: {{ (totalUsage.promptTokens + totalUsage.completionTokens).toLocaleString() }})</span>
        </span>
      </div>

      <InputBox
        :disabled="isGenerating"
        :is-generating="isGenerating"
        :is-loading-files="isLoadingFiles"
        @send="sendMessage"
        @stop="stopGeneration"
      />
    </template>
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

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.no-key {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px;
  text-align: center;
  color: var(--vscode-descriptionForeground);
  font-size: 13px;
}

.no-key code {
  font-family: var(--vscode-editor-font-family);
  background: var(--vscode-textCodeBlock-background);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
}

.toolbar {
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--vscode-panel-border);
  flex-wrap: wrap;
}

.tool-btn {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: 1px solid transparent;
  border-radius: 3px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
}
.tool-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
.tool-btn.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.tool-btn.small { padding: 2px 6px; font-size: 10px; }

.chat-container {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.empty-state {
  color: var(--vscode-descriptionForeground);
  text-align: center;
  margin-top: 40px;
  font-size: 13px;
}

.info {
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
  font-style: italic;
  padding: 4px 0;
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

.status-bar {
  display: flex;
  align-items: center;
  padding: 2px 8px;
  border-top: 1px solid var(--vscode-panel-border);
  min-height: 20px;
}

.context-badge {
  font-size: 10px;
  color: var(--vscode-charts-blue);
}

.spacer { flex: 1; }

.usage {
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
  cursor: default;
}

.usage-total {
  opacity: 0.7;
}
</style>
