import * as vscode from "vscode";
import { ChatViewProvider } from "./chat/chat-provider";

export function activate(context: vscode.ExtensionContext) {
  const chatProvider = new ChatViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("grokforge.chat", chatProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),

    vscode.commands.registerCommand("grokforge.newChat", () => {
      chatProvider.newChat();
    })
  );
}

export function deactivate() {}
