<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from "vue";
import ChatMessage from "./components/ChatMessage.vue";
import InputBox from "./components/InputBox.vue";
import SettingsView from "./components/SettingsView.vue";
import HistoryView from "./components/HistoryView.vue";
import type { ChatSession } from "../config";

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
const view = ref<"chat" | "settings" | "history">("chat");
const modelsReady = ref(false);
const models = ref<ModelConfig[]>([]);
const selectedModelIndex = ref<number | null>(null);

// Sessions state
const sessions = ref<ChatSession[]>([]);
const activeSessionId = ref<string | null>(null);

// Chat state
const messages = ref<Message[]>([]);
const isGenerating = ref(false);
const error = ref<string | null>(null);
const lastUsage = ref<Usage | null>(null);
const sessionTotal = ref<Usage>({ promptTokens: 0, completionTokens: 0 });
const lastModelId = ref<string | null>(null);

// Codebase state (owned by App, reflected in InputBox via props)
const withCodebase = ref(false);
const codebaseFileCount = ref(0);
const codebaseWorkspaceName = ref("");
const codebaseError = ref<string | null>(null);

// Tools state
const toolsEnabled = ref(false);

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
  const min = 300;
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
    toolsEnabled: toolsEnabled.value,
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

// Session handlers
function onLoadSession(id: string) {
  messages.value = [];
  vscode.postMessage({ type: "loadSession", sessionId: id });
  view.value = "chat";
}

function onDeleteSession(id: string) {
  vscode.postMessage({ type: "deleteSession", sessionId: id });
}

function onRenameSession(id: string, title: string) {
  vscode.postMessage({ type: "renameSession", sessionId: id, title });
}

// Message handler from extension host
function handleExtensionMessage(event: MessageEvent) {
  const msg = event.data;
  switch (msg.type) {
    case "modelsLoaded": {
      models.value = msg.models ?? [];
      modelsReady.value = true;
      selectedModelIndex.value = models.value.length > 0 ? 0 : null;
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
          if (panel) applyHeight(Math.floor(panel.offsetHeight * 0.85));
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
    case "toolCallUpdate": {
      // Show tool activity in the reasoning/thinking section of the current message
      const last = messages.value[messages.value.length - 1];
      if (last?.role === "assistant" && msg.status === "in_progress") {
        const label = msg.toolName === "web_search" ? "🔍 Searching web…"
          : msg.toolName === "x_search" ? "🔍 Searching X…"
          : "⚙️ Running code…";
        last.reasoning = (last.reasoning || "") + label + "\n";
      }
      break;
    }
    case "assistantEnd": {
      const last = messages.value[messages.value.length - 1];
      if (last) last.isStreaming = false;
      isGenerating.value = false;
      if (msg.modelId) lastModelId.value = msg.modelId;
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
      lastModelId.value = null;
      sessionTotal.value = { promptTokens: 0, completionTokens: 0 };
      withCodebase.value = false;
      codebaseFileCount.value = 0;
      codebaseError.value = null;
      break;
    case "sessionsLoaded":
      sessions.value = msg.sessions ?? [];
      activeSessionId.value = msg.activeSessionId ?? null;
      break;
    case "sessionLoaded": {
      error.value = null;
      lastUsage.value = null;
      lastModelId.value = null;
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
  }
}

onMounted(() => {
  window.addEventListener("message", handleExtensionMessage);

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

    <!-- Header: always visible -->
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

    <!-- Chat view -->
    <template v-if="view === 'chat'">
      <div v-if="!modelsReady" class="skeleton">
        <div class="skeleton-line" />
        <div class="skeleton-line short" />
      </div>

      <template v-else>
        <div
          ref="chatContainer"
          class="chat-container"
          :style="hasModels ? { height: chatHeightPx + 'px' } : { flex: '1' }"
        >
          <div v-if="!hasModels" class="no-models">
            No models configured — add one in ⚙ Settings.
          </div>
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

        <div
          v-if="showDragHandle"
          class="drag-handle"
          @mousedown="onDragStart"
          title="Drag to resize"
        >
          <span class="drag-dots">• • •</span>
        </div>

        <div v-if="hasModels" class="token-bar">
          <template v-if="lastUsage">
            <span v-if="lastModelId" class="token-model">{{ lastModelId }}</span>
            ↑{{ lastUsage.promptTokens.toLocaleString() }}
            ↓{{ lastUsage.completionTokens.toLocaleString() }} tokens
            <span class="token-total">
              (total: {{ (sessionTotal.promptTokens + sessionTotal.completionTokens).toLocaleString() }})
            </span>
          </template>
        </div>
      </template>
    </template>

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

    <!-- InputBox: always mounted when models are ready so textarea text survives view switches -->
    <InputBox
      v-if="modelsReady"
      v-show="view === 'chat'"
      :models="models"
      :selected-model-index="selectedModelIndex"
      :with-codebase="withCodebase"
      :file-count="codebaseFileCount"
      :workspace-name="codebaseWorkspaceName"
      :codebase-error="codebaseError"
      :disabled="!hasModels"
      :is-generating="isGenerating"
      :tools-enabled="toolsEnabled"
      @send="onSend"
      @stop="() => vscode.postMessage({ type: 'stopGeneration' })"
      @attach-codebase="onAttachCodebase"
      @detach-codebase="onDetachCodebase"
      @model-change="onModelChange"
      @toggle-tools="toolsEnabled = !toolsEnabled"
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

.chat-container {
  overflow-y: auto;
  padding: 8px;
  flex-shrink: 0;
}

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

.token-bar {
  padding: 2px 12px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
  flex-shrink: 0;
}
.token-model {
  color: #4ec994;
  font-size: 10px;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.token-total { opacity: 0.7; }

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
