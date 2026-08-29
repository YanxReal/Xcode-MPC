<div align="center">

# Xcode MCP Server

**Servidor Model Context Protocol para el ecosistema Apple**

*Conecta OpenCode, Codex y Claude Code con Xcode — 52 herramientas profesionales en un solo `index.js`*

[![CI](https://github.com/YanxReal/Xcode-MPC/actions/workflows/ci.yml/badge.svg)](https://github.com/YanxReal/Xcode-MPC/actions)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Yarn 4](https://img.shields.io/badge/yarn-4.18-2C8EBB?logo=yarn&logoColor=white)](https://yarnpkg.com)
[![MCP](https://img.shields.io/badge/MCP-Stdio_Transport-7B68EE)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.4.0-blue.svg)](package.json)

> 🌐 **Idioma:** [English](README.md) | **Español**

[Instalación](#-instalación-paso-a-paso) • [Herramientas](#-herramientas-52) • [OpenCode](docs/es/opencode.md) • [Codex](docs/es/codex.md) • [Claude Code](docs/es/claude-code.md) • [Docs](docs/es/architecture.md)

</div>

---

## ¿Qué es esto?

**Xcode MCP Server** es un puente **serio y listo para producción** entre tu **IDE con IA** (OpenCode / Codex / Claude Code) y **Xcode + Apple Dev Tools**.

> Un LLM ya no solo escribe Swift: **compila, testea, perfila, maneja simuladores, dispositivos físicos, firma y hasta abre Xcode en la línea exacta** — todo vía MCP `stdio` sin servidores HTTP.

**Stack:** `ES Modules` · `@modelcontextprotocol/sdk@1.30` · `StdioServerTransport` · `promisify(exec)` · `Yarn 4 Berry` · `Make`

<details>
<summary><strong>¿Por qué este servidor y no otro?</strong></summary>

- ✅ **Single-file `index.js` (2250 líneas)** — sin build, sin compilar, auditable en 1 archivo. Shebang `#!/usr/bin/env node`, listo para `node`, `yarn start` o `npx`.
- ✅ **52 herramientas con JSON Schema estricto** (`additionalProperties:false`) + `try/catch` global. Cada tool retorna `content: [{type:"text"}]` y `isError:true` en fallos — nada de `// TODO`.
- ✅ **Cobertura Apple total:** `xcodebuild`, `simctl` (9), `devicectl` (2), `xctrace` (5 templates), `agvtool`, `security`, `osascript/xed`.
- ✅ **DX moderna:** Yarn 4 vendorizado (`.yarn/releases`), `Makefile` con `help` autodocumentado, `docs/` modular, CI macOS + `make test` smoke.
- ✅ **Multi-cliente:** mismo `index.js` funciona en **OpenCode**, **Codex** y **Claude Code** sin cambios.

</details>

---

## ✨ Características

| Categoría | Herramientas | Descripción |
|---|---|---|
| **Compilación** | 6 | `xcode_build`, `xcode_clean` (+ purge DerivedData), `xcode_list_schemes`, `xcode_analyze`, `xcode_archive_export` (`.ipa`), `swift_format_lint` |
| **Tests** | 2 | `xcode_run_tests` (filtro `onlyTesting`), `xcode_test_coverage` (`xccov --json`) |
| **Simuladores** | 9 | `simctl_list`, `lifecycle` (boot/shutdown/erase), `install_launch`, `media_capture`, `push_notification`, `location_mock`, `privacy_control`, `ui_appearance`, `open_url` |
| **Dispositivos** | 2 | `devicectl_list`, `devicectl_logs` (streaming N segundos) |
| **Perfilado** | 1 | `xctrace_profile` (Time Profiler, Allocations, Leaks, System Trace…) |
| **Versiones** | 2 | `agvtool_version_bump`, `xcode_certificates_check` |
| **Editor** | 2 | `xcode_get_active_file` (AppleScript), `xcode_open_at_line` (`xed` → `xcode://`) |
| **Localización** | 1 | `xcode_sync_strings` (`.xcstrings` → missing/pending/empty) |
| **Assets** | 6 | `asset_list_contents`, `asset_manage_color` (Light/Dark), `asset_manage_image` (1x/2x/3x/vector), `asset_read_info`, `asset_delete`, `asset_validate_actool` (`actool`) |
| **AppIcon** | 1 | `asset_generate_appicon` (TODOS los OS: iOS, macOS, watchOS, tvOS, visionOS + `sips`) |
| **Paquetes / SPM** | 11 | `package_resolve`, `package_update`, `package_list_dependencies`, `package_read_resolved`, `package_reset_cache`, `package_compute_checksum`, `spm_add_dependency`, `spm_remove_dependency`, `cocoapods_manage`, `carthage_manage`, `cocoapods_to_spm_migrate` |
| **Visión/UI** | 4 | `simctl_get_screen_analysis` (sips + `imagePath`), `simctl_inspect_ui_tree` (árbol accesibilidad), `simctl_tap_by_text` (tap inteligente), `simctl_fill_field` (type inteligente) |
| **Simctl Extra** | 5 | `simctl_set_appearance` (light/dark), `simctl_set_dynamic_type` (Dynamic Type), `simctl_manage_storekit` (load/clear/buy/refund), `simctl_simulate_event` (call/network), `simctl_send_push` (APNs objeto) |

---

## 📋 Tabla de Contenidos

1. [Requisitos](#-requisitos)
2. [Instalación paso a paso](#-instalación-paso-a-paso)
3. [Verificación](#-verificación)
4. [Uso con OpenCode / Codex / Claude Code](#-uso-con-opencode--codex--claude-code)
5. [Herramientas (52)](#-herramientas-52)
6. [Comandos Make](#-comandos-make)
7. [Documentación](#-documentación)
8. [Arquitectura](#-arquitectura)
9. [Contribuir](#-contribuir)

---

## 📦 Requisitos

| Dependencia | Versión | Instalación | Obligatorio |
|---|---|---|---|
| **macOS** | 13+ (14+ recomendado) | — | ✅ para `xcodebuild`/`simctl` |
| **Xcode** | 15+ | App Store → `xcode-select --install` | ✅ |
| **Node.js** | ≥ 18 | `brew install node` → `node --version` | ✅ |
| **Yarn** | 4.x Berry | `corepack enable && corepack prepare yarn@stable --activate` | ✅ |
| **make** | 3.81+ | `xcode-select --install` (incluye make) | ✅ |
| **swift-format** | latest | `brew install swift-format` | ◻️ opcional |
| **swiftlint** | latest | `brew install swiftlint` | ◻️ opcional |

> **Linux/Windows:** solo `make lint` funciona (sin Xcode). El CI corre un job `syntax-linux` para eso.

---

## 🚀 Instalación paso a paso

Sigue **exactamente** este orden. Copia y pega bloque por bloque.

### Paso 0 — Verifica que tienes Xcode y Node

```bash
xcodebuild -version
# Xcode 15.4  Build version 15F31d

node --version
# v20.11.0 (o superior)

yarn --version
# 4.18.0 — si dice "command not found", haz:
corepack enable
corepack prepare yarn@stable --activate
yarn --version
```

### Paso 1 — Clona el repositorio

```bash
git clone https://github.com/YanxReal/Xcode-MPC.git
cd Xcode-MPC
```

### Paso 2 — Instala dependencias

**Opción A — con Make (recomendada, moderna):**

```bash
make install
```

Qué hace `make install`:
1. Detecta `yarn`, si no existe lo instala vía `corepack`
2. Ejecuta `yarn install` (lee `yarn.lock`, instala `@modelcontextprotocol/sdk`)
3. Hace `chmod +x index.js`

Salida esperada:
```
➤ YN0000: · Yarn 4.18.0
➤ YN0000: ┌ Resolution step
➤ YN0000: └ Completed
➤ YN0000: · Done with warnings in 3s
✓ dependencias instaladas
```

**Opción B — con Yarn directo:**

```bash
yarn install
chmod +x index.js
```

**Si vienes de npm:**

```bash
rm -f package-lock.json
yarn install
```

### Paso 3 — Verifica el entorno

```bash
make doctor
```

Debe mostrar:
```
Node: v20.x
Yarn: 4.18.0
Xcode: Xcode 15.x
xcrun: xcrun version 70
...
✓ doctor completo
```

Si ves `xcodebuild: command not found`:
```bash
sudo xcode-select -s /Applications/Xcode.app
```

### Paso 4 — Valida el servidor MCP

```bash
make lint
# ➜ node --check index.js
# ✓ lint ok

make test
# ➜ smoke test MCP...
# ✓ tools/list: 52 herramientas
# ✓ xcode_sync_strings OK
# ✓ xcode_certificates_check OK
# ✓ smoke test PASSED
```

O manual:
```bash
python3 scripts/smoke_test.py
# o
node scripts/smoke_test.mjs
```

### Paso 5 — Configura tu cliente IA

Elige **uno** (o los tres — mismo `index.js` sirve para todos):

| Cliente | Archivo de config | Comando |
|---|---|---|
| **OpenCode** | `~/.config/opencode/opencode.json` | `node /.../Xcode-MPC/index.js` |
| **Codex** | `~/.codex/config.toml` | `[mcp_servers.xcode] command="node"` |
| **Claude Code** | `claude mcp add xcode -- node ...` | CLI o `.mcp.json` |

Detalles completos paso a paso con JSON/TOML copiable:

- 📘 **[OpenCode → docs/es/opencode.md](docs/es/opencode.md)**
- 📗 **[Codex → docs/es/codex.md](docs/es/codex.md)**
- 📙 **[Claude Code → docs/es/claude-code.md](docs/es/claude-code.md)**

### Paso 6 — Reinicia y prueba

Reinicia OpenCode / Codex / Claude Code y escribe:

```
lista las herramientas de xcode
```

Debes ver **52 herramientas** y en el log:

```
✅ Xcode MCP Server iniciado (stdio) — 52 herramientas registradas
```

¡Listo! Ya puedes decir:

```
Compila MyApp con xcode_build scheme MyApp destination "platform=iOS Simulator,name=iPhone 15"
```

---

## ✅ Verificación

```bash
# 1. Sintaxis
make lint

# 2. Smoke MCP (sin Xcode necesario, solo Node)
make test

# 3. Entorno Apple
make doctor
# Verifica: node, yarn, xcodebuild, xcrun, simctl, swiftlint, security, osascript

# 4. Inspector visual (opcional)
make inspect
# o
yarn inspect
# Abre http://localhost:6274 → tools/list → tools/call
```

---

## 🔧 Uso con OpenCode / Codex / Claude Code

### OpenCode

`~/.config/opencode/opencode.json`:

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

### Codex (OpenAI)

`~/.codex/config.toml`:

```toml
[mcp_servers.xcode]
command = "node"
args = ["/Users/YanxReal/Dev/Tools/Xcode-MPC/index.js"]
```

### Claude Code (Anthropic)

```bash
claude mcp add xcode -- node /Users/YanxReal/Dev/Tools/Xcode-MPC/index.js
# verifica
claude mcp list
# xcode: connected — 52 tools
```

O por proyecto con `.mcp.json`:

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

> Ejemplos de prompts para cada cliente → [`docs/es/opencode.md`](docs/es/opencode.md) · [`docs/es/codex.md`](docs/es/codex.md) · [`docs/es/claude-code.md`](docs/es/claude-code.md) · Plantillas: [`.mcp.json.example`](.mcp.json.example) · [`.codex-config.toml.example`](.codex-config.toml.example)

---

## 🛠️ Herramientas (52)

### 1. Compilación, Diagnóstico y Limpieza

| Herramienta | `xcrun` / `xcodebuild` | Args clave |
|---|---|---|
| `xcode_build` | `xcodebuild build` | `scheme*`, `workspace`, `project`, `destination`, `configuration` |
| `xcode_clean` | `xcodebuild clean` + `rm -rf DerivedData` | `purgeDerivedData:boolean` |
| `xcode_list_schemes` | `xcodebuild -list -json` | `workspace`, `project`, `directory` |
| `xcode_analyze` | `xcodebuild analyze` | `scheme`, `workspace`, `project` |
| `xcode_archive_export` | `archive` + `-exportArchive` | `scheme*`, `exportOptionsPlist*`, `archivePath`, `exportPath` |
| `swift_format_lint` | `swift-format` → `swiftlint` | `path`, `mode: lint|format`, `tool: auto` |

### 2. Tests y Cobertura

| Herramienta | `xcodebuild` | Args clave |
|---|---|---|
| `xcode_run_tests` | `xcodebuild test` | `scheme*`, `destination*`, `onlyTesting`, `enableCodeCoverage` |
| `xcode_test_coverage` | `xcrun xccov view --report --json` | `xcresultPath` (auto busca en DerivedData) |

### 3. Simuladores `xcrun simctl` (9)

`simctl_list` (filtro `booted`), `simctl_lifecycle` (`boot|shutdown|erase`), `simctl_install_launch`, `simctl_media_capture` (`screenshot|record`), `simctl_push_notification`, `simctl_location_mock`, `simctl_privacy_control`, `simctl_ui_appearance` (`light|dark`), `simctl_open_url`

### 4. Dispositivos físicos `xcrun devicectl` (2)

`devicectl_list` (`--json`), `devicectl_logs` (`deviceUdid*`, `durationSeconds`)

### 5. Perfilado `xcrun xctrace` (1)

`xctrace_profile` (`template: Time Profiler|Allocations|Leaks|System Trace`, `timeLimitSeconds`, `outputFilePath*`)

### 6. Versiones y Seguridad (2)

`agvtool_version_bump` (`bump_build|set_version|set_build`), `xcode_certificates_check` (`security find-identity`)

### 7. Editor GUI Xcode (2)

`xcode_get_active_file` (AppleScript `osascript`), `xcode_open_at_line` (`filePath*`, `line*`, `column` — `xed` → `xcode://`)

### 8. Localización (1)

`xcode_sync_strings` (`.xcstrings` → `missing` / `pendingTranslation` / `emptyValues`)

### 9. Assets `Assets.xcassets` + `actool` (6)

`asset_list_contents` (lista `*.colorset/*.imageset`), `asset_manage_color` (`#RRGGBB` Light + Dark), `asset_manage_image` (escalas/vector + `preserves-vector-representation`), `asset_read_info` (`Contents.json`), `asset_delete` (seguro), `asset_validate_actool` (`xcrun actool --compile`)

### 10. AppIcon TODOS los OS (1)

`asset_generate_appicon` (iOS, macOS, watchOS, tvOS, visionOS — 42 slots, `sips -z` si hay `baseImagePath`)

### 11. Paquetes SPM / CocoaPods / Carthage (11)

`package_resolve`/`update`/`list`/`read_resolved`/`reset_cache`/`compute_checksum`, `spm_add/remove_dependency`, `cocoapods_manage`, `carthage_manage`, `cocoapods_to_spm_migrate` (Podfile→Package.swift)

### 12. Visión / UI Inteligente (4)

`simctl_get_screen_analysis` (sips → `imagePath` + `resolution` para Vision LLM), `simctl_inspect_ui_tree` (árbol accesibilidad con `center`), `simctl_tap_by_text` (`Exact`+`partial` + click centro), `simctl_fill_field` (`clearFirst` + `keystroke`)

### 13. Simctl Extra (5)

`simctl_set_appearance` (light/dark — `xcrun simctl ui appearance`), `simctl_set_dynamic_type` (Dynamic Type 12 categorías), `simctl_manage_storekit` (`load`/`clear`/`buy`/`refund`), `simctl_simulate_event` (`incoming_call`/`network_offline`/`online`), `simctl_send_push` (APNs objeto → `simctl push`)

> Referencia completa con JSON Schema + ejemplos copiables → [`docs/es/tools.md`](docs/es/tools.md)

---

## 📖 Comandos Make

```bash
make help          # Muestra esta ayuda bonita (colores)
make install       # yarn install + chmod +x
make reinstall     # clean + install (desde cero)
make lint          # node --check index.js
make doctor        # Verifica Node/Yarn/Xcode/simctl/swiftlint/osascript
make test          # Smoke test MCP (52 tools + 2 calls)
make start         # yarn start (stdio)
make dev           # yarn dev (--watch)
make inspect       # Inspector MCP en http://localhost:6274
make clean         # Borra node_modules/.yarn/cache/build
make fmt           # prettier si está disponible
make release VERSION=1.0.1  # bump + tag + push
```

Detalles → [`docs/es/development.md`](docs/es/development.md)

---

## 📚 Documentación

| Doc | Para quién | Qué cubre |
|---|---|---|
| [`installation.md`](docs/es/installation.md) | Todos | Yarn Berry, Corepack, `yarnPath` vendorizado, troubleshooting |
| [`tools.md`](docs/es/tools.md) | LLM / Dev | Las 52 tools, JSON Schema, ejemplos JSON listos para copiar |
| [`opencode.md`](docs/es/opencode.md) | OpenCode | `opencode.json` global/local, prompts, env `DEVELOPER_DIR` |
| [`codex.md`](docs/es/codex.md) | Codex | `config.toml` (`mcp_servers.xcode`), `codex mcp list` |
| [`claude-code.md`](docs/es/claude-code.md) | Claude Code | `claude mcp add` / `.mcp.json`, permisos, trust |
| [`development.md`](docs/es/development.md) | Contribuidores | Estructura, cómo añadir tool, CI, release |
| [`architecture.md`](docs/es/architecture.md) | Curiosos | Por qué single-file, helpers, dispatcher, flujo stdio |

---

## 🧪 Smoke test manual

```bash
# Sin Make:
python3 scripts/smoke_test.py
# STDERR: ✅ Xcode MCP Server iniciado — 52 herramientas
# ✓ tools/list: 52 herramientas
# ✓ xcode_sync_strings OK
# ✓ smoke test PASSED

# Con Make:
make test
```

---

## 🏗️ Arquitectura

```
index.js (2250 líneas, 1 archivo)
├── Shebang + Imports (MCP SDK, promisify(exec), fs, path, os)
├── Helpers: shellEscape, expandTilde, runCommand (try/catch + 10MB buffer), formatResult
├── TOOLS[52]: JSON Schema estricto (additionalProperties:false)
├── Handlers[52]: async handle_* con validación + fallbacks (xed→xcode://, swift-format→swiftlint)
├── Dispatcher: HANDLERS map + ListTools/CallTool (try/catch → isError:true)
└── Server: StdioServerTransport (stdin JSON-RPC, stdout JSON-RPC, stderr logs)
```

Ver [`docs/es/architecture.md`](docs/es/architecture.md) para decisión single-file, flujo `OpenCode → stdin → handler → xcrun → stdout`.

---

## 🤝 Contribuir

```bash
# 1. Fork y branch
git checkout -b feat/mi-herramienta

# 2. Desarrolla: añade en TOOLS + Handler + HANDLERS en index.js
make install && make lint && make test

# 3. Documenta en docs/tools.md + README.md

# 4. PR
```

Issues: [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) · [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) · [PR Template](.github/pull_request_template.md)

CI corre en `macos-14` y `ubuntu-latest` — tu PR se testea automático.

---

## 📄 Licencia

MIT © [YanxReal](https://github.com/YanxReal) — ver [LICENSE](LICENSE).

---

## 🔗 Enlaces

- **Repo:** https://github.com/YanxReal/Xcode-MPC
- **MCP Spec:** https://modelcontextprotocol.io
- **SDK:** https://github.com/modelcontextprotocol/typescript-sdk
- **Yarn Berry:** https://yarnpkg.com/getting-started
- **Xcode:** https://developer.apple.com/xcode/

<div align="center">

**Hecho con ❤️ para el ecosistema Apple · Yarn 4 + Make + CI + Docs**

*Si te sirve, deja ⭐ en GitHub*

</div>
