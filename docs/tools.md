# Tools Reference (47)

> 🌐 **Language:** **English** | [Español](es/tools.md)

All tools use **JSON Schema** (`inputSchema`) and return `content: [{type:"text", text}]` with `isError:true` on failure. Run via OpenCode or MCP Inspector.

---

## 1. Build, Diagnostics & Clean

### `xcode_build`
`xcodebuild build`

```json
{
  "scheme": "MyApp",
  "workspace": "MyApp.xcworkspace",
  "project": "MyApp.xcodeproj",
  "destination": "platform=iOS Simulator,name=iPhone 15,OS=17.5",
  "configuration": "Debug"
}
```
Returns full stdout/stderr. Uses `shellEscape` for paths with spaces.

### `xcode_clean`
`xcodebuild clean` [+ `rm -rf ~/Library/Developer/Xcode/DerivedData`]

```json
{ "scheme": "MyApp", "purgeDerivedData": true }
```

### `xcode_list_schemes`
`xcodebuild -list -json`

```json
{ "workspace": "MyApp.xcworkspace", "directory": "/path/to/project" }
```
Returns pretty-printed JSON.

### `xcode_analyze`
`xcodebuild analyze`

```json
{ "scheme": "MyApp", "configuration": "Debug" }
```

### `xcode_archive_export`
2 phases: `xcodebuild archive` → `xcodebuild -exportArchive`

```json
{
  "scheme": "MyApp",
  "exportOptionsPlist": "~/ExportOptions.plist",
  "archivePath": "build/MyApp.xcarchive",
  "exportPath": "build/export",
  "configuration": "Release",
  "destination": "generic/platform=iOS"
}
```

### `swift_format_lint`
`swift-format` (preferred) → fallback `swiftlint`

```json
{ "path": "Sources/", "mode": "lint", "tool": "auto" }
```
- `mode: "lint"` checks
- `mode: "format"` rewrites in-place
- `tool: "swift-format" | "swiftlint" | "auto"`

---

## 2. Tests & Coverage

### `xcode_run_tests`
```json
{
  "scheme": "MyApp",
  "destination": "platform=iOS Simulator,name=iPhone 15,OS=17.5",
  "onlyTesting": "MyAppTests/MySuite/testExample",
  "enableCodeCoverage": true
}
```
Generates `build/TestResults.xcresult`.

### `xcode_test_coverage`
`xcrun xccov view --report --json <xcresult>`

```json
{ "xcresultPath": "build/TestResults.xcresult" }
```
If omitted, finds the most recent `.xcresult` in `~/Library/Developer/Xcode/DerivedData` (by `mtime`). Returns JSON + `lineCoverage` summary.

---

## 3. Simulators `xcrun simctl` (9 tools)

### `simctl_list`
```json
{ "booted": true }
```
`xcrun simctl list --json devices` filtered by `state === "Booted"`.

### `simctl_lifecycle`
```json
{ "action": "boot", "udid": "booted" }
{ "action": "shutdown", "udid": "A1B2-..." }
{ "action": "erase", "udid": "A1B2-..." }
```

### `simctl_install_launch`
```json
{ "appPath": "build/Debug-iphonesimulator/MyApp.app", "bundleId": "com.yanxreal.myapp", "launch": true, "udid": "booted" }
```

### `simctl_media_capture`
```json
{ "type": "screenshot", "outputPath": "/tmp/screen.png", "udid": "booted" }
{ "type": "record", "outputPath": "/tmp/cap.mp4", "durationSeconds": 10 }
```
Screenshots via `simctl io screenshot`. Record uses `recordVideo` with `SIGINT` after `durationSeconds`.

### `simctl_push_notification`
```json
{ "bundleId": "com.yanxreal.myapp", "payloadJson": "{\"aps\":{\"alert\":\"Hello\"}}", "udid": "booted" }
```
Validates JSON and writes tmpfile before `simctl push`.

### `simctl_location_mock`
```json
{ "latitude": 40.4168, "longitude": -3.7038 }
```
Validates lat/lon ranges.

### `simctl_privacy_control`
```json
{ "service": "camera", "action": "grant", "bundleId": "com.yanxreal.myapp" }
```
`service`: `all|calendar|camera|contacts|homekit|location|location-always|media-library|microphone|motion|photos|reminders|siri`
`action`: `grant|revoke|reset`

### `simctl_ui_appearance`
```json
{ "appearance": "dark", "udid": "booted" }
```

### `simctl_open_url`
```json
{ "url": "myapp://item/123", "udid": "booted" }
{ "url": "https://example.com" }
```

---

## 4. Physical Devices `xcrun devicectl`

### `devicectl_list`
```json
{}
```
`xcrun devicectl list devices --json` with text fallback if `--json` unavailable (Xcode <15).

### `devicectl_logs`
```json
{ "deviceUdid": "00008101-001A2B...", "durationSeconds": 10 }
```
Streaming for N seconds (1–120) using `timeout`/`gtimeout` or `bash` fallback. Returns first 500 lines / 8000 chars.

---

## 5. Profiling `xcrun xctrace`

### `xctrace_profile`
```json
{
  "template": "Time Profiler",
  "timeLimitSeconds": 10,
  "outputFilePath": "/tmp/trace.trace",
  "device": "iPhone 15",
  "launchApp": "com.yanxreal.myapp"
}
```
`template`: `Time Profiler | Allocations | Leaks | System Trace | Network | Core Data`

---

## 6. Versions & Security

### `agvtool_version_bump`
```json
{ "action": "bump_build" }
{ "action": "set_version", "versionString": "2.0.0" }
{ "action": "set_build", "versionString": "42" }
```
Maps to `xcrun agvtool next-version -all` / `new-marketing-version` / `new-version -all`.

### `xcode_certificates_check`
```json
{}
```
`security find-identity -p codesigning -v`

---

## 7. Xcode GUI Editor

### `xcode_get_active_file`
```json
{}
```
AppleScript `osascript` → `tell application "Xcode" to get path of front document`.

### `xcode_open_at_line`
```json
{ "filePath": "/abs/path/View.swift", "line": 42, "column": 8 }
```
Attempt 1: `xed --line 42 /path` → Attempt 2: `open xcode://open?path=...&line=42&column=8`

---

## 8. Localization

### `xcode_sync_strings`
```json
{ "filePath": "MyApp/Localizable.xcstrings" }
```
Parses String Catalog (`sourceLanguage`, `strings[].localizations[lang].stringUnit.{state,value}`) and reports:

```json
{
  "totalKeys": 42,
  "languages": ["en","es","fr"],
  "missing": { "es": ["bye"] },
  "pendingTranslation": { "es": [{ "key":"pending","state":"needs_review" }] },
  "emptyValues": { "fr": ["hello"] }
}
```

---

## 9. Assets `Assets.xcassets` + `actool` (6 tools)

### `asset_list_contents`
```json
{ "xcassetsPath": "/path/to/Assets.xcassets" }
```
`fs.readdir` recursive, filters `*.colorset|*.imageset|*.appiconset|*.symbolset|*.dataset` and returns `{name, type, relativePath, absolutePath}` sorted. Validates `.xcassets` directory.

### `asset_manage_color`
```json
{ "xcassetsPath": "/path/to/Assets.xcassets", "name": "Primary", "hexLight": "#FF5733", "hexDark": "#900C3F" }
```
Creates `${name}.colorset/Contents.json` with `sRGB` components via `hexToRgbFloat` (`#RRGGBB` → `0.000–1.000`). Light as `universal`, Dark as `universal` + `appearances: [{luminance: dark}]`. Supports `#RRGGBBAA`.

### `asset_manage_image`
```json
{ "xcassetsPath": "/path/to/Assets.xcassets", "name": "Logo", "imagePath1x": "/tmp/a.png", "imagePath2x": "/tmp/a@2x.png", "isVector": false }
```
Creates `${name}.imageset`. For bitmap: copies to `Logo_1x.png` etc. with `scale: 1x/2x/3x`. For vector (`isVector:true`): copies single file as `Logo.pdf/svg` with `properties: {preserves-vector-representation:true}`.

### `asset_read_info`
```json
{ "assetPath": "/path/to/Assets.xcassets/Primary.colorset" }
```
Reads `Contents.json` (or file itself if direct). Validates JSON and returns raw content.

### `asset_delete`
```json
{ "assetPath": "/path/to/Assets.xcassets/Logo.imageset" }
```
Safe delete: validates `*.colorset|*.imageset|...` extension and `.xcassets` containment, then `fs.rm -rf`.

### `asset_validate_actool`
```json
{ "xcassetsPath": "/path/to/Assets.xcassets", "platform": "iphoneos" }
```
`xcrun actool "${xcassetsPath}" --compile /tmp/actool_out --platform iphoneos --minimum-deployment-target 15.0 --output-format human-readable-text`. Returns `Assets.car` result + `✅` or `⚠️` warnings. Validates missing images, duplicate names.

---

## 10. AppIcon `Assets.xcassets` + `sips` (1 tool)

### `asset_generate_appicon`
```json
{ "xcassetsPath": "/path/to/Assets.xcassets", "iconName": "AppIcon", "baseImagePath": "/tmp/1024.png", "includeIos": true, "includeMacOs": true, "includeWatchOs": true, "includeTvOs": true, "includeVisionOs": true }
```
Generates `${iconName}.appiconset/Contents.json` with **42 slots** for **ALL Apple OS**: iOS (iphone/ipad/ios-marketing 20x20-1024), macOS (16x16-512x512), watchOS (38/42/45mm roles), tvOS (400x240/1280x768), visionOS (32/1024). If `baseImagePath` provided, runs `sips -z {pixels} {base} --out {slot}` per slot.

---

## 11. Package / SPM / CocoaPods / Carthage (11 tools)

### `package_resolve` / `package_update`
```json
{ "projectPath": "/path/to/MyApp.xcodeproj" }
```
Auto-detects `Package.swift` (`swift package resolve/update`) vs `xcodebuild -resolvePackageDependencies`.

### `package_list_dependencies`
```json
{ "packageDirectory": "/path/to/Package.swift/dir" }
```
`swift package show-dependencies --format json`

### `package_read_resolved`
```json
{ "resolvedFilePath": "/path/to/Package.resolved" }
```
Supports v1/v2/v3 format, returns `{version, totalDependencies, pins:[{identity, location, version, revision}]}`

### `package_reset_cache`
```json
{ "projectPath": "/path/to/MyApp.xcodeproj" }
```
`xcodebuild -resetPackageCaches` + `rm -rf ~/Library/Caches/org.swift.swiftpm`

### `package_compute_checksum`
```json
{ "zipPath": "/path/to/MyXCFramework.zip" }
```
`swift package compute-checksum`

### `spm_add_dependency` / `spm_remove_dependency`
```json
{ "packageSwiftPath": "/path/to/Package.swift", "url": "https://github.com/Alamofire/Alamofire.git", "requirement": "from: \"5.8.0\"" }
```
Edits `dependencies: [...]` array in Package.swift.

### `cocoapods_manage` / `carthage_manage`
```json
{ "projectPath": "/path/to/Podfile/dir", "action": "install", "repoUpdate": false }
{ "projectPath": "/path/to/Cartfile/dir", "action": "bootstrap", "platform": "iOS", "useXcframeworks": true }
```

### `cocoapods_to_spm_migrate`
```json
{ "podfilePath": "/path/to/Podfile", "packageSwiftPath": "/path/to/Package.swift", "dryRun": true }
```
Parses `pod 'SnapKit', '~> 5.0'` → `.upToNextMajor`, supports `dryRun` preview.

---

## 12. Vision / Smart UI (4 tools)

### `simctl_get_screen_analysis`
```json
{ "udid": "booted", "outputPath": "/tmp/sim_screen_latest.png" }
```
`xcrun simctl io screenshot` + `sips -g pixelWidth/Height` → `{imagePath, resolution:{width,height}, instructions}` for Vision LLM.

### `simctl_inspect_ui_tree`
```json
{ "udid": "booted" }
```
AppleScript via temp file → JSON array `[{role,name,title,value,description,position:{x,y},size:{w,h},center:{x,y}}]`. Fallback to raw if not JSON.

### `simctl_tap_by_text`
```json
{ "text": "Continuar", "exactMatch": false, "udid": "booted" }
```
Case-insensitive partial/exact search via AppleScript `System Events` `entire contents of window 1`, clicks `elem` or `click at {centerX,centerY}`, returns `CLICKED:x,y:role`.

### `simctl_fill_field`
```json
{ "labelOrPlaceholder": "Correo", "textToType": "test@example.com", "clearFirst": true }
```
Finds `role contains "text field"` matching label, `click`, `keystroke "a" using command down` + `key code 51` if `clearFirst`, then `keystroke "text"`.

---

## Error Handling

All tools catch via global `try/catch` in `index.js:1195` and helpers `runCommand` in `index.js:39` return `{success, stdout, stderr, code}`. Formatted output via `formatResult` with `isError:true` when applicable.

## Quick Tests

```bash
# via MCP Inspector
yarn inspect
# or
make test
```
