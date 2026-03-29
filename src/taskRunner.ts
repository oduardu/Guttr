import * as vscode from 'vscode';

export class TaskRunner {
  private lastParam = '';

  /**
   * Returns the last captured parameter. Exposed as the
   * gutterRunner.getLastParam command so tasks.json inputs can use it.
   */
  getLastParam(): string {
    return this.lastParam;
  }

  async run(taskLabel: string, param: string): Promise<void> {
    this.lastParam = param;

    const allTasks = await vscode.tasks.fetchTasks();
    const task = allTasks.find((t) => t.name === taskLabel);

    if (!task) {
      vscode.window.showErrorMessage(
        `Guttr: Task "${taskLabel}" not found. Make sure the label matches tasks.json.`
      );
      return;
    }

    const patched = this.patchTaskParam(task, param);
    await vscode.tasks.executeTask(patched);
  }

  private patchTaskParam(task: vscode.Task, param: string): vscode.Task {
    const execution = task.execution;

    if (!(execution instanceof vscode.ShellExecution)) {
      // Non-shell tasks: execute as-is (param already stored in lastParam
      // for tasks using the gutterRunner.getLastParam input command)
      return task;
    }

    const newExecution = this.substituteParam(execution, param);

    const patched = new vscode.Task(
      task.definition,
      task.scope ?? vscode.TaskScope.Workspace,
      task.name,
      task.source,
      newExecution,
      task.problemMatchers
    );
    patched.presentationOptions = task.presentationOptions;
    patched.group = task.group;
    patched.runOptions = task.runOptions;

    return patched;
  }

  private substituteParam(
    execution: vscode.ShellExecution,
    param: string
  ): vscode.ShellExecution {
    const placeholder = /\$\{param\}/g;
    // Use a replacer function so special `$` sequences in `param`
    // (e.g. `$&`, `$1`) are treated as literals, not replacement patterns.
    const replacer = () => param;

    if (execution.commandLine !== undefined) {
      const newLine = execution.commandLine.replace(placeholder, replacer);
      return new vscode.ShellExecution(newLine, execution.options);
    }

    if (execution.command !== undefined) {
      const rawCmd = execution.command;
      const cmdStr = typeof rawCmd === 'string' ? rawCmd : rawCmd.value;
      const newCmdStr = cmdStr.replace(placeholder, replacer);
      const newCmd =
        typeof rawCmd === 'string'
          ? newCmdStr
          : { value: newCmdStr, quoting: rawCmd.quoting };

      const newArgs = (execution.args ?? []).map((arg) => {
        const raw = typeof arg === 'string' ? arg : arg.value;
        const replaced = raw.replace(placeholder, replacer);
        return typeof arg === 'string'
          ? replaced
          : { value: replaced, quoting: arg.quoting };
      });

      return new vscode.ShellExecution(newCmd, newArgs, execution.options);
    }

    return execution;
  }
}
