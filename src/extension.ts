import * as vscode from 'vscode';
import { GutterManager } from './gutterManager';
import { TaskRunner } from './taskRunner';
import { loadRules, matchDocument } from './ruleEngine';

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

  // Prune activeMatches when a document is closed to avoid memory leaks
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      manager.pruneFile(document.uri.toString());
    })
  );

  // Detect gutter clicks: mouse selection landing at column 0 on a decorated line.
  // Known MVP limitation: also fires when the user clicks at the very start of a
  // decorated line in the text area (not in the gutter column).
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
        void runner.run(match.rule.task, match.param).catch((err: unknown) => {
          vscode.window.showErrorMessage(
            `Guttr: Failed to run task "${match.rule.task}": ${String(err)}`
          );
        });
      }
    })
  );

  // Re-scan all visible editors when configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('guttr.rules')) {
        manager.invalidateDecorationCache();
        for (const editor of vscode.window.visibleTextEditors) {
          scanEditor(editor, manager);
        }
      }
    })
  );

  // Expose last captured param for tasks.json inputs integration
  context.subscriptions.push(
    vscode.commands.registerCommand('guttr.getLastParam', () => {
      return runner.getLastParam();
    })
  );

  context.subscriptions.push({
    dispose: () => manager.dispose(),
  });
}

export function deactivate(): void {}
