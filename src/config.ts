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
