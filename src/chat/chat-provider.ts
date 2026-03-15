import * as vscode from "vscode";
import { handleMessage, WebviewMessage } from "./message-handler";
import { ChatMessage } from "../api/grok-client";
import { ModelConfig, RequestConfig, ChatSession, StoredMessage } from "../config";

const FILE_GLOB = "**/*.{ts,tsx,js,jsx,vue,py,go,rs,java,cs,cpp,c,h,md,css,scss,html,sh}";
const EXCLUDE_GLOB = "{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/.vscode/**,**/coverage/**,**/__pycache__/**,**/*.min.js,**/*.map,**/.env,**/.env.*,**/*.pem,**/*.key,**/*.p12,**/package-lock.json,**/yarn.lock,**/pnpm-lock.yaml}";
const MAX_FILES = 200;
const MAX_CHARS = 80_000;

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private messages: ChatMessage[] = [];
  private models: ModelConfig[] = [];
  private cachedCodebase: string | null = null;
  private abortController?: AbortController;
  private sessions: ChatSession[] = [];
  private activeSessionId: string | undefined = undefined;
  private globalInstructions = "";

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "dist"),
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
      ],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => this.onMessage(msg),
      undefined,
      this.context.subscriptions
    );

    // Load sessions from workspaceState
    this.sessions = this.context.workspaceState.get<ChatSession[]>("grokforge.sessions") ?? [];
    this.activeSessionId = this.context.workspaceState.get<string>("grokforge.activeSessionId");

    // Restore active session messages if applicable
    if (this.activeSessionId) {
      const active = this.sessions.find(s => s.id === this.activeSessionId);
      if (active) {
        // ChatMessage only has { role, content } — reasoning is not stored there.
        // Reasoning is available in session.messages (StoredMessage[]) and will be
        // sent to the webview via sessionLoaded when a session is explicitly loaded.
        this.messages = active.messages.map(m => ({ role: m.role, content: m.content }));
      } else {
        this.activeSessionId = undefined;
      }
    }

    this.loadAndSendModels();
  }

  newChat() {
    // 1. Abort any active controller first
    this.abortController?.abort();
    this.abortController = undefined;

    // 2. Remove ghost session (created but has zero stored messages)
    if (this.activeSessionId) {
      const idx = this.sessions.findIndex(s => s.id === this.activeSessionId);
      if (idx !== -1 && this.sessions[idx].messages.length === 0) {
        this.sessions.splice(idx, 1);
        this.context.workspaceState.update("grokforge.sessions", this.sessions);
      }
    }

    // 3. Clear active session
    this.activeSessionId = undefined;
    this.context.workspaceState.update("grokforge.activeSessionId", undefined);

    // 4. Clear runtime state
    this.messages = [];
    this.cachedCodebase = null;

    // 5. Notify webview
    this.postMessage({ type: "clearChat" });
    this.sendSessionsLoaded();
  }

  getRequestConfig(index: number): RequestConfig | null {
    const model = this.models[index];
    if (!model) return null;
    const assembled = buildSystemPrompt(this.globalInstructions, model.instructions ?? "");
    const systemPrompt = assembled ?? undefined;
    return { modelId: model.modelId, apiKey: model.apiKey, store: false, systemPrompt };
  }

  private async loadAndSendModels() {
    const storedHeight: number | undefined = this.context.globalState.get("grokforge.chatHeight");

    // Load globalInstructions once per startup (refreshed after save)
    this.globalInstructions = this.context.globalState.get<string>("grokforge.globalInstructions") ?? "";

    const timeoutHandle = setTimeout(() => {
      this.postMessage({ type: "modelsLoaded", models: [], chatHeight: storedHeight, globalInstructions: this.globalInstructions });
      this.sendSessionsLoaded();
    }, 5000);

    try {
      const modelMeta: Array<{ title: string; modelId: string; instructions?: string }> =
        this.context.globalState.get("grokforge.models") ?? [];

      const models: ModelConfig[] = await Promise.all(
        modelMeta.map(async (m, i) => {
          let apiKey = "";
          let unconfigured = false;
          try {
            const key = await this.context.secrets.get(`grokforge.apiKey.${i}`);
            if (key) {
              apiKey = key;
            } else {
              unconfigured = true;
            }
          } catch {
            unconfigured = true;
          }
          return { title: m.title, modelId: m.modelId, apiKey, unconfigured: unconfigured ? true : undefined, instructions: m.instructions };
        })
      );

      clearTimeout(timeoutHandle);
      this.models = models;
      this.postMessage({ type: "modelsLoaded", models, chatHeight: storedHeight, globalInstructions: this.globalInstructions });
      this.sendSessionsLoaded();
    } catch {
      clearTimeout(timeoutHandle);
      this.postMessage({ type: "modelsLoaded", models: [], chatHeight: storedHeight, globalInstructions: this.globalInstructions });
      this.sendSessionsLoaded();
    }
  }

  private async onMessage(msg: WebviewMessage) {
    switch (msg.type) {
      case "newChat":
        this.newChat();
        return;
      case "readCodebase":
        await this.handleReadCodebase();
        return;
      case "saveSettings":
        await this.handleSaveSettings(msg.globalInstructions, msg.models);
        return;
      case "saveChatHeight":
        await this.context.globalState.update("grokforge.chatHeight", msg.height);
        return;
      case "loadSession":
        await this.handleLoadSession(msg.sessionId);
        return;
      case "deleteSession":
        await this.handleDeleteSession(msg.sessionId);
        return;
      case "renameSession":
        await this.handleRenameSession(msg.sessionId, msg.title);
        return;
      case "stopGeneration":
        // Handled inside handleMessage via abortController; fall through to default
        // so sendSessionsLoaded() fires after abort completes.
        // falls through
      default: {
        // Create a new session on first message if no active session
        if (msg.type === "sendMessage" && !this.activeSessionId) {
          const rawText: string = (msg as { type: "sendMessage"; text: string }).text;
          const title = rawText.length > 40 ? rawText.slice(0, 40) + "…" : rawText;
          const newSession: ChatSession = {
            id: Date.now().toString(),
            title,
            createdAt: Date.now(),
            messages: [],
          };
          this.activeSessionId = newSession.id;
          this.sessions.unshift(newSession);
          if (this.sessions.length > 20) {
            this.sessions.pop();
          }
          await this.context.workspaceState.update("grokforge.sessions", this.sessions);
          await this.context.workspaceState.update("grokforge.activeSessionId", this.activeSessionId);
          this.sendSessionsLoaded();
        }

        await handleMessage(msg, {
          messages: this.messages,
          abortController: this.abortController,
          postMessage: (m) => this.postMessage(m),
          setAbortController: (ac) => { this.abortController = ac; },
          getRequestConfig: (i) => this.getRequestConfig(i),
          getCachedCodebase: () => this.cachedCodebase,
          onAssistantFinish: (userText, assistantContent, reasoning) => {
            this.handleAssistantFinish(userText, assistantContent, reasoning);
          },
        });

        // Send fresh session list after every send (success, error, or abort)
        this.sendSessionsLoaded();
      }
    }
  }

  private async handleReadCodebase() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this.postMessage({ type: "codebaseError", message: "No workspace open." });
      return;
    }
    try {
      const { text, fileCount, workspaceName } = await this.readWorkspaceFiles();
      this.cachedCodebase = text || null;
      this.postMessage({ type: "codebaseReady", fileCount, workspaceName });
    } catch (err) {
      this.postMessage({
        type: "codebaseError",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async handleSaveSettings(
    globalInstructions: string,
    incomingModels: Array<{ title: string; modelId: string; apiKey: string; instructions: string }>
  ) {
    const previousCount: number =
      (this.context.globalState.get<Array<unknown>>("grokforge.models") ?? []).length;
    const newCount = incomingModels.length;

    // 1. Persist globalInstructions
    await this.context.globalState.update("grokforge.globalInstructions", globalInstructions);
    this.globalInstructions = globalInstructions;

    // 2. Write globalState (title + modelId + instructions — no API keys here)
    await this.context.globalState.update(
      "grokforge.models",
      incomingModels.map(({ title, modelId, instructions }) => ({ title, modelId, instructions }))
    );

    // 3. Write API keys in display order
    for (let i = 0; i < newCount; i++) {
      await this.context.secrets.store(`grokforge.apiKey.${i}`, incomingModels[i].apiKey);
    }

    // 4. Delete orphaned tail keys
    for (let i = newCount; i < previousCount; i++) {
      await this.context.secrets.delete(`grokforge.apiKey.${i}`);
    }

    // 5. Reload and send updated model list to webview
    await this.loadAndSendModels();
  }

  private handleAssistantFinish(userText: string, assistantContent: string, reasoning: string) {
    if (!this.activeSessionId) return;
    const session = this.sessions.find(s => s.id === this.activeSessionId);
    if (!session) return;
    session.messages.push({ role: "user", content: userText });
    session.messages.push({
      role: "assistant",
      content: assistantContent,
      reasoning: reasoning || undefined,
    });
    this.context.workspaceState.update("grokforge.sessions", this.sessions);
  }

  private async handleLoadSession(sessionId: string) {
    // Abort any in-progress generation
    this.abortController?.abort();
    this.abortController = undefined;

    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) return;

    // ChatMessage only has { role, content } — do not include reasoning here.
    // Note: codebase context is NOT restored when loading a historical session.
    // If the user wants codebase context, they must re-attach it via the @ button.
    this.messages = session.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
    this.activeSessionId = sessionId;
    await this.context.workspaceState.update("grokforge.activeSessionId", sessionId);

    this.postMessage({
      type: "sessionLoaded",
      messages: session.messages,
      sessionId,
    });
  }

  private async handleDeleteSession(sessionId: string) {
    // Abort if deleting the active session
    if (sessionId === this.activeSessionId && this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }

    this.sessions = this.sessions.filter(s => s.id !== sessionId);
    await this.context.workspaceState.update("grokforge.sessions", this.sessions);

    if (sessionId === this.activeSessionId) {
      this.activeSessionId = undefined;
      await this.context.workspaceState.update("grokforge.activeSessionId", undefined);
      this.messages = [];
      this.cachedCodebase = null;
      this.postMessage({ type: "clearChat" });
    }

    this.sendSessionsLoaded();
  }

  private async handleRenameSession(sessionId: string, title: string) {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) return;
    session.title = title;
    await this.context.workspaceState.update("grokforge.sessions", this.sessions);
    this.sendSessionsLoaded();
  }

  private sendSessionsLoaded() {
    this.postMessage({
      type: "sessionsLoaded",
      sessions: this.sessions,
      activeSessionId: this.activeSessionId ?? null,
    });
  }

  private async readWorkspaceFiles(): Promise<{ text: string; fileCount: number; workspaceName: string }> {
    const folders = vscode.workspace.workspaceFolders!;
    const workspaceName = folders[0].name;
    const files = await vscode.workspace.findFiles(FILE_GLOB, EXCLUDE_GLOB, MAX_FILES);

    let total = 0;
    const parts: string[] = [];

    for (const file of files) {
      if (total >= MAX_CHARS) break;
      try {
        const bytes = await vscode.workspace.fs.readFile(file);
        const content = Buffer.from(bytes).toString("utf8");
        if (content.includes("\x00")) continue;
        const rel = vscode.workspace.asRelativePath(file);
        const entry = `\`\`\`${rel}\n${content}\n\`\`\``;
        if (total + entry.length > MAX_CHARS) break;
        parts.push(entry);
        total += entry.length;
      } catch {
        continue;
      }
    }

    return { text: parts.join("\n\n"), fileCount: parts.length, workspaceName };
  }

  private postMessage(msg: unknown) {
    this.view?.webview.postMessage(msg);
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.js")
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.css")
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline';">
  <link rel="stylesheet" href="${cssUri}">
  <title>GrokForge</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function buildSystemPrompt(global: string, modelSpecific: string): string | null {
  const parts = [global, modelSpecific].map(s => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
