import * as vscode from "vscode";
import { handleMessage, WebviewMessage } from "./message-handler";
import { ChatMessage } from "../api/grok-client";
import { GrokConfig, defaultConfig } from "../config";

const FILE_GLOB = "**/*.{ts,tsx,js,jsx,vue,py,go,rs,java,cs,cpp,c,h,md,css,scss,html,sh}";
// Excludes: build artifacts, secrets (.env, *.pem/key), lock files, minified/map files
const EXCLUDE_GLOB = "{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/.vscode/**,**/coverage/**,**/__pycache__/**,**/*.min.js,**/*.map,**/.env,**/.env.*,**/*.pem,**/*.key,**/*.p12,**/package-lock.json,**/yarn.lock,**/pnpm-lock.yaml}";
const MAX_FILES = 200;
const MAX_CHARS = 80_000;

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private messages: ChatMessage[] = [];
  private config: GrokConfig = { ...defaultConfig };
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

    // Send API key status once the webview is ready
    this.context.secrets.get("grokforge.apiKey").then((key) => {
      this.postMessage({ type: "apiKeyStatus", hasKey: !!key });
    });
  }

  onApiKeyChanged() {
    this.postMessage({ type: "apiKeyStatus", hasKey: true });
  }

  newChat() {
    this.messages = [];
    this.abortController?.abort();
    this.postMessage({ type: "clearChat" });
  }

  private async onMessage(msg: WebviewMessage) {
    const apiKey = await this.context.secrets.get("grokforge.apiKey");
    handleMessage(msg, {
      apiKey,
      messages: this.messages,
      config: this.config,
      abortController: this.abortController,
      postMessage: (m) => this.postMessage(m),
      setAbortController: (ac) => {
        this.abortController = ac;
      },
      updateConfig: (partial) => {
        this.config = { ...this.config, ...partial };
      },
      readWorkspaceFiles: () => this.readWorkspaceFiles(),
    });
  }

  private async readWorkspaceFiles(): Promise<{ text: string; fileCount: number }> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return { text: "", fileCount: 0 };
    }

    const files = await vscode.workspace.findFiles(FILE_GLOB, EXCLUDE_GLOB, MAX_FILES);

    let total = 0;
    const parts: string[] = [];

    for (const file of files) {
      if (total >= MAX_CHARS) break;
      try {
        const bytes = await vscode.workspace.fs.readFile(file);
        const content = Buffer.from(bytes).toString("utf8");
        if (content.includes("\x00")) continue; // skip binary
        const rel = vscode.workspace.asRelativePath(file);
        const entry = `\`\`\`${rel}\n${content}\n\`\`\``;
        if (total + entry.length > MAX_CHARS) break;
        parts.push(entry);
        total += entry.length;
      } catch {
        continue;
      }
    }

    return { text: parts.join("\n\n"), fileCount: parts.length };
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
