import * as cp from 'child_process';
import * as vscode from 'vscode';
import { TaskContext } from './types';

function buildEnv(ctx: TaskContext): Record<string, string> {
  return {
    GUTTR_PARAM: ctx.param,
    GUTTR_FILE: ctx.filePath,
    GUTTR_FILENAME: ctx.fileName,
    GUTTR_FILENAME_NO_EXT: ctx.fileNameNoExt,
    GUTTR_DIR: ctx.fileDir,
    GUTTR_RELATIVE_FILE: ctx.relativeFilePath,
    GUTTR_LINE: String(ctx.lineNumber),
    GUTTR_RULE: ctx.ruleName,
  };
}

function getCommandLine(execution: vscode.ShellExecution): string {
  if (execution.commandLine !== undefined) {
    return execution.commandLine;
  }
  const cmd = typeof execution.command === 'string'
    ? execution.command
    : execution.command?.value ?? '';
  const args = (execution.args ?? []).map((a) =>
    typeof a === 'string' ? a : a.value
  );
  return [cmd, ...args].join(' ');
}

export class TaskRunner {
  private lastParam = '';

  getLastParam(): string {
    return this.lastParam;
  }

  async run(
    taskLabel: string,
    ctx: TaskContext,
    output: (text: string) => void,
    failPattern?: string,
    failMessage?: string
  ): Promise<void> {
    this.lastParam = ctx.param;

    const allTasks = await vscode.tasks.fetchTasks();
    const task = allTasks.find((t) => t.name === taskLabel);

    if (!task) {
      vscode.window.showErrorMessage(
        `Guttr: Task "${taskLabel}" not found. Make sure the label matches tasks.json.`
      );
      return;
    }

    if (!(task.execution instanceof vscode.ShellExecution)) {
      vscode.window.showErrorMessage(
        `Guttr: Task "${taskLabel}" must be a shell task.`
      );
      return;
    }

    const commandLine = getCommandLine(task.execution);
    const cwd = this.resolveWorkspaceCwd(task);
    const env = { ...process.env, ...buildEnv(ctx) } as NodeJS.ProcessEnv;
    const failRegex = failPattern ? new RegExp(failPattern) : undefined;
    let outputMatchedFail = false;
    let collectedOutput = '';

    return new Promise((resolve, reject) => {
      const proc = cp.spawn(commandLine, [], { shell: true, env, cwd });

      const handleData = (data: Buffer) => {
        const text = data.toString();
        collectedOutput += text;
        if (failRegex && failRegex.test(text)) {
          outputMatchedFail = true;
        }
        output(text.replace(/\r?\n/g, '\r\n'));
      };

      proc.stdout.on('data', handleData);
      proc.stderr.on('data', handleData);

      proc.on('close', (code) => {
        if (outputMatchedFail) {
          const message = (failMessage ?? 'Output matched failPattern')
            .replace('$OUTPUT', () => collectedOutput.trim());
          reject(new Error(message));
        } else if (code === 0 || code === null) {
          resolve();
        } else {
          reject(new Error(`Exited with code ${code}`));
        }
      });

      proc.on('error', reject);
    });
  }

  private resolveWorkspaceCwd(task: vscode.Task): string | undefined {
    const scope = task.scope;
    if (scope && typeof scope !== 'number') {
      return (scope as vscode.WorkspaceFolder).uri.fsPath;
    }
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }
}
