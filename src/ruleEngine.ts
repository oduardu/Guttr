import * as vscode from 'vscode';
import { GutterRule, LineMatch } from './types';

export function loadRules(): GutterRule[] {
  const config = vscode.workspace.getConfiguration();
  return config.get<GutterRule[]>('gutterRunner.rules', []);
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

    let regex: RegExp;
    try {
      regex = new RegExp(rule.rule.regex);
    } catch {
      vscode.window.showWarningMessage(
        `Guttr: Invalid regex in rule "${rule.name}": ${rule.rule.regex}`
      );
      continue;
    }

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
