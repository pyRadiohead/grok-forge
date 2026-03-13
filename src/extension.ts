import * as vscode from "vscode";
import { ChatViewProvider } from "./chat/chat-provider";

export function activate(context: vscode.ExtensionContext) {
  const chatProvider = new ChatViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("grokforge.chat", chatProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),

    vscode.commands.registerCommand("grokforge.setApiKey", async () => {
      const key = await vscode.window.showInputBox({
        prompt: "Enter your xAI API key",
        password: true,
        ignoreFocusOut: true,
      });
      if (key) {
        await context.secrets.store("grokforge.apiKey", key);
        chatProvider.onApiKeyChanged();
        vscode.window.showInformationMessage("GrokForge: API key saved.");
      }
    }),

    vscode.commands.registerCommand("grokforge.newChat", () => {
      chatProvider.newChat();
    })
  );
}

export function deactivate() {}
