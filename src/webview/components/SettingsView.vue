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
