import { RequestConfig } from "../config";
import { createGrokClient, ChatMessage } from "../api/grok-client";

export type WebviewMessage =
  | { type: "sendMessage"; text: string; withCodebase: boolean; selectedModelIndex: number }
  | { type: "stopGeneration" }
  | { type: "newChat" }
  | { type: "readCodebase" }
  | { type: "saveSettings"; models: Array<{ title: string; modelId: string; apiKey: string }> }
  | { type: "saveChatHeight"; height: number };

export interface HandlerContext {
  messages: ChatMessage[];
  abortController: AbortController | undefined;
  postMessage: (msg: unknown) => void;
  setAbortController: (ac: AbortController | undefined) => void;
  getRequestConfig: (index: number) => RequestConfig | null;
  getCachedCodebase: () => string | null;
}

export function handleMessage(msg: WebviewMessage, ctx: HandlerContext) {
  switch (msg.type) {
    case "sendMessage":
      return handleSend(msg.text, msg.withCodebase, msg.selectedModelIndex, ctx);
    case "stopGeneration":
      ctx.abortController?.abort();
      ctx.setAbortController(undefined);
      return;
    // newChat, readCodebase, saveSettings, saveChatHeight handled in chat-provider
  }
}

async function handleSend(
  text: string,
  withCodebase: boolean,
  selectedModelIndex: number,
  ctx: HandlerContext
) {
  const requestConfig = ctx.getRequestConfig(selectedModelIndex);
  if (!requestConfig) {
    ctx.postMessage({
      type: "error",
      message: "Invalid model selection. Please reload the panel.",
    });
    return;
  }

  let messageContent = text;
  if (withCodebase) {
    const codebaseText = ctx.getCachedCodebase();
    if (codebaseText) {
      messageContent = `Here is the current workspace codebase:\n\n${codebaseText}\n\n---\n\n${text}`;
    }
  }

  ctx.messages.push({ role: "user", content: messageContent });
  ctx.postMessage({ type: "userMessage", text }); // show original text, not the codebase blob

  const ac = new AbortController();
  ctx.setAbortController(ac);
  ctx.postMessage({ type: "assistantStart" });

  let accumulated = "";
  let settled = false;

  const client = createGrokClient(requestConfig.apiKey);
  await client.chat(ctx.messages, requestConfig, {
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
      // Spec §7: user message stays in history so the user can retry by resending.
      // Do NOT pop the user message here.
      ctx.postMessage({ type: "error", message: error.message });
      ctx.postMessage({ type: "assistantEnd" });
      ctx.setAbortController(undefined);
    },
  }, ac.signal);

  // Aborted path: client returns without calling onFinish or onError
  if (!settled) {
    ctx.messages.pop();
    if (accumulated) {
      ctx.messages.push({ role: "assistant", content: accumulated });
    }
    ctx.postMessage({ type: "assistantEnd" });
    ctx.setAbortController(undefined);
  }
}
