export const SINGLE_MODEL = "grok-4.20-beta-0309-reasoning";
export const MULTI_AGENT_MODEL = "grok-4.20-multi-agent-beta-0309";

export interface GrokConfig {
  model: string;
  multiAgent: boolean;
  tools: ("web_search" | "x_search" | "code_execution")[];
  store: boolean;
}

export const defaultConfig: GrokConfig = {
  model: SINGLE_MODEL,
  multiAgent: false,
  tools: [],
  store: false,
};
