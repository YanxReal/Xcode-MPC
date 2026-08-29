<div align="center">

# Xcode MCP Server

**Model Context Protocol Server for the Apple Ecosystem**

*Connect OpenCode, Codex and Claude Code to Xcode — 52 professional tools in a single `index.js`*

[![CI](https://github.com/YanxReal/Xcode-MPC/actions/workflows/ci.yml/badge.svg)](https://github.com/YanxReal/Xcode-MPC/actions)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Yarn 4](https://img.shields.io/badge/yarn-4.18-2C8EBB?logo=yarn&logoColor=white)](https://yarnpkg.com)
[![MCP](https://img.shields.io/badge/MCP-Stdio_Transport-7B68EE)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.4.0-blue.svg)](package.json)

> 🌐 **Language:** **English** | [Español](README.es.md)

[Installation](#-step-by-step-installation) • [Tools](#-tools-52) • [OpenCode](docs/opencode.md) • [Codex](docs/codex.md) • [Claude Code](docs/claude-code.md) • [Docs](docs/architecture.md)

</div>

---

## What is this?

**Xcode MCP Server** is a **serious, production-ready** bridge between your **AI IDE** (OpenCode / Codex / Claude Code) and **Xcode + Apple Dev Tools**.

> An LLM no longer just writes Swift: it **builds, tests, profiles, manages simulators, physical devices, signing and even opens Xcode on the exact line** — all via MCP `stdio` with no HTTP server.

**Stack:** `ES Modules` · `@modelcontextprotocol/sdk@1.30` · `StdioServerTransport` · `promisify(exec)` · `Yarn 4 Berry` · `Make`

<details>
<summary><strong>Why this server and not another?</strong></summary>

- ✅ **Single-file `index.js` (2250 lines)** — no build step, no compile, auditable in one file. Shebang `#!/usr/bin/env node`, ready for `node`, `yarn start` or `npx`.
- ✅ **52 tools with strict JSON Schema** (`additionalProperties:false`) + global `try/catch`. Each tool returns `content: [{type:"text"}]` and `isError:true` on failure — no `// TODO`.
- ✅ **Full Apple coverage:** `xcodebuild`, `simctl` (9), `devicectl` (2), `xctrace` (5 templates), `agvtool`, `security`, `osascript/xed`.
- ✅ **Modern DX:** Vendored Yarn 4 (`.yarn/releases`), self-documenting `Makefile` with `help`, modular `docs/`, macOS CI + `make test` smoke.
- ✅ **Multi-client:** same `index.js` works with **OpenCode**, **Codex** and **Claude Code** without changes.

</details>

---

## ✨ Features

| Category | Tools | Description |
|---|---|---|
| **Build** | 6 | `xcode_build`, `xcode_clean` (+ purge DerivedData), `xcode_list_schemes`, `xcode_analyze`, `xcode_archive_export` (`.ipa`), `swift_format_lint` |
| **Tests** | 2 | `xcode_run_tests` (`onlyTesting` filter), `xcode_test_coverage` (`xccov --json`) |
| **Simulators** | 9 | `simctl_list`, `lifecycle` (boot/shutdown/erase), `install_launch`, `media_capture`, `push_notification`, `location_mock`, `privacy_control`, `ui_appearance`, `open_url` |
| **Devices** | 2 | `devicectl_list`, `devicectl_logs` (N-second streaming) |
| **Profiling** | 1 | `xctrace_profile` (Time Profiler, Allocations, Leaks, System Trace…) |
| **Versions** | 2 | `agvtool_version_bump`, `xcode_certificates_check` |
| **Editor** | 2 | `xcode_get_active_file` (AppleScript), `xcode_open_at_line` (`xed` → `xcode://`) |
| **Localization** | 1 | `xcode_sync_strings` (`.xcstrings` → missing/pending/empty) |
| **Assets** | 6 | `asset_list_contents`, `asset_manage_color` (Light/Dark), `asset_manage_image` (1x/2x/3x/vector), `asset_read_info`, `asset_delete`, `asset_validate_actool` (`actool`) |
| **AppIcon** | 1 | `asset_generate_appicon` (ALL Apple OS: iOS, macOS, watchOS, tvOS, visionOS + `sips` resize) |
| **Package / SPM** | 11 | `package_resolve`, `package_update`, `package_list_dependencies`, `package_read_resolved`, `package_reset_cache`, `package_compute_checksum`, `spm_add_dependency`, `spm_remove_dependency`, `cocoapods_manage`, `carthage_manage`, `cocoapods_to_spm_migrate` |
| **Vision/UI** | 4 | `simctl_get_screen_analysis` (sips + `imagePath`), `simctl_inspect_ui_tree` (accessibility tree), `simctl_tap_by_text` (smart tap), `simctl_fill_field` (smart type) |
| **Simctl Extra** | 5 | `simctl_set_appearance` (light/dark), `simctl_set_dynamic_type` (Dynamic Type), `simctl_manage_storekit` (load/clear/buy/refund), `simctl_simulate_event` (call/network), `simctl_send_push` (APNs object) |

---

## 📋 Table of Contents

1. [Requirements](#-requirements)
2. [Step-by-step Installation](#-step-by-step-installation)
3. [Verification](#-verification)
4. [Usage with OpenCode / Codex / Claude Code](#-usage-with-opencode--codex--claude-code)
5. [Tools (52)](#-tools-52)
6. [Make Commands](#-make-commands)
7. [Documentation](#-documentation)
8. [Architecture](#-architecture)
9. [Contributing](#-contributing)

---

## 📦 Requirements

| Dependency | Version | Install | Required |
|---|---|---|---|
| **macOS** | 13+ (14+ recommended) | — | ✅ for `xcodebuild`/`simctl` |
| **Xcode** | 15+ | App Store → `xcode-select --install` | ✅ |
| **Node.js** | ≥ 18 | `brew install node` → `node --version` | ✅ |
| **Yarn** | 4.x Berry | `corepack enable && corepack prepare yarn@stable --activate` | ✅ |
| **make** | 3.81+ | `xcode-select --install` (includes make) | ✅ |
| **swift-format** | latest | `brew install swift-format` | ◻️ optional |
| **swiftlint** | latest | `brew install swiftlint` | ◻️ optional |

> **Linux/Windows:** only `make lint` works (no Xcode). CI runs a `syntax-linux` job for that.

---

## 🚀 Step-by-step Installation

Follow **exactly** in this order. Copy and paste block by block.

### Step 0 — Verify Xcode and Node

```bash
xcodebuild -version
# Xcode 15.4  Build version 15F31d

node --version
# v20.11.0 (or newer)

yarn --version
# 4.18.0 — if "command not found", run:
corepack enable
corepack prepare yarn@stable --activate
yarn --version
```

### Step 1 — Clone the repository

```bash
git clone https://github.com/YanxReal/Xcode-MPC.git
cd Xcode-MPC
```

### Step 2 — Install dependencies

**Option A — with Make (recommended, modern):**

```bash
make install
```

What `make install` does:
1. Detects `yarn`, installs via `corepack` if missing
2. Runs `yarn install` (reads `yarn.lock`, installs `@modelcontextprotocol/sdk`)
3. Runs `chmod +x index.js`

Expected output:
```
➤ YN0000: · Yarn 4.18.0
➤ YN0000: ┌ Resolution step
➤ YN0000: └ Completed
➤ YN0000: · Done with warnings in 3s
✓ dependencies installed
```

**Option B — with Yarn directly:**

```bash
yarn install
chmod +x index.js
```

**If you come from npm:**

```bash
rm -f package-lock.json
yarn install
```

### Step 3 — Verify the environment

```bash
make doctor
```

Should show:
```
Node: v20.x
Yarn: 4.18.0
Xcode: Xcode 15.x
xcrun: xcrun version 70
...
✓ doctor complete
```

If you see `xcodebuild: command not found`:
```bash
sudo xcode-select -s /Applications/Xcode.app
```

### Step 4 — Validate the MCP server

```bash
make lint
# ➜ node --check index.js
# ✓ lint ok

make test
# ➜ smoke test MCP...
# ✓ tools/list: 52 tools
# ✓ xcode_sync_strings OK
# ✓ xcode_certificates_check OK
# ✓ smoke test PASSED
```

Or manually:
```bash
python3 scripts/smoke_test.py
# or
node scripts/smoke_test.mjs
```

### Step 5 — Configure your AI client

Pick **one** (or all three — same `index.js` works everywhere):

| Client | Config file | Command |
|---|---|---|
| **OpenCode** | `~/.config/opencode/opencode.json` | `node /.../Xcode-MPC/index.js` |
| **Codex** | `~/.codex/config.toml` | `[mcp_servers.xcode] command="node"` |
| **Claude Code** | `claude mcp add xcode -- node ...` | CLI or `.mcp.json` |

Full step-by-step with copy-paste JSON/TOML:

- 📘 **[OpenCode → docs/opencode.md](docs/opencode.md)**
- 📗 **[Codex → docs/codex.md](docs/codex.md)**
- 📙 **[Claude Code → docs/claude-code.md](docs/claude-code.md)**

### Step 6 — Restart and test

Restart OpenCode / Codex / Claude Code and type:

```
list the xcode tools
```

You should see **52 tools** and in the log:

```
✅ Xcode MCP Server started (stdio) — 52 tools registered
```

Done! Now you can say:

```
Build MyApp with xcode_build scheme MyApp destination "platform=iOS Simulator,name=iPhone 15"
```

---

## ✅ Verification

```bash
# 1. Syntax
make lint

# 2. Smoke MCP (no Xcode needed, just Node)
make test

# 3. Apple environment
make doctor
# Checks: node, yarn, xcodebuild, xcrun, simctl, swiftlint, security, osascript

# 4. Visual inspector (optional)
make inspect
# or
yarn inspect
# Open http://localhost:6274 → tools/list → tools/call
```

---

## 🔧 Usage with OpenCode / Codex / Claude Code

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
# verify
claude mcp list
# xcode: connected — 52 tools
```

Or per-project with `.mcp.json`:

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

> Prompt examples for each client → [`docs/opencode.md`](docs/opencode.md) · [`docs/codex.md`](docs/codex.md) · [`docs/claude-code.md`](docs/claude-code.md) · Templates: [`.mcp.json.example`](.mcp.json.example) · [`.codex-config.toml.example`](.codex-config.toml.example)

---

## 🛠️ Tools (52)

### 1. Build, Diagnostics & Clean

| Tool | `xcrun` / `xcodebuild` | Key args |
|---|---|---|
| `xcode_build` | `xcodebuild build` | `scheme*`, `workspace`, `project`, `destination`, `configuration` |
| `xcode_clean` | `xcodebuild clean` + `rm -rf DerivedData` | `purgeDerivedData:boolean` |
| `xcode_list_schemes` | `xcodebuild -list -json` | `workspace`, `project`, `directory` |
| `xcode_analyze` | `xcodebuild analyze` | `scheme`, `workspace`, `project` |
| `xcode_archive_export` | `archive` + `-exportArchive` | `scheme*`, `exportOptionsPlist*`, `archivePath`, `exportPath` |
| `swift_format_lint` | `swift-format` → `swiftlint` | `path`, `mode: lint|format`, `tool: auto` |

### 2. Tests & Coverage

| Tool | `xcodebuild` | Key args |
|---|---|---|
| `xcode_run_tests` | `xcodebuild test` | `scheme*`, `destination*`, `onlyTesting`, `enableCodeCoverage` |
| `xcode_test_coverage` | `xcrun xccov view --report --json` | `xcresultPath` (auto-finds in DerivedData) |

### 3. Simulators `xcrun simctl` (9)

`simctl_list` (filter `booted`), `simctl_lifecycle` (`boot|shutdown|erase`), `simctl_install_launch`, `simctl_media_capture` (`screenshot|record`), `simctl_push_notification`, `simctl_location_mock`, `simctl_privacy_control`, `simctl_ui_appearance` (`light|dark`), `simctl_open_url`

### 4. Physical Devices `xcrun devicectl` (2)

`devicectl_list` (`--json`), `devicectl_logs` (`deviceUdid*`, `durationSeconds`)

### 5. Profiling `xcrun xctrace` (1)

`xctrace_profile` (`template: Time Profiler|Allocations|Leaks|System Trace`, `timeLimitSeconds`, `outputFilePath*`)

### 6. Versions & Security (2)

`agvtool_version_bump` (`bump_build|set_version|set_build`), `xcode_certificates_check` (`security find-identity`)

### 7. Xcode GUI Editor (2)

`xcode_get_active_file` (AppleScript `osascript`), `xcode_open_at_line` (`filePath*`, `line*`, `column` — `xed` → `xcode://`)

### 8. Localization (1)

`xcode_sync_strings` (`.xcstrings` → `missing` / `pendingTranslation` / `emptyValues`)

### 9. Assets `Assets.xcassets` + `actool` (6)

`asset_list_contents` (list `*.colorset/*.imageset`), `asset_manage_color` (`#RRGGBB` Light + Dark), `asset_manage_image` (scales/vector + `preserves-vector-representation`), `asset_read_info` (`Contents.json`), `asset_delete` (safe), `asset_validate_actool` (`xcrun actool --compile`)

### 10. AppIcon ALL Apple OS (1)

`asset_generate_appicon` (iOS, macOS, watchOS, tvOS, visionOS — 42 slots, `sips -z` if `baseImagePath`)

### 11. Package SPM / CocoaPods / Carthage (11)

`package_resolve`/`update`/`list`/`read_resolved`/`reset_cache`/`compute_checksum`, `spm_add/remove_dependency`, `cocoapods_manage`, `carthage_manage`, `cocoapods_to_spm_migrate` (Podfile→Package.swift)

### 12. Vision / Smart UI (4)

`simctl_get_screen_analysis` (sips → `imagePath` + `resolution` for Vision LLM), `simctl_inspect_ui_tree` (accessibility tree with `center`), `simctl_tap_by_text` (`exact`/`partial` + center click), `simctl_fill_field` (`clearFirst` + `keystroke`)

### 13. Simctl Extra (5)

`simctl_set_appearance` (light/dark — `xcrun simctl ui appearance`), `simctl_set_dynamic_type` (Dynamic Type 12 categories), `simctl_manage_storekit` (`load`/`clear`/`buy`/`refund`), `simctl_simulate_event` (`incoming_call`/`network_offline`/`online`), `simctl_send_push` (APNs object → `simctl push`)

> Full reference with JSON Schema + copy-paste examples → [`docs/tools.md`](docs/tools.md)

---

## 📖 Make Commands

```bash
make help          # Show this pretty help (colors)
make install       # yarn install + chmod +x
make reinstall     # clean + install (from scratch)
make lint          # node --check index.js
make doctor        # Check Node/Yarn/Xcode/simctl/swiftlint/osascript
make test          # Smoke test MCP (52 tools + 2 calls)
make start         # yarn start (stdio)
make dev           # yarn dev (--watch)
make inspect       # MCP Inspector at http://localhost:6274
make clean         # Remove node_modules/.yarn/cache/build
make fmt           # prettier if available
make release VERSION=1.0.1  # bump + tag + push
```

Details → [`docs/development.md`](docs/development.md)

---

## 📚 Documentation

| Doc | Audience | Covers |
|---|---|---|
| [`installation.md`](docs/installation.md) | Everyone | Yarn Berry, Corepack, `yarnPath` vendored, troubleshooting |
| [`tools.md`](docs/tools.md) | LLM / Dev | All 52 tools, JSON Schema, copy-paste JSON examples |
| [`opencode.md`](docs/opencode.md) | OpenCode | `opencode.json` global/local, prompts, `DEVELOPER_DIR` env |
| [`codex.md`](docs/codex.md) | Codex | `config.toml` (`mcp_servers.xcode`), `codex mcp list` |
| [`claude-code.md`](docs/claude-code.md) | Claude Code | `claude mcp add` / `.mcp.json`, permissions, trust |
| [`development.md`](docs/development.md) | Contributors | Structure, adding a tool, CI, release |
| [`architecture.md`](docs/architecture.md) | Curious | Why single-file, helpers, dispatcher, stdio flow |

---

## 🧪 Manual Smoke Test

```bash
# Without Make:
python3 scripts/smoke_test.py
# STDERR: ✅ Xcode MCP Server started — 52 tools
# ✓ tools/list: 52 tools
# ✓ xcode_sync_strings OK
# ✓ smoke test PASSED

# With Make:
make test
```

---

## 🏗️ Architecture

```
index.js (2250 lines, 1 file)
├── Shebang + Imports (MCP SDK, promisify(exec), fs, path, os)
├── Helpers: shellEscape, expandTilde, runCommand (try/catch + 10MB buffer), formatResult
├── TOOLS[52]: Strict JSON Schema (additionalProperties:false)
├── Handlers[52]: async handle_* with validation + fallbacks (xed→xcode://, swift-format→swiftlint)
├── Dispatcher: HANDLERS map + ListTools/CallTool (try/catch → isError:true)
└── Server: StdioServerTransport (stdin JSON-RPC, stdout JSON-RPC, stderr logs)
```

See [`docs/architecture.md`](docs/architecture.md) for single-file decision, `OpenCode → stdin → handler → xcrun → stdout` flow.

---

## 🤝 Contributing

```bash
# 1. Fork and branch
git checkout -b feat/my-tool

# 2. Develop: add to TOOLS + Handler + HANDLERS in index.js
make install && make lint && make test

# 3. Document in docs/tools.md + README.md

# 4. PR
```

Issues: [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) · [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) · [PR Template](.github/pull_request_template.md)

CI runs on `macos-14` and `ubuntu-latest` — your PR is tested automatically.

---

## 📄 License

MIT © [YanxReal](https://github.com/YanxReal) — see [LICENSE](LICENSE).

---

## 🔗 Links

- **Repo:** https://github.com/YanxReal/Xcode-MPC
- **MCP Spec:** https://modelcontextprotocol.io
- **SDK:** https://github.com/modelcontextprotocol/typescript-sdk
- **Yarn Berry:** https://yarnpkg.com/getting-started
- **Xcode:** https://developer.apple.com/xcode/

<div align="center">

**Made with ❤️ for the Apple ecosystem · Yarn 4 + Make + CI + Docs**

*If it helps you, leave a ⭐ on GitHub*

</div>
