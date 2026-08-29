# Integración con OpenCode

> 🌐 **Idioma:** [English](../opencode.md) | **Español**

## Configuración

OpenCode lee servidores MCP desde `opencode.json` (global o local).

### Global (recomendado)

`~/.config/opencode/opencode.json`:

```json
{
  "mcpServers": {
    "xcode": {
      "command": "node",
      "args": ["/Users/tuusuario/Dev/Tools/Xcode-MPC/index.js"]
    }
  }
}
```

Con Yarn:

```json
{
  "mcpServers": {
    "xcode": {
      "command": "yarn",
      "args": ["--cwd", "/Users/tuusuario/Dev/Tools/Xcode-MPC", "start"]
    }
  }
}
```

### Local al proyecto

`./opencode.json` en la raíz de tu app iOS:

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

### Verificación

Reinicia OpenCode y pide:

```
lista las herramientas de xcode
compila el scheme MyApp en Debug
lista simuladores booted
```

Debes ver 52 herramientas registradas (`xcode_build`, `simctl_list`, …) y el log `✅ Xcode MCP Server iniciado (stdio) — 52 herramientas registradas` en stderr.

## Ejemplos de prompts

### Compilación

```
Compila el scheme MyApp con xcode_build usando destination "platform=iOS Simulator,name=iPhone 15"
```

→ OpenCode llama `xcode_build {scheme:"MyApp", destination:"platform=iOS Simulator,name=iPhone 15"}`

### Tests

```
Ejecuta los tests de MyAppTests con xcode_run_tests y luego muestra la cobertura con xcode_test_coverage
```

### Simulador

```
Lista los simuladores booted, instala build/Debug-iphonesimulator/MyApp.app y haz screenshot en /tmp/a.png
```

Secuencia: `simctl_list {booted:true}` → `simctl_install_launch {appPath, launch:true}` → `simctl_media_capture {type:"screenshot"}`

### Localización

```
Revisa Localizable.xcstrings con xcode_sync_strings y dime qué claves faltan en español
```

### Editor

```
Abre Sources/ContentView.swift en la línea 42 con xcode_open_at_line
```

## Troubleshooting

| Síntoma | Solución |
|---|---|
| `xcode_build` falla con `No such file` | Verifica `workspace`/`project` ruta absoluta; usa `xcode_list_schemes` para listar schemes |
| `simctl` dice `No devices are booted` | `simctl_lifecycle {action:"boot", udid:"<UDID>"}` o `open -a Simulator` |
| `swift_format_lint` dice `no encontrado` | `brew install swift-format swiftlint` |
| OpenCode no ve herramientas | `make lint && make test` local; verifica `opencode.json` path absoluto y permisos `chmod +x index.js` |
| Logs vacíos | Activa verbose en OpenCode; revisa stderr `✅ Xcode MCP Server iniciado` |

## Variables de entorno

El servidor no requiere `env` especial, pero puedes pasar:

```json
{
  "mcpServers": {
    "xcode": {
      "command": "node",
      "args": ["/.../index.js"],
      "env": {
        "DEVELOPER_DIR": "/Applications/Xcode.app/Contents/Developer"
      }
    }
  }
}
```

## Inspector

Para probar sin OpenCode:

```bash
yarn inspect
# o
make inspect
```

Abre `http://localhost:6274` y haz `tools/list` / `tools/call`.