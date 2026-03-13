# GrokForge

A VS Code extension for chatting with Grok models via the xAI Responses API — no OpenRouter, no proxy layers.

Built for developers who want direct access to Grok's multi-agent capabilities inside their editor.

## Features

### Sidebar Chat
Persistent chat panel in the VS Code activity bar. Supports multi-turn conversations with full streaming output.

### Native Multi-Agent Mode
Toggle multi-agent mode to use `grok-4.20-multi-agent-beta-0309` with up to 16 parallel sub-agents. Reasoning traces from each agent are displayed in collapsible sections inline with the response.

### Server-Side Tools
Enable any combination of xAI's built-in tools per conversation:
- **Web** — real-time web search with citations
- **X** — search X (Twitter) posts and threads
- **Code** — autonomous code execution during reasoning

### Codebase Context (`@codebase`)
Attach your entire workspace as context with one click. Reads up to 200 source files (max 80k chars), automatically excluding `node_modules`, `dist`, secrets (`.env`, `*.pem`, `*.key`), and lock files.

### Token Budget Display
Shows token usage per response (input / output) and a running session total in the status bar. Hover for the cumulative count.

### Secure API Key Storage
API key is stored in VS Code's `SecretStorage` — never written to disk or logged.

## Installation

1. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/pyRadiohead/grok-forge.git
   cd grok-forge
   npm install
   ```

2. Build the extension:
   ```bash
   npm run compile
   ```

3. Press **F5** in VS Code to launch the Extension Development Host.

4. Open the Command Palette (`Ctrl+Shift+P`) and run:
   ```
   GrokForge: Set xAI API Key
   ```

5. Click the GrokForge icon in the activity bar to open the chat panel.

## Commands

| Command | Description |
|---|---|
| `GrokForge: Set xAI API Key` | Store your xAI API key securely |
| `GrokForge: New Chat` | Clear conversation history and start fresh |

## Development

```bash
npm run compile   # One-time build
npm run watch     # Rebuild on file changes
npm run lint      # Lint TypeScript and Vue files
npm run package   # Build .vsix for distribution
```

After rebuilding, press `Ctrl+R` in the Extension Development Host to reload.

## Tech Stack

- **Extension host:** TypeScript, VS Code API, Node.js
- **Webview UI:** Vue 3 (Composition API), esbuild
- **AI:** xAI Responses API via raw `fetch` + SSE streaming
- **Security:** DOMPurify for markdown rendering, VS Code SecretStorage for API key

## Planned Features

- **Tab autocomplete** — inline code suggestions powered by a fast Grok model (`InlineCompletionItemProvider`)
- **Conversation persistence** — save and restore chat history across sessions
- **Model selector** — switch between Grok models without leaving the chat
- **Syntax highlighting** — code block highlighting using Shiki (VS Code's built-in highlighter)
- **Copy button** — one-click copy on any message or code block
- **Agent mode** — autonomous multi-file editing, apply diffs, terminal integration
- **Slash commands** — `/fix`, `/explain`, `/test` shortcuts
- **Settings panel** — configure model, agent count, temperature from the UI
- **VS Code Marketplace** — publish as a one-click installable extension

## License

MIT
