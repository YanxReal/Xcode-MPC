---
name: xcode-mpc
description: Professional MCP Server for Xcode — 52 tools for iOS/macOS/watchOS/tvOS/visionOS. Use when building, testing, profiling, managing simulators, physical devices, assets, AppIcon, SPM/CocoaPods/Carthage, or Vision/UI. Triggers: xcodebuild, simctl, devicectl, xctrace, agvtool, Assets.xcassets, actool, AppIcon, SPM, CocoaPods, vision, simctl_get_screen_analysis, tap_by_text.
user-invocable: true
allowed-tools: Bash(xcodebuild *), Bash(xcrun *), Bash(sips *), Bash(security *), Bash(osascript *)
metadata:
  author: YanxReal
  version: 1.4.0
  tools: 52
  mcp-server: xcode-mpc
---

# Xcode MCP — 52 Tools for the Apple Ecosystem

You are the **Xcode MCP expert**. The user has a single-file MCP server `index.js` (52 tools, `StdioServerTransport`, Yarn 4) that connects **OpenCode, Codex and Claude Code** to **Xcode + Apple Dev Tools**. Every action below is a real MCP tool — do not guess `xcrun` flags, use the tool.

## When to Use This Skill

Activate when the user mentions:
- **Build/Test:** `xcodebuild`, `xcode_clean`, `xcode_analyze`, `xcode_archive_export`, `swift_format_lint`, `xcode_run_tests`, `xcode_test_coverage`, DerivedData
- **Simulators:** `simctl`, `simctl_list`, `boot/shutdown/erase`, `install_launch`, `screenshot/record`, `push`, `location`, `privacy`, `appearance`, `openurl`, Dynamic Type, StoreKit
- **Devices/Profiling:** `devicectl`, `xctrace` Time Profiler/Allocations/Leaks
- **Assets:** `Assets.xcassets`, `.colorset`, `.imageset`, `actool`, `AppIcon` (ALL OS), `sips`
- **Packages:** `SPM`, `Package.swift`, `Package.resolved`, `CocoaPods`, `Podfile`, `Carthage`, `Cartfile`, `compute-checksum`
- **Vision/UI:** `simctl_get_screen_analysis`, `inspect_ui_tree`, `tap_by_text`, `fill_field`, Vision LLM, accessibility
- **Signing/Version:** `agvtool`, `security find-identity`, `xcstrings`

If the user says *“build MyApp”*, *“list simulators”*, *“take a screenshot”*, *“tap Continue”*, *“generate AppIcon”*, *“resolve SPM”* → **use this skill**.

## MCP Server — Quick Reference

**Server:** `node /path/to/Xcode-MPC/index.js` (stdio, `StdioServerTransport`)
**Install:** `make install && make test` (52 tools registered)
**Config:**
- **OpenCode:** `~/.config/opencode/opencode.jsonc` → `mcp.xcode.command: ["node", "/.../index.js"]`
- **Codex:** `~/.codex/config.toml` → `[mcp_servers.xcode] command="node"`
- **Claude Code:** `claude mcp add xcode -- node /.../index.js` or `.mcp.json`

Verify: `✅ Xcode MCP Server iniciado (stdio) — 52 herramientas registradas` on stderr.

## The 52 Tools — By Group

### 1. Build, Diagnostics & Clean (6)
- `xcode_build` — `xcodebuild build` (`scheme*`, `workspace`, `project`, `destination`, `configuration`)
- `xcode_clean` — `clean` + `rm -rf DerivedData` (`purgeDerivedData`)
- `xcode_list_schemes` — `-list -json`
- `xcode_analyze` — `analyze`
- `xcode_archive_export` — `archive` → `-exportArchive` (`.ipa`, `exportOptionsPlist*`)
- `swift_format_lint` — `swift-format` → fallback `swiftlint` (`path`, `mode: lint|format`)

### 2. Tests & Coverage (2)
- `xcode_run_tests` — `test` (`scheme*`, `destination*`, `onlyTesting`, `enableCodeCoverage`)
- `xcode_test_coverage` — `xcrun xccov view --report --json` (auto `DerivedData/*.xcresult`)

### 3. Simulators `simctl` — Core (9)
- `simctl_list` (`booted`), `simctl_lifecycle` (`boot|shutdown|erase`), `simctl_install_launch`, `simctl_media_capture` (`screenshot|record`), `simctl_push_notification`, `simctl_location_mock`, `simctl_privacy_control`, `simctl_ui_appearance`, `simctl_open_url`

### 4. Devices `devicectl` (2)
- `devicectl_list` (`--json`), `devicectl_logs` (`deviceUdid*`, `durationSeconds` 1-120)

### 5. Profiling `xctrace` (1)
- `xctrace_profile` (`Time Profiler|Allocations|Leaks|System Trace|Network|Core Data`, `timeLimitSeconds`, `outputFilePath*`)

### 6. Versions & Security (2)
- `agvtool_version_bump` (`bump_build|set_version|set_build`), `xcode_certificates_check` (`security find-identity`)

### 7. Editor GUI (2)
- `xcode_get_active_file` (`osascript`), `xcode_open_at_line` (`filePath*`, `line*`, `xed` → `xcode://`)

### 8. Localization (1)
- `xcode_sync_strings` (`.xcstrings` → `missing`/`pendingTranslation`/`emptyValues`)

### 9. Assets `Assets.xcassets` + `actool` (6)
- `asset_list_contents` (readdir recursive, `*.colorset|imageset|appiconset`), `asset_manage_color` (`#RRGGBB`→sRGB 0-1 + Dark), `asset_manage_image` (1x/2x/3x/vector `preserves-vector-representation`), `asset_read_info` (`Contents.json`), `asset_delete` (safe), `asset_validate_actool` (`xcrun actool --compile`)

### 10. AppIcon ALL Apple OS (1)
- `asset_generate_appicon` — 42 slots for **iOS (18) + macOS (10) + watchOS (7) + tvOS (4) + visionOS (3)**: `iphone/ipad/ios-marketing`, `mac 16-512`, `watch 38/42/45mm`, `tv 400x240/1280x768`, `vision 32/1024`. If `baseImagePath` (1024x1024) → `sips -z {pixels}` per slot.

### 11. Packages SPM/CocoaPods/Carthage (11)
- `package_resolve`/`package_update` (auto `Package.swift` vs `xcodebuild -resolvePackageDependencies`), `package_list_dependencies` (`show-dependencies --format json`), `package_read_resolved` (v1/v2/v3), `package_reset_cache` (`-resetPackageCaches` + `~/Library/Caches/org.swift.swiftpm`), `package_compute_checksum` (`compute-checksum`), `spm_add_dependency`/`spm_remove_dependency` (edit `dependencies:[]`), `cocoapods_manage` (`pod install/update`), `carthage_manage` (`--platform --use-xcframeworks`), `cocoapods_to_spm_migrate` (`Podfile` → `.package` with `dryRun`)

### 12. Vision / Smart UI (4)
- `simctl_get_screen_analysis` — `screenshot` + `sips -g pixelWidth/Height` → `{imagePath, resolution}` for Vision LLM
- `simctl_inspect_ui_tree` — AppleScript temp file → JSON `[{role,name,title,value,center:{x,y}}]`
- `simctl_tap_by_text` — case-insensitive partial/exact search, `click elem` or `click at {center}`, returns `CLICKED:x,y`
- `simctl_fill_field` — find `text field` by label, `click`, `clearFirst` (`cmd+a, del`), `keystroke "text"`

### 13. Simctl Extra — Appearance & StoreKit (5)
- `simctl_set_appearance` (`light|dark` → `xcrun simctl ui appearance`), `simctl_set_dynamic_type` (12 categories `extra-small`→`accessibility-extra-extra-extra-large` → `content-size`), `simctl_manage_storekit` (`load/clear/buy/refund` `.storekit`), `simctl_simulate_event` (`incoming_call` via `tel://` + `network_offline/online` via `status_bar`), `simctl_send_push` (object/string `jsonPayload` with `aps` → `simctl push`)

## Common Workflows

**Build → Test → Coverage:**
```
xcode_build {scheme:"MyApp", destination:"platform=iOS Simulator,name=iPhone 15"}
→ xcode_run_tests {scheme:"MyApp", destination:"..."}
→ xcode_test_coverage {}
```

**Simulator full flow:**
```
simctl_list {booted:true}
→ simctl_lifecycle {action:"boot", udid:"..."}
→ simctl_install_launch {appPath:"build/.../MyApp.app", launch:true}
→ simctl_get_screen_analysis {}
→ simctl_inspect_ui_tree {}
→ simctl_tap_by_text {text:"Continuar"}
→ simctl_fill_field {labelOrPlaceholder:"Correo", textToType:"test@example.com"}
→ simctl_media_capture {type:"screenshot", outputPath:"/tmp/01.png"}
→ simctl_set_appearance {appearance:"dark"}
→ simctl_set_dynamic_type {sizeCategory:"large"}
```

**Assets:**
```
asset_manage_color {xcassetsPath:".../Assets.xcassets", name:"Primary", hexLight:"#FF5733", hexDark:"#900C3F"}
→ asset_generate_appicon {xcassetsPath:"...", baseImagePath:"/tmp/1024.png", includeIos:true, includeWatchOs:true}
→ asset_validate_actool {xcassetsPath:"..."}
```

**Packages:**
```
package_resolve {projectPath:".../MyApp.xcodeproj"}
→ package_read_resolved {resolvedFilePath:".../Package.resolved"}
→ spm_add_dependency {packageSwiftPath:".../Package.swift", url:"https://github.com/Alamofire/Alamofire.git", requirement:"from: \\"5.0.0\\""}
→ cocoapods_to_spm_migrate {podfilePath:".../Podfile", packageSwiftPath:".../Package.swift", dryRun:true}
```

## Rules

1. **Never guess `xcrun` flags** — always use the MCP tool. The server handles `shellEscape`, `expandTilde`, `DerivedData` search, `sips` resize, AppleScript temp files.
2. **Validate paths with `fs.access` first** — return `isError:true` with clear message if missing.
3. **Prefer `simctl_tap_by_text` over coordinates** — let the server compute `center`. Only use Vision (`get_screen_analysis`) for icon-only buttons.
4. **For AppIcon, always ask for 1024x1024 PNG** if the user wants real images, else create structure only.
5. **Bilingual:** If user writes Spanish, answer Spanish, but keep JSON/TOML code English.

## Verification

After any `xcode_build` or `simctl_*` call, show the `formatResult` output (`$ cmd` + `stdout` + `stderr`). Run `make test` (52 tools) to verify server health.

## See Also

- `docs/tools.md` (EN) / `docs/es/tools.md` (ES) — full JSON Schema + examples
- `docs/opencode.md`, `docs/codex.md`, `docs/claude-code.md` — client configs
- `AGENTS.md` — AI behavior, bilingual rule
