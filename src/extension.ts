import * as vscode from 'vscode';
import { GuttrTestController } from './testController';
import { TaskRunner } from './taskRunner';
import { loadRules, matchDocument, clearRuleWarnings } from './ruleEngine';

const DEBOUNCE_MS = 300;

function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delay: number
): (...args: TArgs) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args) => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => fn(...args), delay);
  };
}

function scanEditor(
  editor: vscode.TextEditor,
  testController: GuttrTestController
): void {
  const rules = loadRules();
  const matches = matchDocument(editor.document, rules);
  testController.updateFile(editor.document.uri, matches);
}

export function activate(context: vscode.ExtensionContext): void {
  const runner = new TaskRunner();
  const testController = new GuttrTestController(runner);

  for (const editor of vscode.window.visibleTextEditors) {
    scanEditor(editor, testController);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        scanEditor(editor, testController);
      }
    })
  );

  const debouncedScan = debounce((document: vscode.TextDocument) => {
    const editor = vscode.window.visibleTextEditors.find(
      (e) => e.document === document
    );
    if (editor) {
      scanEditor(editor, testController);
    }
  }, DEBOUNCE_MS);

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      debouncedScan(e.document);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      testController.pruneFile(document.uri.toString());
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('guttr.rules')) {
        clearRuleWarnings();
        for (const editor of vscode.window.visibleTextEditors) {
          scanEditor(editor, testController);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('guttr.getLastParam', () => {
      return runner.getLastParam();
    })
  );

  context.subscriptions.push({
    dispose: () => testController.dispose(),
  });
}

export function deactivate(): void {}
