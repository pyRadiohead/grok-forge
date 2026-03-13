# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

GrokForge — a VS Code extension for chatting with Grok models via the xAI Responses API.
Key feature: native multi-agent orchestration (grok-4.20-multi-agent-beta-0309).

## Commands

```bash
npm install                    # Install dependencies
npm run compile                # Build extension + webview (esbuild)
npm run watch                  # Watch mode for development
npm run lint                   # Lint TypeScript and Vue files
npm run package                # Build .vsix package
```

Press F5 in VS Code to launch the Extension Development Host for testing.

## Architecture

Two build targets via esbuild (see esbuild.config.mjs):
- **Extension host** (Node.js): `src/extension.ts` → `dist/extension.js`
- **Webview** (browser): `src/webview/main.ts` → `dist/webview.js`

Extension host and webview communicate via `postMessage()` / `onDidReceiveMessage()`.

### Key areas
- `src/api/` — xAI Responses API client (raw fetch + SSE parsing, no SDK dependency)
- `src/chat/` — WebviewViewProvider for the sidebar panel
- `src/webview/` — Vue 3 (Composition API) chat UI, bundled separately for browser

### API layer
Uses raw `fetch` to `https://api.x.ai/v1/responses` — `@ai-sdk/xai` v1.x has no `.responses()` method.
SSE streaming events: `response.output_text.delta` (text), `response.reasoning_summary_text.delta` (reasoning).
Server-side tools (web_search, x_search, code_execution) — cannot mix with client-side tools in same request.

## Gotchas

- `activationEvents: []` doesn't make commands appear in the palette — use `["onStartupFinished"]`
- esbuild Vue plugin outputs `dist/webview.css` separately — must load it explicitly in the webview HTML
- Webview CSP stylesheet src must include `${webview.cspSource}`, not just `'unsafe-inline'`
- Workspace file reading (`vscode.workspace.fs.readFile`) is extension-host only — cannot call from webview

## Code style

- TypeScript strict mode
- Vue 3 Composition API with `<script setup>` — no Options API
- Extension code is CommonJS (required by VS Code), webview is IIFE
