import * as path from 'path';
import * as vscode from 'vscode';
import { LineMatch, GutterRule, TaskContext } from './types';
import { TaskRunner } from './taskRunner';

interface ItemData {
  context: TaskContext;
  rule: GutterRule;
}

function buildContext(
  fileUri: vscode.Uri,
  match: LineMatch
): TaskContext {
  const fsPath = fileUri.fsPath;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
  const relativeFilePath = workspaceFolder
    ? path.relative(workspaceFolder.uri.fsPath, fsPath)
    : fsPath;

  return {
    param: match.param,
    filePath: fsPath,
    fileName: path.basename(fsPath),
    fileNameNoExt: path.basename(fsPath, path.extname(fsPath)),
    fileDir: path.dirname(fsPath),
    relativeFilePath,
    lineNumber: match.line + 1,
    ruleName: match.rule.name,
  };
}

export class GuttrTestController {
  private controller: vscode.TestController;
  private itemData = new Map<string, ItemData>();

  constructor(private runner: TaskRunner) {
    this.controller = vscode.tests.createTestController('guttr', 'Guttr');

    this.controller.createRunProfile(
      'Run',
      vscode.TestRunProfileKind.Run,
      (request, token) => this.runHandler(request, token),
      true
    );
  }

  updateFile(fileUri: vscode.Uri, matches: LineMatch[]): void {
    const fileId = fileUri.toString();

    if (matches.length === 0) {
      this.controller.items.delete(fileId);
      return;
    }

    let fileItem = this.controller.items.get(fileId);
    if (!fileItem) {
      const fileName = path.basename(fileUri.fsPath);
      fileItem = this.controller.createTestItem(fileId, fileName, fileUri);
      this.controller.items.add(fileItem);
    }

    fileItem.children.replace(
      matches.map((match) => {
        const itemId = `${fileId}::${match.ruleIndex}::${match.line}`;
        const item = this.controller.createTestItem(itemId, match.param, fileUri);
        item.range = new vscode.Range(match.line, 0, match.line, 0);
        this.itemData.set(itemId, {
          context: buildContext(fileUri, match),
          rule: match.rule,
        });
        return item;
      })
    );
  }

  pruneFile(fileUri: string): void {
    this.controller.items.delete(fileUri);
  }

  private async runHandler(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken
  ): Promise<void> {
    const run = this.controller.createTestRun(request);

    const items: vscode.TestItem[] = [];
    if (request.include) {
      request.include.forEach((item) => this.collectLeaves(item, items));
    } else {
      this.controller.items.forEach((item) => this.collectLeaves(item, items));
    }

    for (const item of items) {
      if (token.isCancellationRequested) {
        run.skipped(item);
        continue;
      }

      const data = this.itemData.get(item.id);
      if (!data) {
        continue;
      }

      run.started(item);

      await this.runner
        .run(data.rule.task, data.context, (text) => run.appendOutput(text, undefined, item), data.rule.failPattern, data.rule.failMessage)
        .then(
          () => run.passed(item),
          (err: unknown) => run.failed(item, new vscode.TestMessage(String(err)))
        );
    }

    run.end();
  }

  private collectLeaves(item: vscode.TestItem, out: vscode.TestItem[]): void {
    if (item.children.size === 0) {
      out.push(item);
    } else {
      item.children.forEach((child) => this.collectLeaves(child, out));
    }
  }

  dispose(): void {
    this.controller.dispose();
    this.itemData.clear();
  }
}
