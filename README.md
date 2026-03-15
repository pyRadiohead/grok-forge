# GrokForge

**Grok-native VS Code extension with multi-agent orchestration via xAI Responses API.**

> **Status: Active development** — core chat, multi-agent mode, and server-side tools work. Not yet published to the VS Code Marketplace.

## What This Is

A VS Code sidebar chat that talks directly to xAI's Responses API — raw `fetch` + SSE streaming, no SDK wrappers, no proxy layers. The main draw is native support for `grok-4.20-multi-agent-beta-0309`, which spins up parallel sub-agents for decomposition and synthesis — the same orchestration available on grok.com, inside your editor.

## What Works

**Multi-agent mode** — toggle to use Grok's multi-agent model with reasoning traces displayed in collapsible sections inline with the response.

**Server-side tools** — enable per conversation:
- `web_search` — real-time web results with citations
- `x_search` — search X posts and threads
- `code_execution` — autonomous code execution during reasoning

**Codebase context (`@codebase`)** — attach your workspace as context. Reads up to 200 source files (max 80k chars), auto-excludes `node_modules`, `dist`, secrets, lock files.

**Custom instructions** — global and per-model system prompts. Includes built-in templates for multi-agent research, code review, and more.

**Session history** — conversations persist across restarts. Browse, rename, delete past sessions.

**Token tracking** — per-response usage (input/output) and running session total.

## Architecture

Two esbuild targets:
- **Extension host** (Node.js): `src/extension.ts` → `dist/extension.js`
- **Webview** (browser): `src/webview/main.ts` → `dist/webview.js`

Communication via `postMessage()` / `onDidReceiveMessage()`.

| Directory | Purpose |
|---|---|
| `src/api/` | xAI Responses API client — raw fetch, SSE parsing, streaming callbacks |
| `src/chat/` | WebviewViewProvider, message handling, session management |
| `src/webview/` | Vue 3 (Composition API) chat UI, bundled separately for browser |

## Development

```bash
npm install          # Install dependencies
npm run compile      # Build extension + webview
npm run watch        # Watch mode
npm run lint         # Lint TypeScript and Vue
npm run package      # Build .vsix
```

Press F5 in VS Code to launch the Extension Development Host. `Ctrl+R` to reload after rebuilding.

## What's Next

- **Multi-agent visualization** — per-agent progress cards during streaming, consolidated output after completion
- **Agent mode** — autonomous multi-file editing, diff application, terminal integration
- **Tab autocomplete** — inline suggestions via `InlineCompletionItemProvider`
- **VS Code Marketplace** — publish as installable extension

## Tech

- TypeScript strict mode, Vue 3 Composition API
- xAI Responses API via raw `fetch` + SSE (no `@ai-sdk/xai` `.responses()` — it doesn't exist in v1.x)
- DOMPurify for markdown sanitization, VS Code SecretStorage for API key

## License

MIT
