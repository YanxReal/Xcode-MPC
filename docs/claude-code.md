# Claude Code Integration (Anthropic)

> 🌐 **Language:** **English** | [Español](es/claude-code.md)

> **Claude Code** (`claude` — Anthropic's official CLI) supports MCP via `claude mcp` and `.mcp.json`. This guide integrates **Xcode MCP Server** with Claude Code.

## 1. Requirements

- Claude Code installed: `npm i -g @anthropic-ai/claude-code` or `brew install claude-code`
- Verify: `claude --version` / `claude mcp --help`
- This repo with `yarn install` and `make test` OK

## 2. Configuration

Claude Code offers 3 ways (pick one):

### Option A — CLI `claude mcp add` (recommended, global)

```bash
# Add xcode server (stdio) — persists in ~/.claude.json
claude mcp add xcode -- node /Users/YanxReal/Dev/Tools/Xcode-MPC/index.js

# With Yarn
# claude mcp add xcode -- yarn --cwd /Users/YanxReal/Dev/Tools/Xcode-MPC start

# With env (e.g. Xcode beta)
# claude mcp add xcode --env DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer -- node /Users/YanxReal/Dev/Tools/Xcode-MPC/index.js

# Verify
claude mcp list
# xcode: node /Users/YanxReal/Dev/Tools/Xcode-MPC/index.js (connected) — 43 tools

# If you need project scope (only this repo)
# claude mcp add xcode --scope project -- node /Users/YanxReal/Dev/Tools/Xcode-MPC/index.js
```

### Option B — `.mcp.json` (per-project, committable)

Create `.mcp.json` at the root of your iOS app:

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

Relative path to the repo:

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

Claude Code auto-detects it when starting in that directory. For workspace trust, confirm `Allow` when prompted.

### Option C — `settings` JSON (`~/.claude/settings.json`)

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

### Option D — STDIO explicit with `claude mcp add-json`

```bash
claude mcp add-json xcode '{"command":"node","args":["/Users/YanxReal/Dev/Tools/Xcode-MPC/index.js"]}'
```

## 3. Verification

```bash
# 1. Lint and smoke
make lint && make test

# 2. List servers and tools
claude mcp list
claude mcp get xcode

# Should show: 43 tools (xcode_build, simctl_list, etc.)

# 3. Inside Claude Code, try:
# "What Xcode tools do you have?"
# "Build MyApp with xcode_build"
# "List booted simulators with simctl_list"
```

Logs go to server stderr. For debug:

```bash
claude --mcp-debug
# or
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node index.js | jq
```

## 4. Prompt Examples in Claude Code

### Build

```
Build scheme MyApp in Release for generic/platform=iOS with xcode_build
```

```
Analyze code with xcode_analyze and list schemes with xcode_list_schemes
```

### Tests

```
Run MyAppTests on iPhone 15 with xcode_run_tests and extract report with xcode_test_coverage
```

### Simulators (full flow)

```
List booted simulators with simctl_list.
Boot iPhone 15 Pro if not running with simctl_lifecycle
Install build/Debug-iphonesimulator/MyApp.app with simctl_install_launch and launch it
Take a screenshot at /tmp/01.png with simctl_media_capture
Mock location in Madrid with simctl_location_mock and open myapp://home with simctl_open_url
Switch to dark mode with simctl_ui_appearance and grant camera permission with simctl_privacy_control
Send a test push with simctl_push_notification
```

### Physical Device

```
List connected iPhones with devicectl_list
Capture 15s logs from device <UDID> with devicectl_logs
```

### Profiling & Signing

```
Record 10s Time Profiler with xctrace_profile at /tmp/profile.trace
Check certificates with xcode_certificates_check and bump build with agvtool_version_bump bump_build
Archive and export IPA with xcode_archive_export using ExportOptions.plist
```

### Editor & Localization

```
Get the active Xcode file with xcode_get_active_file
Open Sources/ContentView.swift:42 with xcode_open_at_line
Check missing translations in Localizable.xcstrings with xcode_sync_strings
Format Sources/ with swift_format_lint mode format
```

## 5. Permissions & Trust

Claude Code may ask for approval the first time it uses an MCP tool that runs shell (`xcodebuild`, `simctl`).

- Answer `Allow` or `Allow for this session`
- For CI / headless: `claude --allow-dangerously-skip-permissions` (not recommended)

If you use `.mcp.json` in a shared repo, every collaborator needs `node` and `Xcode` installed; the path to `index.js` must be absolute or correct relative.

## 6. Troubleshooting Claude Code

| Symptom | Solution |
|---|---|
| `claude mcp list` doesn't show xcode | `claude mcp add xcode -- node /abs/path/index.js` and `claude mcp list` again; check `~/.claude.json` |
| `Cannot find package '@modelcontextprotocol/sdk'` | `yarn install` with `nodeLinker: node-modules` in `.yarnrc.yml`; no pure PnP |
| `xcodebuild: error: SDK not found` | `sudo xcode-select -s /Applications/Xcode.app` and `make doctor` |
| `No devices are booted` | `simctl_lifecycle {action:"boot", udid:"..."} ` or `open -a Simulator` |
| Claude doesn't auto-invoke tools | Be explicit: "use the MCP tool xcode_build" or enable `tools` in prompt |
| `.mcp.json` ignored | Is it in `.gitignore`? It should be committed; run `claude mcp list` inside project dir |
| Empty logs | `claude --mcp-debug` and check stderr `✅ Xcode MCP Server started` |

## 7. Differences with OpenCode and Codex

| Client | Config | Command |
|---|---|---|
| **OpenCode** | `opencode.json` (`mcpServers`) | `node /.../index.js` |
| **Codex** | `~/.codex/config.toml` (`mcp_servers`) | `node /.../index.js` |
| **Claude Code** | `claude mcp add` / `.mcp.json` (`mcpServers`) | `claude mcp add xcode -- node ...` |

All use the same `index.js` stdio — same `tools/list` (43 tools). See also: [`opencode.md`](opencode.md) · [`codex.md`](codex.md) · [`tools.md`](tools.md)
