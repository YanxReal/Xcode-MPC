# Integración con Claude Code (Anthropic)

> 🌐 **Idioma:** [English](../claude-code.md) | **Español**

> **Claude Code** (`claude` — CLI oficial de Anthropic) soporta MCP vía `claude mcp` y `.mcp.json`. Esta guía integra **Xcode MCP Server** con Claude Code.

## 1. Requisitos

- Claude Code instalado: `npm i -g @anthropic-ai/claude-code` o `brew install claude-code`
- Verificación: `claude --version` / `claude mcp --help`
- Este repo con `yarn install` y `make test` OK

## 2. Configuración

Claude Code ofrece 3 formas (elige una):

### Opción A — CLI `claude mcp add` (recomendada, global)

```bash
# Añade servidor xcode (stdio) — persiste en ~/.claude.json
claude mcp add xcode -- node /Users/YanxReal/Dev/Tools/Xcode-MPC/index.js

# Con Yarn
# claude mcp add xcode -- yarn --cwd /Users/YanxReal/Dev/Tools/Xcode-MPC start

# Con env (ej. Xcode beta)
# claude mcp add xcode --env DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer -- node /Users/YanxReal/Dev/Tools/Xcode-MPC/index.js

# Verificar
claude mcp list
# xcode: node /Users/YanxReal/Dev/Tools/Xcode-MPC/index.js (connected) — 25 tools

# Si necesitas scope proyecto (solo este repo)
# claude mcp add xcode --scope project -- node /Users/YanxReal/Dev/Tools/Xcode-MPC/index.js
```

### Opción B — `.mcp.json` (por proyecto, commiteable)

Crea `.mcp.json` en la raíz de tu app iOS:

```json
{
  "mcpServers": {
    "xcode": {
      "command": "node",
      "args": ["/Users/YanxReal/Dev/Tools/Xcode-MPC/index.js"],
      "env": {}
    }
  }
}
```

Ruta relativa al repo:

```json
{
  "mcpServers": {
    "xcode": {
      "command": "node",
      "args": ["../Xcode-MPC/index.js"]
    }
  }
}
```

Claude Code lo detecta automáticamente al iniciar en ese directorio. Para permitirlo si usas workspace trust, confirma `Allow` cuando pregunte.

### Opción C — `settings` JSON (`~/.claude/settings.json`)

```json
{
  "mcpServers": {
    "xcode": {
      "command": "yarn",
      "args": ["--cwd", "/Users/YanxReal/Dev/Tools/Xcode-MPC", "start"]
    }
  }
}
```

### Opción D — STDIO explícito con `claude mcp add-json`

```bash
claude mcp add-json xcode '{"command":"node","args":["/Users/YanxReal/Dev/Tools/Xcode-MPC/index.js"]}'
```

## 3. Verificación

```bash
# 1. Lint y smoke
make lint && make test

# 2. Listar servidores y herramientas
claude mcp list
claude mcp get xcode

# Debe mostrar: 25 tools (xcode_build, simctl_list, etc.)

# 3. Dentro de Claude Code, prueba:
# "¿Qué herramientas de Xcode tienes?"
# "Compila MyApp con xcode_build"
# "Lista simuladores booted con simctl_list"
```

Logs van a stderr del servidor. Para debug:

```bash
claude --mcp-debug
# o
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node index.js | jq
```

## 4. Ejemplos de prompts en Claude Code

### Compilación

```
Compila el scheme MyApp en Release para generic/platform=iOS con xcode_build
```

```
Analiza el código con xcode_analyze y lista los schemes con xcode_list_schemes
```

### Tests

```
Corre los tests de MyAppTests en iPhone 15 con xcode_run_tests y extrae el reporte con xcode_test_coverage
```

### Simuladores (flujo completo)

```
Lista simuladores booted con simctl_list.
Haz boot del iPhone 15 Pro si no está encendido con simctl_lifecycle
Instala build/Debug-iphonesimulator/MyApp.app con simctl_install_launch y lánzalo
Toma un screenshot en /tmp/01.png con simctl_media_capture
Simula ubicación en Madrid con simctl_location_mock y abre myapp://home con simctl_open_url
Cambia a dark mode con simctl_ui_appearance y concede permiso de cámara con simctl_privacy_control
Envía una push de prueba con simctl_push_notification
```

### Dispositivo físico

```
Lista iPhones conectados con devicectl_list
Captura logs 15s del dispositivo <UDID> con devicectl_logs
```

### Perfilado y Firma

```
Graba 10s de Time Profiler con xctrace_profile en /tmp/profile.trace
Verifica certificados con xcode_certificates_check y sube el build con agvtool_version_bump bump_build
Archiva y exporta IPA con xcode_archive_export usando ExportOptions.plist
```

### Editor y Localización

```
Dame el archivo activo de Xcode con xcode_get_active_file
Abre Sources/ContentView.swift:42 con xcode_open_at_line
Revisa qué traducciones faltan en Localizable.xcstrings con xcode_sync_strings
Formatea Sources/ con swift_format_lint mode format
```

## 5. Permisos y Trust

Claude Code puede pedir aprobación la primera vez que usa una tool MCP que ejecuta shell (`xcodebuild`, `simctl`).

- Responde `Allow` o `Allow for this session`
- Para CI / headless: `claude --allow-dangerously-skip-permissions` (no recomendado)

Si usas `.mcp.json` en repo compartido, cada colaborador debe tener `node` y `Xcode` instalados; el path a `index.js` debe ser absoluto o relativo correcto.

## 6. Troubleshooting Claude Code

| Síntoma | Solución |
|---|---|
| `claude mcp list` no muestra xcode | `claude mcp add xcode -- node /abs/path/index.js` y `claude mcp list` de nuevo; verifica `~/.claude.json` |
| `Cannot find package '@modelcontextprotocol/sdk'` | `yarn install` con `nodeLinker: node-modules` en `.yarnrc.yml`; no PnP puro |
| `xcodebuild: error: SDK not found` | `sudo xcode-select -s /Applications/Xcode.app` y `make doctor` |
| `No devices are booted` | `simctl_lifecycle {action:"boot", udid:"..."} ` o `open -a Simulator` |
| Claude no invoca tools automáticamente | Se explícito: "usa la herramienta MCP xcode_build" o habilita `tools` en el prompt |
| `.mcp.json` ignorado | Está en `.gitignore`? Debe estar commiteado; ejecuta `claude mcp list` dentro del dir del proyecto |
| Logs vacíos | `claude --mcp-debug` y revisa stderr `✅ Xcode MCP Server iniciado` |

## 7. Diferencias con OpenCode y Codex

| Cliente | Config | Comando |
|---|---|---|
| **OpenCode** | `opencode.json` (`mcpServers`) | `node /.../index.js` |
| **Codex** | `~/.codex/config.toml` (`mcp_servers`) | `node /.../index.js` |
| **Claude Code** | `claude mcp add` / `.mcp.json` (`mcpServers`) | `claude mcp add xcode -- node ...` |

Todos usan el mismo `index.js` stdio — mismo `tools/list` (25 tools). Ver también: [`opencode.md`](opencode.md) · [`codex.md`](codex.md) · [`tools.md`](tools.md)