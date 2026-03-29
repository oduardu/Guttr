# Guttr

Adiciona ícones clicáveis no gutter do editor que executam tasks do VS Code. Cada ícone é gerado por uma regra configurável — uma regex que faz match em linhas do arquivo e captura um parâmetro. O output aparece no painel **Test Results**, sem abrir um terminal novo a cada execução.

---

## Como funciona

1. Você define regras em `guttr.rules` no `settings.json`
2. Para cada linha que faz match com a regex, um ícone ▶ aparece no gutter
3. Ao clicar, a task configurada é executada com variáveis de ambiente injetadas automaticamente
4. O output aparece no painel **Test Results** (ícone de tubo de ensaio na barra lateral)

Os ícones refletem o resultado da execução:

| Estado | Ícone |
|--------|-------|
| Aguardando | ▶ cinza |
| Rodando | ⟳ animado |
| Saiu com código 0 | ✓ verde |
| Saiu com código ≠ 0 | ✗ vermelho |

---

## Configuração

### `settings.json`

```jsonc
{
  "guttr.rules": [
    {
      "name": "PHPUnit - Método",        // Nome exibido no Test Explorer
      "task": "phpunit-method",           // Label da task no tasks.json
      "filePattern": "**/*Test.php",      // Glob: em quais arquivos aplicar
      "rule": {
        "regex": "public\\s+function\\s+(test\\w+)",  // Regex com grupo de captura
        "paramGroup": 1                               // Qual grupo usar como $GUTTR_PARAM (padrão: 1)
      }
    }
  ]
}
```

#### Campos da regra

| Campo | Obrigatório | Descrição |
|-------|:-----------:|-----------|
| `name` | Sim | Nome da regra — aparece no Test Explorer |
| `task` | Sim | Label exato da task no `tasks.json` |
| `filePattern` | Sim | Glob para filtrar arquivos (`**/*Test.php`, `src/**/*.js`) |
| `rule.regex` | Sim | Regex JavaScript. Use grupos de captura `(...)` para extrair o parâmetro |
| `rule.paramGroup` | Não | Índice do grupo de captura para `$GUTTR_PARAM` (padrão: `1`) |

#### Glob patterns suportados

| Pattern | Significado |
|---------|-------------|
| `**/*Test.php` | Qualquer arquivo terminando em `Test.php` em qualquer profundidade |
| `src/**/*.ts` | Arquivos `.ts` dentro de `src/` |
| `*.php` | Arquivos `.php` na raiz do workspace |
| `**/*.{js,ts}` | Arquivos `.js` ou `.ts` em qualquer lugar |

---

### `tasks.json`

A task é uma shell task normal do VS Code. As variáveis `$GUTTR_*` são injetadas como variáveis de ambiente antes da execução — use-as livremente no comando.

```jsonc
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "phpunit-method",
      "type": "shell",
      "command": "php artisan test --filter=$GUTTR_PARAM",
      "problemMatcher": []
    },
    {
      "label": "phpunit-class",
      "type": "shell",
      "command": "php artisan test $GUTTR_RELATIVE_FILE",
      "problemMatcher": []
    }
  ]
}
```

---

## Variáveis de ambiente (`$GUTTR_*`)

Todas as variáveis abaixo são injetadas automaticamente no ambiente da task ao executar:

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `$GUTTR_PARAM` | Valor capturado pelo grupo da regex | `testUserCanLogin` |
| `$GUTTR_FILE` | Caminho absoluto do arquivo | `/project/tests/UserTest.php` |
| `$GUTTR_FILENAME` | Nome do arquivo com extensão | `UserTest.php` |
| `$GUTTR_FILENAME_NO_EXT` | Nome do arquivo sem extensão | `UserTest` |
| `$GUTTR_DIR` | Diretório do arquivo | `/project/tests` |
| `$GUTTR_RELATIVE_FILE` | Caminho relativo à raiz do workspace | `tests/UserTest.php` |
| `$GUTTR_LINE` | Número da linha (base 1) | `5` |
| `$GUTTR_RULE` | Nome da regra que fez match | `PHPUnit - Método` |

---

## Exemplo completo — PHPUnit

### `settings.json`

```jsonc
{
  "guttr.rules": [
    {
      "name": "PHPUnit - Método",
      "task": "phpunit-method",
      "filePattern": "**/*Test.php",
      "rule": {
        "regex": "public\\s+function\\s+(test\\w+)",
        "paramGroup": 1
      }
    },
    {
      "name": "PHPUnit - Classe",
      "task": "phpunit-class",
      "filePattern": "**/*Test.php",
      "rule": {
        "regex": "class\\s+(\\w+Test)\\b",
        "paramGroup": 1
      }
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
      "label": "phpunit-method",
      "type": "shell",
      "command": "php artisan test --filter=$GUTTR_PARAM",
      "problemMatcher": []
    },
    {
      "label": "phpunit-class",
      "type": "shell",
      "command": "php artisan test $GUTTR_RELATIVE_FILE",
      "problemMatcher": []
    }
  ]
}
```

### Arquivo `UserTest.php`

```php
<?php

class UserTest extends TestCase        // ← ▶ clica para rodar toda a classe
{
    public function testUserCanLogin() // ← ▶ clica para rodar só este método
    {
    }

    public function testUserCanRegister() // ← ▶
    {
    }

    public function helperMethod()    // sem ícone — não faz match
    {
    }
}
```

---

## Instalação sem o Marketplace

O Guttr é distribuído como um arquivo `.vsix`. Não precisa publicar no Marketplace — basta gerar o arquivo uma vez.

### 1. Gerar o `.vsix`

Clone o repositório e rode:

```bash
npm install
npm run package   # gera guttr-0.1.0.vsix na raiz do projeto
```

### 2. Instalar

**Via linha de comando (recomendado):**

```bash
code --install-extension guttr-0.1.0.vsix
```

Funciona também em forks do VS Code:

```bash
cursor --install-extension guttr-0.1.0.vsix
```

**Via interface:**

1. Abra o painel de Extensões (`Ctrl+Shift+X` / `Cmd+Shift+X`)
2. Clique no `...` (menu de contexto) no canto superior direito
3. Escolha **Install from VSIX...**
4. Selecione o arquivo `.vsix`

---

## Requisitos

- VS Code 1.85+ (ou fork compatível: Cursor, etc.)
