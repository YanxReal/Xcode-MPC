# OpenCode Integration

> 🌐 **Language:** **English** | [Español](es/opencode.md)

## Configuration

OpenCode reads MCP servers from `opencode.json` (global or local).

### Global (recommended)

`~/.config/opencode/opencode.json`:

```json
{
  "mcpServers": {
    "xcode": {
      "command": "node",
      "args": ["/Users/youruser/Dev/Tools/Xcode-MPC/index.js"]
    }
  }
}
```

With Yarn:

```json
{
  "mcpServers": {
    "xcode": {
      "command": "yarn",
      "args": ["--cwd", "/Users/youruser/Dev/Tools/Xcode-MPC", "start"]
    }
  }
}
```

### Local to project

`./opencode.json` at the root of your iOS app:

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

### Verification

Restart OpenCode and ask:

```
list the xcode tools
build the MyApp scheme in Debug
list booted simulators
```

You should see 25 registered tools (`xcode_build`, `simctl_list`, …) and the log `✅ Xcode MCP Server started (stdio) — 25 tools registered` on stderr.

## Prompt Examples

### Build

```
Build scheme MyApp with xcode_build using destination "platform=iOS Simulator,name=iPhone 15"
```

→ OpenCode calls `xcode_build {scheme:"MyApp", destination:"platform=iOS Simulator,name=iPhone 15"}`

### Tests

```
Run MyAppTests with xcode_run_tests and then show coverage with xcode_test_coverage
```

### Simulator

```
List booted simulators, install build/Debug-iphonesimulator/MyApp.app and take a screenshot at /tmp/a.png
```

Sequence: `simctl_list {booted:true}` → `simctl_install_launch {appPath, launch:true}` → `simctl_media_capture {type:"screenshot"}`

### Localization

```
Check Localizable.xcstrings with xcode_sync_strings and tell me which keys are missing in Spanish
```

### Editor

```
Open Sources/ContentView.swift at line 42 with xcode_open_at_line
```

## Troubleshooting

| Symptom | Solution |
|---|---|
| `xcode_build` fails with `No such file` | Check `workspace`/`project` absolute path; use `xcode_list_schemes` to list schemes |
| `simctl` says `No devices are booted` | `simctl_lifecycle {action:"boot", udid:"<UDID>"}` or `open -a Simulator` |
| `swift_format_lint` says `not found` | `brew install swift-format swiftlint` |
| OpenCode shows no tools | `make lint && make test` locally; check `opencode.json` absolute path and `chmod +x index.js` |
| Empty logs | Enable verbose in OpenCode; check stderr `✅ Xcode MCP Server started` |

## Environment Variables

The server needs no special `env`, but you can pass:

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

To test without OpenCode:

```bash
yarn inspect
# or
make inspect
```

Open `http://localhost:6274` and run `tools/list` / `tools/call`.
