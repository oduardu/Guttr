import * as vscode from 'vscode';
import { GutterRule, LineMatch } from './types';

// Tracks rules already warned about to avoid repeating the same message
const warnedRules = new Set<string>();

export function clearRuleWarnings(): void {
  warnedRules.clear();
}

function isValidShape(value: unknown, index: number): value is GutterRule {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const obj = value as Record<string, unknown>;
  const name = typeof obj['name'] === 'string' ? obj['name'] : `rule[${index}]`;
  const ruleObj = obj['rule'];

  if (
    typeof obj['name'] !== 'string' ||
    typeof obj['task'] !== 'string' ||
    typeof obj['filePattern'] !== 'string' ||
    !ruleObj ||
    typeof ruleObj !== 'object' ||
    typeof (ruleObj as Record<string, unknown>)['regex'] !== 'string'
  ) {
    const key = `shape:${name}`;
    if (!warnedRules.has(key)) {
      warnedRules.add(key);
      vscode.window.showWarningMessage(
        `Guttr: Skipping malformed rule "${name}". Required fields: name, task, filePattern, rule.regex.`
      );
    }
    return false;
  }

  return true;
}

export function loadRules(): GutterRule[] {
  const config = vscode.workspace.getConfiguration();
  const raw = config.get<unknown[]>('guttr.rules', []);

  return raw.filter((item, index): item is GutterRule => {
    if (!isValidShape(item, index)) {
      return false;
    }

    try {
      new RegExp(item.rule.regex);
      return true;
    } catch {
      const key = `regex:${item.name}`;
      if (!warnedRules.has(key)) {
        warnedRules.add(key);
        vscode.window.showWarningMessage(
          `Guttr: Invalid regex in rule "${item.name}": ${item.rule.regex}`
        );
      }
      return false;
    }
  });
}

/**
 * Converts a glob pattern to a RegExp.
 * Supports: ** (any path depth), * (any chars except /), ? (single char except /)
 */
export function globToRegex(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/');
  let regexStr = '';
  let i = 0;

  while (i < normalized.length) {
    const c = normalized[i];

    if (c === '*' && normalized[i + 1] === '*') {
      if (normalized[i + 2] === '/') {
        // **/ matches zero or more path segments
        regexStr += '(?:.*/)?';
        i += 3;
      } else {
        // ** at end or before non-slash
        regexStr += '.*';
        i += 2;
      }
    } else if (c === '*') {
      regexStr += '[^/]*';
      i++;
    } else if (c === '?') {
      regexStr += '[^/]';
      i++;
    } else {
      regexStr += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      i++;
    }
  }

  // Allow matching at any path depth if pattern doesn't anchor to root
  if (!normalized.startsWith('/') && !normalized.startsWith('**/')) {
    regexStr = '(?:.*/)?' + regexStr;
  }

  return new RegExp('^' + regexStr + '$');
}

export function fileMatchesPattern(filePath: string, pattern: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  try {
    return globToRegex(pattern).test(normalized);
  } catch {
    return false;
  }
}

export function matchDocument(
  document: vscode.TextDocument,
  rules: GutterRule[]
): LineMatch[] {
  const filePath = document.uri.fsPath;
  const matches: LineMatch[] = [];

  for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex++) {
    const rule = rules[ruleIndex];

    if (!fileMatchesPattern(filePath, rule.filePattern)) {
      continue;
    }

    const regex = new RegExp(rule.rule.regex);
    const paramGroup = rule.rule.paramGroup ?? 1;

    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
      const lineText = document.lineAt(lineIndex).text;
      const match = regex.exec(lineText);

      if (match && match[paramGroup] !== undefined) {
        matches.push({
          line: lineIndex,
          param: match[paramGroup],
          rule,
          ruleIndex,
        });
      }
    }
  }

  return matches;
}
