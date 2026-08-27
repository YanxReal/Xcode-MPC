# Codex Integration (OpenAI)

> 🌐 **Language:** **English** | [Español](es/codex.md)

> **Codex CLI** (`codex` — OpenAI's coding agent) supports MCP servers via `config.toml`. This guide integrates **Xcode MCP Server** with Codex using `StdioServerTransport`.

## 1. Requirements

- Codex CLI installed: `npm i -g @openai/codex` or `brew install codex`
- Verify: `codex --version`
- This repo with `yarn install` and `make test` OK

## 2. Configuration

Codex reads MCP servers from `~/.codex/config.toml` (global) or `.codex/config.toml` (per-project).

### Option A — Global (`~/.codex/config.toml`)

```toml
# ~/.codex/config.toml

[mcp_servers.xcode]
command = "node"
args = ["/Users/YanxReal/Dev/Tools/Xcode-MPC/index.js"]
# optional cwd if you use relative paths
# cwd = "/Users/YanxReal/Dev/Tools/Xcode-MPC"

# With Yarn (if you use PnP / Berry, prefer direct node)
# [mcp_servers.xcode]
# command = "yarn"
# args = ["--cwd", "/Users/YanxReal/Dev/Tools/Xcode-MPC", "start"]

# Optional environment variables
# [mcp_servers.xcode.env]
# DEVELOPER_DIR = "/Applications/Xcode.app/Contents/Developer"
```

### Option B — Per-project (`./.codex/config.toml`)

At the root of your iOS app:

```toml
[mcp_servers.xcode]
command = "node"
args = ["../Xcode-MPC/index.js"]
```

### Option C — JSON Config (Codex >=0.4, alternative)

Some versions expose `~/.codex/config.json`:

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

> If Codex doesn't detect `config.toml`, try both paths and restart `codex`.

## 3. Verification

```bash
# Validate server syntax
make lint

# Restart Codex
codex --help
codex mcp list
# should list: xcode (25 tools)

# Inside codex, try:
# "list the xcode tools"
# "build MyApp with xcode_build scheme MyApp"
```

Server logs go to stderr:
```
✅ Xcode MCP Server started (stdio) — 25 tools registered
```

If it doesn't appear, run manually:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node index.js
```

## 4. Prompt Examples in Codex

### Build & Diagnostics

```
Build scheme MyApp in Debug for iPhone 15 using xcode_build
```

→ `xcode_build {scheme:"MyApp", configuration:"Debug", destination:"platform=iOS Simulator,name=iPhone 15"}`

```
Clean the project and purge DerivedData with xcode_clean
```

### Tests & Coverage

```
Run xcode_run_tests for MyApp on iPhone 15 and then xcode_test_coverage
```

### Simulators

```
List booted simulators with simctl_list, then boot iPhone 15 with simctl_lifecycle and take a screenshot with simctl_media_capture
```

```
Install build/Debug-iphonesimulator/MyApp.app with simctl_install_launch and open myapp://detail/42 with simctl_open_url
```

### Physical Device

```
List physical devices with devicectl_list and capture 10s logs with devicectl_logs
```

### Profiling

```
Record a 5s Time Profiler trace with xctrace_profile at /tmp/trace.trace
```

### Signing & Versions

```
Check certificates with xcode_certificates_check and do bump_build with agvtool_version_bump
```

### Localization & Editor

```
Check Localizable.xcstrings with xcode_sync_strings
Open Sources/App.swift line 42 with xcode_open_at_line
Get the active Xcode file with xcode_get_active_file
```

## 5. Troubleshooting Codex

| Symptom | Solution |
|---|---|
| `codex mcp list` empty | Check `~/.codex/config.toml` TOML syntax, absolute path to `index.js`, `chmod +x index.js`, `make test` |
| `spawn node ENOENT` | Use absolute `node` path: `which node` → `/opt/homebrew/bin/node` |
| `Cannot find package '@modelcontextprotocol/sdk'` | `yarn install` (nodeLinker: node-modules in `.yarnrc.yml`), don't use pure PnP |
| `xcodebuild: command not found` | `sudo xcode-select -s /Applications/Xcode.app` |
| Codex doesn't call tools | Add explicit instruction: "use the MCP tool xcode_build" |

## 6. Differences with OpenCode

| Aspect | OpenCode | Codex |
|---|---|---|
| Config | `opencode.json` JSON | `~/.codex/config.toml` TOML |
| Key | `mcpServers` | `mcp_servers` |
| Command | `node /.../index.js` | identical |
| Inspector | `yarn inspect` | `codex mcp list` + stderr logs |

See also: [`opencode.md`](opencode.md) · [`claude-code.md`](claude-code.md) · [`tools.md`](tools.md)
