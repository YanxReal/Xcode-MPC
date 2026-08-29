---
name: xcode-build
description: Build, clean, analyze and archive Xcode projects. Use for xcodebuild build/clean/analyze/archive/export, swift-format/lint, and test coverage. Triggers: xcode_build, xcode_clean, xcode_analyze, xcode_archive_export, swift_format_lint, xcode_run_tests, xcode_test_coverage.
user-invocable: true
metadata:
  author: YanxReal
  version: 1.4.0
---

# Xcode Build & Diagnostics

Focuses on **compilation, diagnostics, lint and tests** (8 tools: 6 build + 2 tests) from the 52-tool Xcode MCP.

## Tools

- `xcode_build` — `xcodebuild build` (`scheme*`, `workspace`, `project`, `destination`, `configuration: Debug|Release`)
- `xcode_clean` — `clean` + optional `purgeDerivedData` (`rm -rf ~/Library/Developer/Xcode/DerivedData`)
- `xcode_list_schemes` — `-list -json`
- `xcode_analyze` — `analyze`
- `xcode_archive_export` — `archive` → `-exportArchive` (`.ipa`, `exportOptionsPlist*`)
- `swift_format_lint` — `swift-format` → `swiftlint` fallback (`mode: lint|format`, `tool: auto|swift-format|swiftlint`)
- `xcode_run_tests` — `test` (`scheme*`, `destination*`, `onlyTesting`, `enableCodeCoverage`)
- `xcode_test_coverage` — `xcrun xccov view --report --json` (auto `DerivedData/*.xcresult` via `findLatestXcresult`)

## When to Use

- User says *“build MyApp”*, *“clean DerivedData”*, *“list schemes”*, *“archive IPA”*, *“lint Sources”*, *“run tests”*, *“coverage”*.

## Workflows

**Clean Build:**
```
xcode_clean {scheme:"MyApp", purgeDerivedData:true}
→ xcode_build {scheme:"MyApp", destination:"platform=iOS Simulator,name=iPhone 15", configuration:"Debug"}
```

**Analyze + Lint:**
```
xcode_analyze {scheme:"MyApp"}
→ swift_format_lint {path:"Sources/", mode:"lint"}
```

**Test + Coverage:**
```
xcode_run_tests {scheme:"MyApp", destination:"platform=iOS Simulator,name=iPhone 15", enableCodeCoverage:true}
→ xcode_test_coverage {}
```

## Notes

- Always use `shellEscape` for paths with spaces (server does it).
- `xcode_build` returns full `stdout/stderr` via `formatResult` — show it.
- If `swift-format` not found, fallback to `swiftlint` automatically.
