export interface GutterRule {
  name: string;
  task: string;
  filePattern: string;
  rule: {
    regex: string;
    paramGroup?: number;
  };
  icon?: string;
  iconColor?: string;
}

export interface LineMatch {
  line: number;
  param: string;
  rule: GutterRule;
  ruleIndex: number;
}

/**
 * Context injected as environment variables when a task is executed.
 *
 * Available in tasks.json "command" as shell env vars:
 *   $GUTTR_PARAM            – value captured by the regex group
 *   $GUTTR_FILE             – absolute path  (/project/tests/UserTest.php)
 *   $GUTTR_FILENAME         – basename with extension  (UserTest.php)
 *   $GUTTR_FILENAME_NO_EXT  – basename without extension  (UserTest)
 *   $GUTTR_DIR              – directory of the file  (/project/tests)
 *   $GUTTR_RELATIVE_FILE    – path relative to workspace root  (tests/UserTest.php)
 *   $GUTTR_LINE             – 1-based line number  (5)
 *   $GUTTR_RULE             – name of the rule that matched
 */
export interface TaskContext {
  param: string;
  filePath: string;
  fileName: string;
  fileNameNoExt: string;
  fileDir: string;
  relativeFilePath: string;
  lineNumber: number;
  ruleName: string;
}
