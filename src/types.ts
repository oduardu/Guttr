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
