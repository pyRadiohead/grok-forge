export interface ModelConfig {
  title: string;
  modelId: string;
  apiKey: string;         // "" if missing/unconfigured
  unconfigured?: boolean; // true when apiKey was absent/empty at load or save time
}

export interface RequestConfig {
  modelId: string;
  apiKey: string;
  store: false; // instructs xAI not to store conversation server-side; always false
}

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  // content stores the raw user-typed text (the `text` field of the sendMessage
  // webview message), NOT the codebase-prefixed messageContent. This prevents
  // giant codebase blobs being stored per-message.
  reasoning?: string;
  // isStreaming intentionally omitted — runtime-only field
}

export interface ChatSession {
  id: string;          // Date.now().toString() — unique enough, sortable
  title: string;       // Auto-set from first raw user text (≤40 chars + "…"), user-editable
  createdAt: number;   // Unix ms timestamp
  messages: StoredMessage[];
}
