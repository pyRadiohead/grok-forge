import { createGrokClient, ChatMessage } from "../api/grok-client";
import { GrokConfig, SINGLE_MODEL, MULTI_AGENT_MODEL } from "../config";

export type WebviewMessage =
  | { type: "sendMessage"; text: string; withCodebase?: boolean }
  | { type: "stopGeneration" }
  | { type: "updateConfig"; config: Partial<GrokConfig> };

export interface HandlerContext {
  apiKey: string | undefined;
  messages: ChatMessage[];
  config: GrokConfig;
  abortController: AbortController | undefined;
  postMessage: (msg: unknown) => void;
  setAbortController: (ac: AbortController | undefined) => void;
  updateConfig: (partial: Partial<GrokConfig>) => void;
  readWorkspaceFiles: () => Promise<{ text: string; fileCount: number }>;
}

export function handleMessage(msg: WebviewMessage, ctx: HandlerContext) {
  switch (msg.type) {
    case "sendMessage":
      return handleSend(msg.text, msg.withCodebase ?? false, ctx);
    case "stopGeneration":
      ctx.abortController?.abort();
      ctx.setAbortController(undefined);
      return;
    case "updateConfig": {
      const update = { ...msg.config };
      if ("multiAgent" in update) {
        update.model = update.multiAgent ? MULTI_AGENT_MODEL : SINGLE_MODEL;
      }
      ctx.updateConfig(update);
      return;
    }
  }
}

async function handleSend(text: string, withCodebase: boolean, ctx: HandlerContext) {
  if (!ctx.apiKey) {
    ctx.postMessage({
      type: "error",
      message: "No API key set. Run 'GrokForge: Set xAI API Key' from the command palette.",
    });
    return;
  }

  let messageContent = text;

  if (withCodebase) {
    ctx.postMessage({ type: "loadingFiles" });
    const { text: filesText, fileCount } = await ctx.readWorkspaceFiles();
    if (filesText) {
      messageContent = `Here is the current workspace codebase (${fileCount} files):\n\n${filesText}\n\n---\n\n${text}`;
      ctx.postMessage({ type: "filesLoaded", fileCount });
    } else {
      ctx.postMessage({ type: "filesLoaded", fileCount: 0 });
    }
  }

  ctx.messages.push({ role: "user", content: messageContent });
  ctx.postMessage({ type: "userMessage", text }); // show original text in UI, not the full blob

  const ac = new AbortController();
  ctx.setAbortController(ac);
  ctx.postMessage({ type: "assistantStart" });

  let accumulated = "";
  let settled = false; // true after onFinish or onError

  const client = createGrokClient(ctx.apiKey);
  await client.chat(ctx.messages, ctx.config, {
    onText(delta) {
      accumulated += delta;
      ctx.postMessage({ type: "assistantDelta", delta });
    },
    onReasoning(delta) {
      ctx.postMessage({ type: "reasoningDelta", delta });
    },
    onFinish(usage) {
      settled = true;
      ctx.messages.push({ role: "assistant", content: accumulated });
      ctx.postMessage({ type: "assistantEnd", usage });
      ctx.setAbortController(undefined);
    },
    onError(error) {
      settled = true;
      ctx.messages.pop(); // remove the user message — conversation never completed
      ctx.postMessage({ type: "error", message: error.message });
      ctx.postMessage({ type: "assistantEnd" }); // clears isStreaming in webview
      ctx.setAbortController(undefined);
    },
  }, ac.signal);

  // Aborted path: client returns early without calling onFinish or onError
  if (!settled) {
    ctx.messages.pop(); // remove user message
    if (accumulated) {
      // Keep partial response so the user can see what came back before stopping
      ctx.messages.push({ role: "assistant", content: accumulated });
    }
    ctx.postMessage({ type: "assistantEnd" }); // clears isStreaming
    ctx.setAbortController(undefined);
  }
}
