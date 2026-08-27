# Integración con Codex (OpenAI)

> 🌐 **Idioma:** [English](../codex.md) | **Español**

> **Codex CLI** (`codex` — Muse de OpenAI) soporta servidores MCP vía `config.toml`. Esta guía integra **Xcode MCP Server** con Codex usando `StdioServerTransport`.

## 1. Requisitos

- Codex CLI instalado: `npm i -g @openai/codex` o `brew install codex`
- Verificación: `codex --version`
- Este repo con `yarn install` y `make test` OK

## 2. Configuración

Codex lee MCP servers desde `~/.codex/config.toml` (global) o `.codex/config.toml` (por proyecto).

### Opción A — Global (`~/.codex/config.toml`)

```toml
# ~/.codex/config.toml

[mcp_servers.xcode]
command = "node"
args = ["/Users/YanxReal/Dev/Tools/Xcode-MPC/index.js"]
# cwd opcional si usas paths relativos
# cwd = "/Users/YanxReal/Dev/Tools/Xcode-MPC"

# Con Yarn (si usas PnP / Berry, preferible node directo)
# [mcp_servers.xcode]
# command = "yarn"
# args = ["--cwd", "/Users/YanxReal/Dev/Tools/Xcode-MPC", "start"]

# Variables de entorno opcionales
# [mcp_servers.xcode.env]
# DEVELOPER_DIR = "/Applications/Xcode.app/Contents/Developer"
```

### Opción B — Por proyecto (`./.codex/config.toml`)

En la raíz de tu app iOS:

```toml
[mcp_servers.xcode]
command = "node"
args = ["../Xcode-MPC/index.js"]
```

### Opción C — Config JSON (Codex >=0.4, alternativo)

Algunas versiones exponen `~/.codex/config.json`:

```json
{
  "mcpServers": {
    "xcode": {
      "command": "node",
      "args": ["/Users/YanxReal/Dev/Tools/Xcode-MPC/index.js"]
    }
  }
}
```

> Si Codex no detecta `config.toml`, prueba ambas rutas y reinicia `codex`.

## 3. Verificación

```bash
# Validar sintaxis del servidor
make lint

# Reiniciar Codex
codex --help
codex mcp list
# debe listar: xcode (47 tools)

# Dentro de codex, prueba:
# "lista las herramientas de xcode"
# "compila MyApp con xcode_build scheme MyApp"
```

Logs del servidor van a stderr:
```
✅ Xcode MCP Server iniciado (stdio) — 47 herramientas registradas
```

Si no aparece, ejecuta manual:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node index.js
```

## 4. Ejemplos de prompts en Codex

### Compilación y diagnóstico

```
Compila el scheme MyApp en Debug para iPhone 15 usando xcode_build
```

→ `xcode_build {scheme:"MyApp", configuration:"Debug", destination:"platform=iOS Simulator,name=iPhone 15"}`

```
Limpia el proyecto y purga DerivedData con xcode_clean
```

### Tests y cobertura

```
Ejecuta xcode_run_tests para MyApp en iPhone 15 y luego xcode_test_coverage
```

### Simuladores

```
Lista los simuladores booted con simctl_list, luego haz boot del iPhone 15 con simctl_lifecycle y toma un screenshot con simctl_media_capture
```

```
Instala build/Debug-iphonesimulator/MyApp.app con simctl_install_launch y abre myapp://detail/42 con simctl_open_url
```

### Dispositivo físico

```
Lista dispositivos físicos con devicectl_list y captura logs 10s con devicectl_logs
```

### Perfilado

```
Graba una traza Time Profiler de 5s con xctrace_profile en /tmp/trace.trace
```

### Firma y versiones

```
Verifica certificados con xcode_certificates_check y haz bump_build con agvtool_version_bump
```

### Localización y Editor

```
Revisa Localizable.xcstrings con xcode_sync_strings
Abre Sources/App.swift línea 42 con xcode_open_at_line
Obtén el archivo activo de Xcode con xcode_get_active_file
```

## 5. Troubleshooting Codex

| Síntoma | Solución |
|---|---|
| `codex mcp list` vacío | Verifica `~/.codex/config.toml` sintaxis TOML, path absoluto a `index.js`, `chmod +x index.js`, `make test` |
| `spawn node ENOENT` | Usa path absoluto a `node`: `which node` → `/opt/homebrew/bin/node` |
| `Cannot find package '@modelcontextprotocol/sdk'` | `yarn install` (nodeLinker: node-modules en `.yarnrc.yml`), no uses `yarn` PnP puro |
| `xcodebuild: command not found` | `sudo xcode-select -s /Applications/Xcode.app` |
| Codex no llama tools | Añade instrucción explícita: "usa la herramienta xcode_build de MCP" |

## 6. Diferencias con OpenCode

| Aspecto | OpenCode | Codex |
|---|---|---|
| Config | `opencode.json` JSON | `~/.codex/config.toml` TOML |
| Clave | `mcpServers` | `mcp_servers` |
| Comando | `node /.../index.js` | idéntico |
| Inspector | `yarn inspect` | `codex mcp list` + logs stderr |

Ver también: [`opencode.md`](opencode.md) · [`claude-code.md`](claude-code.md) · [`tools.md`](tools.md)