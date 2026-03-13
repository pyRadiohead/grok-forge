# GrokForge — Project Description

## Goal

A lightweight VS Code extension for chatting with Grok models via the xAI Responses API — no OpenRouter, no proxy layers.

### MVP Features (v1)
- Sidebar chat with streaming responses
- Native multi-agent mode (4/16 agents, visible reasoning traces)
- Server-side tools: web_search, x_search, code_execution
- Direct xAI API via /v1/responses
- Secure API key storage (VS Code SecretStorage)

### Future Features
- Tab autocomplete (InlineCompletionItemProvider)
- Codebase context / RAG (@codebase, @folder, @repo-map) with local embeddings
- Agent mode (autonomous edits, PR reviews, debugging)
- Conversation persistence
- Settings UI panel

## Key Differentiator

True multi-agent orchestration inside VS Code — calls the xAI Responses API natively with `grok-4.20-multi-agent-beta-0309`.

## Tech Stack

- **Language:** TypeScript
- **VS Code API:** WebviewView (sidebar), SecretStorage, commands
- **AI Layer:** `@ai-sdk/xai` + `ai` (Vercel AI SDK) — supports Responses API via `xai.responses()`
- **UI:** Vue 3 (Composition API, inside Webview) for chat interface
- **Build:** esbuild (two entry points: extension + webview)

## Project Structure

```
grokforge/
├── package.json              # Extension manifest (views, commands, activation)
├── tsconfig.json
├── esbuild.config.mjs
├── src/
│   ├── extension.ts          # Activation, register providers
│   ├── config.ts             # Settings (API key, model, agent count)
│   ├── api/
│   │   └── grok-client.ts    # xAI Responses API wrapper
│   ├── chat/
│   │   ├── chat-provider.ts  # WebviewViewProvider for sidebar
│   │   └── message-handler.ts
│   └── webview/
│       ├── index.html
│       ├── main.ts            # Vue app entry
│       ├── App.vue
│       └── components/
│           ├── ChatMessage.vue
│           ├── InputBox.vue
│           └── AgentTrace.vue # Multi-agent reasoning traces
└── media/                     # Icons, CSS
```

## Challenges & Mitigations

- **Multi-agent streaming parsing** — Vercel AI SDK handles SSE streams
- **Token costs** — Show usage stats in sidebar
- **VS Code API changes** — Follow official extension samples
