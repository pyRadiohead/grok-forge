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

// Date grouping — uses local date keys (YYYY-MM-DD) to avoid UTC midnight parse issues
function localDateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatGroupLabel(dateKey: string): string {
  const today = new Date();
  const todayKey = localDateKey(today.getTime());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = localDateKey(yesterday.getTime());
  if (dateKey === todayKey) return "Today";
  if (dateKey === yesterdayKey) return "Yesterday";
  const [y, m, day] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
    const key = localDateKey(s.createdAt);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
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
              {{ formatTime(session.createdAt) }} · {{ session.messages.filter(m => m.role === 'user').length }} messages
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
