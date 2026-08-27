# Xcode MCP Server

> Servidor **Model Context Protocol (MCP)** completo, robusto y modular en un solo archivo `index.js` que conecta **OpenCode** con **Xcode y el entorno Apple** (xcodebuild, simctl, devicectl, xctrace, agvtool, swift-format).

[![CI](https://github.com/YanxReal/Xcode-MPC/actions/workflows/ci.yml/badge.svg)](https://github.com/YanxReal/Xcode-MPC/actions)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js)](https://nodejs.org)
[![Yarn 4](https://img.shields.io/badge/yarn-4.18-2C8EBB?logo=yarn)](https://yarnpkg.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-Stdio-7B68EE)](https://modelcontextprotocol.io)

**Autor:** [@YanxReal](https://github.com/YanxReal) · **Stack:** ES Modules · `@modelcontextprotocol/sdk` · `StdioServerTransport` · `promisify(exec)`

---

## ✨ Características

- **25 herramientas MCP** con JSON Schema y `try/catch` estructurado
- **Single-file** `index.js` con shebang, listo para `node` / `yarn` / `npx`
- **Yarn 4 + Makefile** para instalación y DX impecable
- **Cobertura total Apple**: compilación, tests, simuladores, dispositivos físicos, perfilado, firma y editor GUI
- **Docs modulares** en `docs/` + GitHub Actions CI en macOS

---

## 📦 Requisitos

| Dependencia | Versión | Instalación |
|---|---|---|
| Node.js | ≥ 18 | `brew install node` |
| Yarn | 4.x (Berry) | `corepack enable && corepack prepare yarn@stable --activate` |
| Xcode | 15+ | App Store + `xcode-select --install` |
| make | cualquier | `xcode-select --install` (incluye make) |
| swift-format / swiftlint | opcional | `brew install swift-format swiftlint` |

> **macOS obligatorio** para `xcodebuild`, `simctl`, `devicectl`. En Linux solo corre `make lint`.

---

## 🚀 Instalación rápida

### Opción A — Make (recomendada)

```bash
git clone https://github.com/YanxReal/Xcode-MPC.git
cd Xcode-MPC

# 1. Instalar dependencias (Yarn)
make install
# o
yarn install

# 2. Verificar entorno
make doctor

# 3. Smoke test MCP
make test
```

### Opción B — Yarn directo

```bash
yarn install
yarn start        # inicia el servidor stdio
yarn inspect      # abre @modelcontextprotocol/inspector
```

### Opción C — Un solo comando

```bash
make reinstall && make lint && make test
```

---

## 🔧 Uso con OpenCode

Añade el servidor a tu `opencode.json` (global `~/.config/opencode/opencode.json` o local `./opencode.json`):

```json
{
  "mcpServers": {
    "xcode": {
      "command": "node",
      "args": ["/ruta/absoluta/a/Xcode-MPC/index.js"],
      "env": {}
    }
  }
}
```

Alternativa con Yarn:

```json
{
  "mcpServers": {
    "xcode": {
      "command": "yarn",
      "args": ["--cwd", "/ruta/a/Xcode-MPC", "start"]
    }
  }
}
```

Reinicia OpenCode y verifica que aparecen las 25 herramientas (`xcode_build`, `simctl_list`, …).

> Ver guía completa en [`docs/opencode.md`](docs/opencode.md).

---

## 🛠️ Herramientas (25)

### 1. Compilación, Diagnóstico y Limpieza

| Herramienta | Descripción | Args clave |
|---|---|---|
| `xcode_build` | `xcodebuild build` | `scheme*`, `workspace`, `project`, `destination`, `configuration` |
| `xcode_clean` | `xcodebuild clean` + `rm -rf DerivedData` | `purgeDerivedData:boolean` |
| `xcode_list_schemes` | `xcodebuild -list -json` | `workspace`, `project`, `directory` |
| `xcode_analyze` | `xcodebuild analyze` | `scheme`, `workspace`, `project` |
| `xcode_archive_export` | `archive` + `-exportArchive` `.ipa` | `scheme*`, `exportOptionsPlist*`, `archivePath`, `exportPath` |
| `swift_format_lint` | `swift-format` / `swiftlint` | `path`, `mode: lint|format`, `tool: auto|swift-format|swiftlint` |

### 2. Tests y Cobertura

| Herramienta | Descripción | Args clave |
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

`xcode_get_active_file` (AppleScript `osascript`), `xcode_open_at_line` (`filePath*`, `line*`, `column`, vía `xed` → fallback `xcode://`)

### 8. Localización (1)

`xcode_sync_strings` (`.xcstrings` → `missing` / `pendingTranslation` / `emptyValues`)

Documentación detallada de cada tool con ejemplos JSON en [`docs/tools.md`](docs/tools.md).

---

## 📖 Comandos Make

```
make help          # ayuda
make install       # yarn install + chmod +x
make reinstall     # clean + install
make lint          # node --check index.js
make doctor        # verifica Xcode / simctl / swiftlint / node / yarn
make test          # smoke test MCP (python + fallback node)
make start         # yarn start (stdio)
make dev           # yarn dev (--watch)
make inspect       # inspector MCP
make clean         # borra node_modules / caches
make fmt           # prettier si disponible
make release VERSION=1.0.1  # bump + tag + push
```

Ver [`docs/development.md`](docs/development.md).

---

## 📚 Documentación

| Doc | Descripción |
|---|---|
| [`docs/installation.md`](docs/installation.md) | Instalación paso a paso, Yarn Berry, Corepack |
| [`docs/tools.md`](docs/tools.md) | Referencia completa de las 25 herramientas + JSON Schema |
| [`docs/opencode.md`](docs/opencode.md) | Integración con OpenCode, ejemplos de prompts |
| [`docs/development.md`](docs/development.md) | Flujo de desarrollo, Make, CI, release |
| [`docs/architecture.md`](docs/architecture.md) | Arquitectura single-file, helpers, manejo de errores |

---

## 🧪 Smoke test manual

```bash
# Sin Make, directo:
python3 scripts/smoke_test.py
# o
node scripts/smoke_test.mjs

# Con Make:
make test
```

Salida esperada: `✓ tools/list: 25 herramientas` + `✓ xcode_sync_strings OK`.

---

## 🤝 Contribuir

1. Fork → branch `feat/nueva-herramienta`
2. `make install && make lint && make test`
3. PR con descripción + logs — ver `.github/pull_request_template.md`

Issues: [`bug_report`](.github/ISSUE_TEMPLATE/bug_report.md) · [`feature_request`](.github/ISSUE_TEMPLATE/feature_request.md)

---

## 📄 Licencia

MIT © [YanxReal](https://github.com/YanxReal) — ver [LICENSE](LICENSE).

---

## 🔗 Enlaces

- Repo: `https://github.com/YanxReal/Xcode-MPC`
- MCP Spec: `https://modelcontextprotocol.io`
- SDK: `https://github.com/modelcontextprotocol/typescript-sdk`
