import * as vscode from 'vscode';
import { GutterRule, LineMatch } from './types';

// Maps common VS Code theme color IDs to their typical hex values
const THEME_COLOR_MAP: Record<string, string> = {
  'terminal.ansiGreen': '#4EC94E',
  'terminal.ansiRed': '#F44747',
  'terminal.ansiYellow': '#CCA700',
  'terminal.ansiBlue': '#569CD6',
  'terminal.ansiMagenta': '#BC3FBC',
  'terminal.ansiCyan': '#11A8CD',
  'terminal.ansiBrightGreen': '#23D18B',
  'terminal.ansiBrightRed': '#F14C4C',
  'terminal.ansiBrightYellow': '#F5F543',
  'terminal.ansiBrightBlue': '#3B8EEA',
  'testing.iconPassed': '#73C991',
  'testing.iconFailed': '#F14C4C',
  'testing.runAction': '#4EC94E',
  'charts.green': '#89D185',
  'charts.red': '#F48771',
  'charts.yellow': '#CCA700',
  'charts.blue': '#569CD6',
};

// SVG path data for common codicon IDs
const ICON_PATHS: Record<string, string> = {
  'play': 'M3 2 L13 8 L3 14 Z',
  'testing-run-icon': 'M3 2 L13 8 L3 14 Z',
  'debug-start': 'M3 2 L13 8 L3 14 Z',
  'run': 'M3 2 L13 8 L3 14 Z',
  'run-above': 'M1 1 H15 V3 H1 Z M3 6 L8 14 L13 6 Z',
  'run-all': 'M1 2 L7 8 L1 14 Z M8 2 L14 8 L8 14 Z',
  'beaker': 'M5 1 V7 L1 14 H15 L11 7 V1 Z M5 1 H11',
  'bug': 'M8 3 A4 5 0 1 0 8 13 A4 5 0 1 0 8 3 Z M3 7 H0 M16 7 H13 M3 11 L0 13 M13 11 L16 13',
  'check': 'M1 8 L5 12 L14 3',
  'circle-filled': 'M8 2 A6 6 0 1 0 8 14 A6 6 0 1 0 8 2 Z',
};

const DEFAULT_ICON_PATH = ICON_PATHS['play'];
const DEFAULT_COLOR = '#4EC94E';

// Allowlist: accept only hex colors, rgb(...), hsl(...), or known theme IDs.
// Anything else falls back to the default to prevent SVG attribute injection.
function resolveColor(iconColor?: string): string {
  if (!iconColor) {
    return DEFAULT_COLOR;
  }

  if (/^#[0-9a-fA-F]{3,8}$/.test(iconColor)) {
    return iconColor;
  }
  if (/^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/.test(iconColor)) {
    return iconColor;
  }
  if (/^hsl\(\s*\d+\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*\)$/.test(iconColor)) {
    return iconColor;
  }

  return THEME_COLOR_MAP[iconColor] ?? DEFAULT_COLOR;
}

function buildIconUri(icon: string | undefined, iconColor: string | undefined): vscode.Uri {
  const pathData = ICON_PATHS[icon ?? 'play'] ?? DEFAULT_ICON_PATH;
  const color = resolveColor(iconColor);

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">',
    `<path d="${pathData}" fill="${color}" fill-rule="evenodd"/>`,
    '</svg>',
  ].join('');

  return vscode.Uri.parse(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
}

interface RuleDecoration {
  decorationType: vscode.TextEditorDecorationType;
  rule: GutterRule;
}

export class GutterManager {
  // decoration type per rule (keyed by rule index + name for uniqueness)
  private decorationTypes = new Map<string, RuleDecoration>();

  // active matches per file URI string
  private activeMatches = new Map<string, LineMatch[]>();

  /**
   * Disposes all cached decoration types, forcing recreation on the next
   * updateDecorations call. Call this when rules change at runtime so that
   * updated icons/colors take effect.
   */
  invalidateDecorationCache(): void {
    for (const { decorationType } of this.decorationTypes.values()) {
      decorationType.dispose();
    }
    this.decorationTypes.clear();
  }

  getOrCreateDecoration(rule: GutterRule, ruleIndex: number): vscode.TextEditorDecorationType {
    const key = `${ruleIndex}:${rule.name}`;

    if (!this.decorationTypes.has(key)) {
      const decorationType = vscode.window.createTextEditorDecorationType({
        gutterIconPath: buildIconUri(rule.icon, rule.iconColor),
        gutterIconSize: 'contain',
      });
      this.decorationTypes.set(key, { decorationType, rule });
    }

    return this.decorationTypes.get(key)!.decorationType;
  }

  updateDecorations(editor: vscode.TextEditor, matches: LineMatch[]): void {
    const fileKey = editor.document.uri.toString();
    this.activeMatches.set(fileKey, matches);

    // Group matches by ruleIndex
    const byRule = new Map<number, LineMatch[]>();
    for (const match of matches) {
      const group = byRule.get(match.ruleIndex) ?? [];
      group.push(match);
      byRule.set(match.ruleIndex, group);
    }

    // Apply decorations for each active rule
    for (const [ruleIndex, ruleMatches] of byRule) {
      const rule = ruleMatches[0].rule;
      const decorationType = this.getOrCreateDecoration(rule, ruleIndex);
      const ranges = ruleMatches.map(
        (m) => new vscode.Range(m.line, 0, m.line, 0)
      );
      editor.setDecorations(decorationType, ranges);
    }

    // Clear decorations for rules that no longer have matches in this file
    for (const [key, { decorationType }] of this.decorationTypes) {
      const ruleIndex = parseInt(key.split(':')[0], 10);
      if (!byRule.has(ruleIndex)) {
        editor.setDecorations(decorationType, []);
      }
    }
  }

  clearDecorations(editor: vscode.TextEditor): void {
    for (const { decorationType } of this.decorationTypes.values()) {
      editor.setDecorations(decorationType, []);
    }
    this.activeMatches.delete(editor.document.uri.toString());
  }

  pruneFile(fileUri: string): void {
    this.activeMatches.delete(fileUri);
  }

  /**
   * Returns the first rule match at the given line. When multiple rules match
   * the same line, the one with the lowest ruleIndex (first in configuration)
   * is used for the click action — VS Code renders each rule's gutter icon
   * independently, but the click handler resolves to a single action.
   */
  getMatchAtLine(fileUri: string, line: number): LineMatch | undefined {
    const matches = this.activeMatches.get(fileUri);
    if (!matches) {
      return undefined;
    }
    return matches.find((m) => m.line === line);
  }

  dispose(): void {
    for (const { decorationType } of this.decorationTypes.values()) {
      decorationType.dispose();
    }
    this.decorationTypes.clear();
    this.activeMatches.clear();
  }
}
