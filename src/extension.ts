import * as vscode from 'vscode';
import { GutterManager } from './gutterManager';
import { TaskRunner } from './taskRunner';
import { loadRules, matchDocument } from './ruleEngine';

const DEBOUNCE_MS = 300;

function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
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
  manager: GutterManager
): void {
  const rules = loadRules();
  const matches = matchDocument(editor.document, rules);
  manager.updateDecorations(editor, matches);
}

export function activate(context: vscode.ExtensionContext): void {
  const manager = new GutterManager();
  const runner = new TaskRunner();

  // Scan the currently visible editors on activation
  for (const editor of vscode.window.visibleTextEditors) {
    scanEditor(editor, manager);
  }

  // Re-scan when switching to a different editor tab
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        scanEditor(editor, manager);
      }
    })
  );

  // Re-scan with debounce on document edits
  const debouncedScan = debounce((document: vscode.TextDocument) => {
    const editor = vscode.window.visibleTextEditors.find(
      (e) => e.document === document
    );
    if (editor) {
      scanEditor(editor, manager);
    }
  }, DEBOUNCE_MS);

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      debouncedScan(e.document);
    })
  );

  // Detect gutter clicks: mouse selection landing at column 0 on a decorated line
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (e.kind !== vscode.TextEditorSelectionChangeKind.Mouse) {
        return;
      }
      if (e.selections.length !== 1) {
        return;
      }

      const selection = e.selections[0];
      if (!selection.isEmpty || selection.start.character !== 0) {
        return;
      }

      const fileUri = e.textEditor.document.uri.toString();
      const match = manager.getMatchAtLine(fileUri, selection.start.line);

      if (match) {
        runner.run(match.rule.task, match.param);
      }
    })
  );

  // Re-scan all visible editors when configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('gutterRunner.rules')) {
        for (const editor of vscode.window.visibleTextEditors) {
          scanEditor(editor, manager);
        }
      }
    })
  );

  // Expose last captured param for tasks.json inputs integration
  context.subscriptions.push(
    vscode.commands.registerCommand('gutterRunner.getLastParam', () => {
      return runner.getLastParam();
    })
  );

  context.subscriptions.push({
    dispose: () => manager.dispose(),
  });
}

export function deactivate(): void {}
