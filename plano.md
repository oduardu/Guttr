# Plano de Execução — Extensão Guttr (VS Code)

## Decisões de Design

### Mecanismo de Clique no Gutter (Opção A)
Gutter icon real via `TextEditorDecorationType` + `gutterIconPath`.

**Como detectar o clique:**
- `vscode.window.onDidChangeTextEditorSelection` com `kind === TextEditorSelectionChangeKind.Mouse`
- Condição de disparo: `selection.isEmpty && selection.start.character === 0`
- Quando verdadeiro: verificar se a linha tem uma decoração ativa → executar a task correspondente

Limitação conhecida: um clique no início do texto de uma linha também pode disparar. Aceitável para MVP — o comportamento esperado só ocorre em linhas com ícone.

### Execução de Tasks
Usar a **alternativa programática**: `vscode.tasks.executeTask()` construindo um `ShellExecution` diretamente com o parâmetro substituído no comando. Mais simples e autocontido — não depende da configuração de `inputs` no `tasks.json` do usuário.

A extensão busca a task pelo label no `tasks.json` do workspace, substitui o placeholder `${param}` no comando, e executa.

### Ícones no Gutter
`DecorationRenderOptions.gutterIconPath` aceita URI. Para suportar Codicons (ex: `"testing-run-icon"`, `"play"`), a extensão vai **gerar SVGs inline** usando `data:` URI — cada rule cria seu próprio `TextEditorDecorationType` com o SVG correspondente ao Codicon e cor configurados.

Fallback: se o Codicon não for reconhecido, usar `play` como padrão.

---

## Estrutura de Arquivos

```
guttr/
├── src/
│   ├── extension.ts        # activate/deactivate, registra listeners
│   ├── gutterManager.ts    # cria/atualiza decorações por arquivo
│   ├── ruleEngine.ts       # lê configuração, faz match de regex por linha
│   ├── taskRunner.ts       # executa VS Code tasks com param substituído
│   └── types.ts            # interfaces GutterRule, MatchResult, RuleDecoration
├── package.json            # manifest completo
├── tsconfig.json
├── esbuild.config.mjs
└── README.md
```

---

## Fluxo de Dados

```
Arquivo aberto/editado
    └─► ruleEngine.matchDocument(doc)
            └─► filtra regras pelo filePattern (minimatch)
            └─► para cada regra: escaneia linhas com regex
            └─► retorna: Map<ruleIndex, LineMatch[]>
                    └─► gutterManager.updateDecorations(editor, matches)
                            └─► aplica TextEditorDecorationType por linha

Clique detectado (MouseSelection, char 0)
    └─► gutterManager.getMatchAtLine(editor, line)
            └─► retorna { rule, capturedParam } | undefined
    └─► taskRunner.run(rule.task, capturedParam)
            └─► busca task no workspace tasks.json
            └─► substitui ${param} no command
            └─► vscode.tasks.executeTask()
```

---

## Ordem de Implementação

### 1. `types.ts`
```typescript
interface GutterRule {
  name: string
  task: string
  filePattern: string
  rule: {
    regex: string
    paramGroup?: number  // default: 1
  }
  icon?: string          // codicon ID, default: "play"
  iconColor?: string     // theme color string
}

interface LineMatch {
  line: number           // 0-indexed
  param: string          // valor capturado pela regex
  rule: GutterRule
}
```

### 2. `ruleEngine.ts`
- `loadRules()`: lê `gutterRunner.rules` via `vscode.workspace.getConfiguration()`
- `matchDocument(doc, rules)`: retorna `LineMatch[]`
- Usa `minimatch` para filePattern

### 3. `gutterManager.ts`
- Mantém `Map<string, TextEditorDecorationType>` por rule name
- `buildDecorationForRule(rule)`: gera SVG inline com o Codicon + cor
- `updateDecorations(editor, matches)`: aplica/limpa decorações
- `getMatchAtLine(editor, lineNumber)`: consulta para o click handler
- Método `dispose()`: limpa todos os decoration types

### 4. `taskRunner.ts`
- `run(taskLabel, param)`:
  1. `vscode.tasks.fetchTasks()` → encontra task pelo label
  2. Se encontrar: clona a task, substitui `${param}` no comando, executa
  3. Se não encontrar: `vscode.window.showErrorMessage()`
- Expõe comando `gutterRunner.getLastParam` como fallback para quem usar `inputs`

### 5. `extension.ts`
- `activate()`:
  - Registra `onDidChangeActiveTextEditor` → scan + decorações
  - Registra `onDidChangeTextDocument` com debounce 300ms → re-scan
  - Registra `onDidChangeTextEditorSelection` → detecção de clique
  - Registra `onDidChangeConfiguration` → recarrega regras
  - Registra comando `gutterRunner.getLastParam`
- `deactivate()`: dispose do gutterManager

---

## package.json — Pontos Críticos

```jsonc
{
  "name": "guttr",
  "displayName": "Guttr",
  "engines": { "vscode": "^1.85.0" },
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension.js",
  "contributes": {
    "configuration": { /* schema de gutterRunner.rules */ },
    "commands": [
      { "command": "gutterRunner.getLastParam", "title": "Guttr: Get Last Captured Param" }
    ]
  }
}
```

Dependências de build:
- `@types/vscode`, `@types/node`, `typescript` (devDependencies)
- `minimatch` (runtime dependency — para filePattern glob)
- `esbuild` (devDependency — bundler)

---

## Geração de SVG para Codicons

Os Codicons são caracteres unicode da fonte `codicon`. Para renderizar no gutter via `gutterIconPath` (que exige um arquivo de imagem/URI), vamos gerar um SVG com o caractere unicode do codicon:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <text x="8" y="14" text-anchor="middle" font-family="codicon"
        font-size="14" fill="${color}">${unicodeChar}</text>
</svg>
```

Isso será encapsulado em um `data:` URI. A extensão vai manter um mapeamento dos IDs de Codicon mais comuns para seus codepoints unicode.

---

## Casos de Borda

| Situação | Comportamento |
|----------|---------------|
| `filePattern` não corresponde ao arquivo | Nenhuma decoração aplicada |
| Task label não encontrada no workspace | Mensagem de erro via `showErrorMessage` |
| Regex inválida na configuração | Captura erro e loga no Output Channel da extensão |
| Múltiplas regras na mesma linha | Todas aplicadas; clique usa a primeira match encontrada |
| Arquivo sem workspace (standalone) | `fetchTasks()` retorna vazio → erro informativo |

---

## Exemplo de Configuração Final (PHPUnit)

### `settings.json`
```jsonc
{
  "gutterRunner.rules": [
    {
      "name": "PHPUnit - Test Method",
      "task": "phpunit-test-method",
      "filePattern": "**/*Test.php",
      "rule": {
        "regex": "public\\s+function\\s+(test\\w+)",
        "paramGroup": 1
      },
      "icon": "testing-run-icon",
      "iconColor": "terminal.ansiGreen"
    }
  ]
}
```

### `tasks.json`
```jsonc
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "phpunit-test-method",
      "type": "shell",
      "command": "php artisan test --filter=${param}",
      "presentation": {
        "reveal": "always",
        "panel": "dedicated"
      },
      "problemMatcher": []
    }
  ]
}
```

> Nota: o placeholder no `command` é `${param}` (não a sintaxe nativa do VS Code). A extensão faz a substituição antes de executar.

---

## O que está fora de escopo (conforme instrucoes.md)

- Publicação no Marketplace
- Suporte a multi-root workspaces
- UI para configurar regras
- Testes automatizados
- i18n
- Debounce sofisticado (300ms simples é suficiente)
