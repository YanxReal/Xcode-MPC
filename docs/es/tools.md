# Referencia de Herramientas (31)

> 🌐 **Idioma:** [English](../tools.md) | **Español**

Todas las herramientas usan **JSON Schema** (`inputSchema`) y retornan `content: [{type:"text", text}]` con `isError:true` en fallos. Ejecuta vía OpenCode o MCP Inspector.

---

## 1. Compilación, Diagnóstico y Limpieza

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
Retorna stdout/stderr completos. Usa `shellEscape` para paths con espacios.

### `xcode_clean`
`xcodebuild clean` [+ `rm -rf ~/Library/Developer/Xcode/DerivedData`]

```json
{ "scheme": "MyApp", "purgeDerivedData": true }
```

### `xcode_list_schemes`
`xcodebuild -list -json`

```json
{ "workspace": "MyApp.xcworkspace", "directory": "/ruta/a/proyecto" }
```
Devuelve JSON pretty-printed.

### `xcode_analyze`
`xcodebuild analyze`

```json
{ "scheme": "MyApp", "configuration": "Debug" }
```

### `xcode_archive_export`
2 fases: `xcodebuild archive` → `xcodebuild -exportArchive`

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
`swift-format` (preferido) → fallback `swiftlint`

```json
{ "path": "Sources/", "mode": "lint", "tool": "auto" }
```
- `mode: "lint"` verifica
- `mode: "format"` reescribe in-place
- `tool: "swift-format" | "swiftlint" | "auto"`

---

## 2. Tests y Cobertura

### `xcode_run_tests`
```json
{
  "scheme": "MyApp",
  "destination": "platform=iOS Simulator,name=iPhone 15,OS=17.5",
  "onlyTesting": "MyAppTests/MySuite/testExample",
  "enableCodeCoverage": true
}
```
Genera `build/TestResults.xcresult`.

### `xcode_test_coverage`
`xcrun xccov view --report --json <xcresult>`

```json
{ "xcresultPath": "build/TestResults.xcresult" }
```
Si se omite, busca el `.xcresult` más reciente en `~/Library/Developer/Xcode/DerivedData` (por `mtime`). Retorna JSON + resumen `lineCoverage`.

---

## 3. Simuladores `xcrun simctl` (9 herramientas)

### `simctl_list`
```json
{ "booted": true }
```
`xcrun simctl list --json devices` filtrado por `state === "Booted"`.

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
Screenshots vía `simctl io screenshot`. Record usa `recordVideo` con `SIGINT` tras `durationSeconds`.

### `simctl_push_notification`
```json
{ "bundleId": "com.yanxreal.myapp", "payloadJson": "{\"aps\":{\"alert\":\"Hola\"}}", "udid": "booted" }
```
Valida JSON y escribe tmpfile antes de `simctl push`.

### `simctl_location_mock`
```json
{ "latitude": 40.4168, "longitude": -3.7038 }
```
Valida rangos lat/lon.

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

## 4. Dispositivos físicos `xcrun devicectl`

### `devicectl_list`
```json
{}
```
`xcrun devicectl list devices --json` con fallback a texto si `--json` no disponible (Xcode <15).

### `devicectl_logs`
```json
{ "deviceUdid": "00008101-001A2B...", "durationSeconds": 10 }
```
Streaming durante N segundos (1..120) usando `timeout`/`gtimeout` o `bash` fallback. Retorna primeros 500 líneas / 8000 chars.

---

## 5. Perfilado `xcrun xctrace`

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

## 6. Versiones y Seguridad

### `agvtool_version_bump`
```json
{ "action": "bump_build" }
{ "action": "set_version", "versionString": "2.0.0" }
{ "action": "set_build", "versionString": "42" }
```
Mapea a `xcrun agvtool next-version -all` / `new-marketing-version` / `new-version -all`.

### `xcode_certificates_check`
```json
{}
```
`security find-identity -p codesigning -v`

---

## 7. Editor GUI Xcode

### `xcode_get_active_file`
```json
{}
```
AppleScript `osascript` → `tell application "Xcode" to get path of front document`.

### `xcode_open_at_line`
```json
{ "filePath": "/abs/path/View.swift", "line": 42, "column": 8 }
```
Intento 1: `xed --line 42 /path` → Intento 2: `open xcode://open?path=...&line=42&column=8`

---

## 8. Localización

### `xcode_sync_strings`
```json
{ "filePath": "MyApp/Localizable.xcstrings" }
```
Parsea String Catalog (`sourceLanguage`, `strings[].localizations[lang].stringUnit.{state,value}`) y reporta:

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

## 9. Assets `Assets.xcassets` + `actool` (6 herramientas)

### `asset_list_contents`
```json
{ "xcassetsPath": "/ruta/a/Assets.xcassets" }
```
`fs.readdir` recursivo, filtra `*.colorset|*.imageset|*.appiconset|*.symbolset|*.dataset` y retorna `{name, type, relativePath, absolutePath}` ordenado. Valida que sea directorio `.xcassets`.

### `asset_manage_color`
```json
{ "xcassetsPath": "/ruta/a/Assets.xcassets", "name": "Primary", "hexLight": "#FF5733", "hexDark": "#900C3F" }
```
Crea `${name}.colorset/Contents.json` con componentes `sRGB` vía `hexToRgbFloat` (`#RRGGBB` → `0.000–1.000`). Light como `universal`, Dark como `universal` + `appearances: [{luminance: dark}]`. Soporta `#RRGGBBAA`.

### `asset_manage_image`
```json
{ "xcassetsPath": "/ruta/a/Assets.xcassets", "name": "Logo", "imagePath1x": "/tmp/a.png", "imagePath2x": "/tmp/a@2x.png", "isVector": false }
```
Crea `${name}.imageset`. Para bitmap: copia a `Logo_1x.png` etc. con `scale: 1x/2x/3x`. Para vector (`isVector:true`): copia único como `Logo.pdf/svg` con `properties: {preserves-vector-representation:true}`.

### `asset_read_info`
```json
{ "assetPath": "/ruta/a/Assets.xcassets/Primary.colorset" }
```
Lee `Contents.json` (o el archivo directo si es path directo). Valida JSON y retorna contenido crudo.

### `asset_delete`
```json
{ "assetPath": "/ruta/a/Assets.xcassets/Logo.imageset" }
```
Borrado seguro: valida extensión `*.colorset|*.imageset|...` y que esté dentro de `.xcassets`, luego `fs.rm -rf`.

### `asset_validate_actool`
```json
{ "xcassetsPath": "/ruta/a/Assets.xcassets", "platform": "iphoneos" }
```
`xcrun actool "${xcassetsPath}" --compile /tmp/actool_out --platform iphoneos --minimum-deployment-target 15.0 --output-format human-readable-text`. Retorna resultado `Assets.car` + `✅` o `⚠️` advertencias. Valida imágenes faltantes, nombres duplicados.

---

## Manejo de errores

Todas las herramientas capturan `try/catch` global en `index.js:1195` y helpers `runCommand` en `index.js:39` retornan `{success, stdout, stderr, code}`. Salida formateada vía `formatResult` con `isError:true` si aplica.

## Tests rápidos

```bash
# vía MCP Inspector
yarn inspect
# o
make test
```