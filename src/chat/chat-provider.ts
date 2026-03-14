import * as vscode from "vscode";
import { handleMessage, WebviewMessage } from "./message-handler";
import { ChatMessage } from "../api/grok-client";
import { ModelConfig, RequestConfig } from "../config";

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

    this.loadAndSendModels();
  }

  newChat() {
    this.messages = [];
    this.cachedCodebase = null;
    this.abortController?.abort();
    this.abortController = undefined;
    this.postMessage({ type: "clearChat" });
  }

  getRequestConfig(index: number): RequestConfig | null {
    const model = this.models[index];
    if (!model) return null;
    return { modelId: model.modelId, apiKey: model.apiKey, store: false };
  }

  private async loadAndSendModels() {
    const storedHeight: number | undefined = this.context.globalState.get("grokforge.chatHeight");

    const timeoutHandle = setTimeout(() => {
      this.postMessage({ type: "modelsLoaded", models: [], chatHeight: storedHeight });
    }, 5000);

    try {
      const modelMeta: Array<{ title: string; modelId: string }> =
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
          return { title: m.title, modelId: m.modelId, apiKey, unconfigured: unconfigured ? true : undefined };
        })
      );

      clearTimeout(timeoutHandle);
      this.models = models;
      this.postMessage({ type: "modelsLoaded", models, chatHeight: storedHeight });
    } catch {
      clearTimeout(timeoutHandle);
      this.postMessage({ type: "modelsLoaded", models: [], chatHeight: storedHeight });
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
        await this.handleSaveSettings(msg.models);
        return;
      case "saveChatHeight":
        await this.context.globalState.update("grokforge.chatHeight", msg.height);
        return;
      default:
        handleMessage(msg, {
          messages: this.messages,
          abortController: this.abortController,
          postMessage: (m) => this.postMessage(m),
          setAbortController: (ac) => { this.abortController = ac; },
          getRequestConfig: (i) => this.getRequestConfig(i),
          getCachedCodebase: () => this.cachedCodebase,
        });
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
    incomingModels: Array<{ title: string; modelId: string; apiKey: string }>
  ) {
    const previousCount: number =
      (this.context.globalState.get<Array<unknown>>("grokforge.models") ?? []).length;
    const newCount = incomingModels.length;

    // 1. Write globalState first (minimises corruption window)
    await this.context.globalState.update(
      "grokforge.models",
      incomingModels.map(({ title, modelId }) => ({ title, modelId }))
    );

    // 2. Write API keys in display order
    for (let i = 0; i < newCount; i++) {
      await this.context.secrets.store(`grokforge.apiKey.${i}`, incomingModels[i].apiKey);
    }

    // 3. Delete orphaned tail keys
    for (let i = newCount; i < previousCount; i++) {
      await this.context.secrets.delete(`grokforge.apiKey.${i}`);
    }

    // 4. Reload and send updated model list to webview
    await this.loadAndSendModels();
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

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
