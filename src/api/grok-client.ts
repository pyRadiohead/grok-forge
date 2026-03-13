import { GrokConfig } from "../config";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StreamCallbacks {
  onText: (delta: string) => void;
  onReasoning: (delta: string) => void;
  onFinish: (usage?: { promptTokens: number; completionTokens: number }) => void;
  onError: (error: Error) => void;
}

const XAI_RESPONSES_URL = "https://api.x.ai/v1/responses";

export function createGrokClient(apiKey: string) {
  async function chat(
    messages: ChatMessage[],
    config: GrokConfig,
    callbacks: StreamCallbacks,
    abortSignal?: AbortSignal
  ) {
    const body: Record<string, unknown> = {
      model: config.model,
      input: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      store: config.store,
    };

    if (config.tools.length > 0) {
      body.tools = config.tools.map((name) => ({ type: name }));
    }

    let response: Response;
    try {
      response = await fetch(XAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: abortSignal,
      });
    } catch (err) {
      if (abortSignal?.aborted) return;
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      callbacks.onError(new Error(`xAI API error ${response.status}: ${text}`));
      return;
    }

    if (!response.body) {
      callbacks.onError(new Error("No response body"));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let usage: { promptTokens: number; completionTokens: number } | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(data);
          } catch {
            continue;
          }

          processEvent(event, callbacks);

          // Capture usage from completed response
          if (event.usage && typeof event.usage === "object") {
            const u = event.usage as Record<string, unknown>;
            usage = {
              promptTokens: Number(u.input_tokens ?? u.prompt_tokens ?? 0),
              completionTokens: Number(u.output_tokens ?? u.completion_tokens ?? 0),
            };
          }
        }
      }
    } catch (err) {
      if (abortSignal?.aborted) return;
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    callbacks.onFinish(usage);
  }

  return { chat };
}

function processEvent(
  event: Record<string, unknown>,
  callbacks: StreamCallbacks
) {
  const type = event.type as string | undefined;

  // xAI Responses API SSE event types
  if (type === "response.output_text.delta") {
    const delta = (event as { delta?: string }).delta ?? "";
    if (delta) callbacks.onText(delta);
    return;
  }

  if (type === "response.reasoning_summary_text.delta") {
    const delta = (event as { delta?: string }).delta ?? "";
    if (delta) callbacks.onReasoning(delta);
    return;
  }

  // Fallback: OpenAI-compatible chat completions streaming format
  const choices = (event as { choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }> }).choices;
  if (choices?.[0]?.delta?.content) {
    callbacks.onText(choices[0].delta.content);
  }
  if (choices?.[0]?.delta?.reasoning_content) {
    callbacks.onReasoning(choices[0].delta.reasoning_content);
  }
}
