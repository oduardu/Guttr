# Prompt: VS Code Guttr Extension

## Contexto

Crie uma extensão para **VS Code** chamada **"Guttr"** usando **TypeScript**. A extensão é um MVP para uso interno que permite configurar **ícones no gutter** (a coluna à esquerda do editor, onde ficam os breakpoints) que, ao serem clicados, executam **Tasks do VS Code** (`tasks.json`) passando parâmetros extraídos automaticamente do código-fonte.

O caso de uso principal é rodar testes PHPUnit por método, mas a extensão deve ser **genérica e agnóstica de linguagem**, funcionando com qualquer linguagem ou framework desde que configurada corretamente.

---

## Configuração

A extensão deve expor uma configuração no `settings.json` do VS Code sob o namespace `gutterRunner.rules`. Essa configuração é um **array de regras**, permitindo múltiplas configurações simultâneas.

### Estrutura de cada regra:

```jsonc
{
  "gutterRunner.rules": [
    {
      "name": "PhpUnit - Test Method",           // Nome descritivo da regra (exibido em tooltips)
      "task": "phpunit-test-method",              // Nome exato da Task definida no tasks.json
      "filePattern": "**/*Test.php",              // Glob pattern para filtrar em quais arquivos a regra se aplica
      "rule": {
        "regex": "public\\s+function\\s+(test\\w+)", // Regex para match na linha. Grupo de captura (1) = param
        "paramGroup": 1                              // Qual grupo de captura da regex usar como parâmetro (default: 1)
      },
      "icon": "testing-run-icon",                 // ID do ícone do VS Code (Codicon) — ex: "testing-run-icon", "play", "debug-start"
      "iconColor": "terminal.ansiGreen"           // (Opcional) Cor do ícone usando theme colors do VS Code
    }
  ]
}
```

### Exemplo de tasks.json correspondente:

```jsonc
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "phpunit-test-method",
      "type": "shell",
      "command": "php artisan test --filter=${input:testMethodName}",
      "presentation": {
        "reveal": "always",
        "panel": "dedicated",
        "focus": false
      },
      "problemMatcher": []
    }
  ],
  "inputs": [
    {
      "id": "testMethodName",
      "type": "command",
      "command": "gutterRunner.getLastParam"  // Comando exposto pela extensão para fornecer o param capturado
    }
  ]
}
```

> **Alternativa**: Se a integração via `inputs` for muito complexa para o MVP, a extensão pode executar a task programaticamente via `vscode.tasks.executeTask()` construindo o comando com o parâmetro injetado diretamente (substituindo um placeholder como `${param}` no campo command da regra).

---

## Comportamento Esperado

### 1. Scan do documento
- Quando um arquivo é aberto ou editado, a extensão verifica se o arquivo corresponde ao `filePattern` de alguma regra.
- Para cada regra que se aplica, a extensão escaneia **todas as linhas** do documento procurando matches da `regex`.
- Em cada linha com match, um **ícone é renderizado no gutter** (coluna de breakpoints).

### 2. Clique no ícone
- Ao clicar no ícone do gutter, a extensão:
  1. Extrai o parâmetro da linha usando o grupo de captura da regex (`paramGroup`).
  2. Executa a Task do VS Code correspondente (campo `task`), passando o parâmetro extraído.
  3. O output da task deve aparecer no **Output Panel** do VS Code.

### 3. Múltiplas regras
- Múltiplas regras podem se aplicar ao mesmo arquivo (ex: uma para métodos `test*`, outra para classes `*Test`).
- Cada regra pode ter seu próprio ícone e cor, permitindo diferenciar visualmente.

### 4. Atualização dinâmica
- Os ícones do gutter devem se atualizar automaticamente quando o usuário edita o arquivo (adiciona/remove métodos de teste, etc.).

---

## Requisitos Técnicos

### Stack
- **Linguagem**: TypeScript
- **Engine**: VS Code Extension API
- **Bundler**: esbuild (padrão do Yeoman generator)
- **Mínimo VS Code version**: 1.85+

### APIs do VS Code a utilizar
- `vscode.languages.registerCodeLensProvider` ou `TextEditorDecorationType` para gutter icons
- `vscode.tasks.executeTask()` para execução de tasks
- `vscode.workspace.getConfiguration()` para ler as configurações
- `vscode.workspace.onDidChangeTextDocument` para atualização dinâmica
- `vscode.window.createOutputChannel()` para output (se necessário complementar)

### Estrutura de arquivos sugerida

```
gutter-runner/
├── src/
│   ├── extension.ts          // Ponto de entrada: activate/deactivate
│   ├── gutterManager.ts      // Gerencia a criação/atualização dos gutter icons
│   ├── ruleEngine.ts         // Lê as configurações e faz o matching de regex nas linhas
│   ├── taskRunner.ts         // Executa as VS Code Tasks com o param
│   └── types.ts              // Interfaces TypeScript (GutterRule, MatchResult, etc.)
├── package.json              // Manifest da extensão (contributes, activationEvents, configuration schema)
├── tsconfig.json
├── esbuild.config.js
└── README.md
```

### package.json — contributes essenciais

```jsonc
{
  "contributes": {
    "configuration": {
      "title": "Guttr",
      "properties": {
        "gutterRunner.rules": {
          "type": "array",
          "default": [],
          "description": "Array de regras para exibir ícones no gutter e executar tasks.",
          "items": {
            "type": "object",
            "properties": {
              "name": { "type": "string", "description": "Nome descritivo da regra" },
              "task": { "type": "string", "description": "Label da task no tasks.json" },
              "filePattern": { "type": "string", "description": "Glob pattern dos arquivos alvo" },
              "rule": {
                "type": "object",
                "properties": {
                  "regex": { "type": "string", "description": "Regex para match. Use grupos de captura para extrair o param." },
                  "paramGroup": { "type": "number", "default": 1, "description": "Índice do grupo de captura a usar como param." }
                },
                "required": ["regex"]
              },
              "icon": { "type": "string", "default": "play", "description": "Codicon ID para o gutter" },
              "iconColor": { "type": "string", "description": "Theme color para o ícone" }
            },
            "required": ["name", "task", "filePattern", "rule"]
          }
        }
      }
    },
    "commands": [
      {
        "command": "gutterRunner.getLastParam",
        "title": "Guttr: Get Last Captured Param"
      }
    ]
  }
}
```

---

## Fora de escopo (MVP)

- Não é necessário publicar no Marketplace (uso interno via `.vsix`).
- Não é necessário suporte a multi-root workspaces.
- Não é necessário UI para configurar regras (apenas `settings.json`).
- Não é necessário testes automatizados (pode ser feito depois).
- Não é necessário internacionalização (i18n).
- Não é necessário debounce sofisticado (um debounce simples de ~300ms no scan é suficiente).

---

## Exemplo de Uso Completo

### 1. Arquivo `UserTest.php`:
```php
class UserTest extends TestCase
{
    public function testUserCanRegister()
    {
        // ...
    }

    public function testUserCanLogin()
    {
        // ...
    }

    public function helperMethod()
    {
        // Sem ícone — não faz match com a regex
    }
}
```

### 2. Resultado esperado:
- Linha do `testUserCanRegister` → ícone ▶ verde no gutter
- Linha do `testUserCanLogin` → ícone ▶ verde no gutter
- Linha do `helperMethod` → sem ícone
- Ao clicar no ícone de `testUserCanLogin`:
  - Executa a task `phpunit-test-method`
  - Param capturado: `testUserCanLogin`
  - Comando executado: `php artisan test --filter=testUserCanLogin`
  - Output aparece no Output Panel

---

## Entregáveis

1. **Código-fonte completo** da extensão em TypeScript, pronto para compilar.
2. **package.json** com o manifest completo da extensão.
3. **README.md** com instruções de instalação local (via `vsce package` → `.vsix`).
4. **Exemplo de configuração** (`settings.json` + `tasks.json`) para PHPUnit.