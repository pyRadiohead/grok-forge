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
</style>
