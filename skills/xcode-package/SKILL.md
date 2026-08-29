---
name: xcode-package
description: Swift Package Manager, CocoaPods, Carthage. Use for SPM resolve/update/list/read_resolved/reset_cache/compute_checksum, spm_add/remove_dependency, cocoapods_manage, carthage_manage, Podfile→SPM migrate. Triggers: Package.swift, Package.resolved, Podfile, Cartfile, SPM, CocoaPods, compute-checksum.
user-invocable: true
metadata:
  author: YanxReal
  version: 1.4.0
---

# Xcode Package Management

Covers **SPM (6) + CocoaPods/Carthage (4) + migrate (1)** — 11 tools for all package managers.

## Tools

**SPM (6):**
- `package_resolve` — `swift package resolve` vs `xcodebuild -resolvePackageDependencies` (auto-detects `Package.swift` vs `.xcworkspace/.xcodeproj`)
- `package_update` — `swift package update` vs `xcodebuild -updatePackageDependencies`
- `package_list_dependencies` — `swift package show-dependencies --format json`
- `package_read_resolved` — reads `Package.resolved` (v1/v2/v3) → `{version, totalDependencies, pins:[{identity,location,version,revision}]}`
- `package_reset_cache` — `xcodebuild -resetPackageCaches` + `rm -rf ~/Library/Caches/org.swift.swiftpm` + `find DerivedData/SourcePackages`
- `package_compute_checksum` — `swift package compute-checksum <zip>`

**SPM Editing (2):**
- `spm_add_dependency` — injects `.package(url: "...", from: "...")` into `dependencies:[]` in `Package.swift` (regex, preserves formatting)
- `spm_remove_dependency` — removes line containing `dependencyUrlOrName` + cleans trailing `,`

**CocoaPods/Carthage (3):**
- `cocoapods_manage` — `pod install|update|deintegrate|outdated [--repo-update]` (checks `Podfile` + `which pod`)
- `carthage_manage` — `carthage update|bootstrap|build --platform --use-xcframeworks` (checks `Cartfile`)
- `cocoapods_to_spm_migrate` — parses `Podfile` (`pod 'SnapKit', '~> 5.0'` → `.upToNextMajor`, `pod 'Alamofire', '5.8.0'` → `exact`, `:git =>` → custom URL), supports `dryRun` preview + injects into `Package.swift`.

## Workflows

**SPM Resolve → Inspect:**
```
package_resolve {projectPath:".../MyApp.xcodeproj"}
→ package_list_dependencies {packageDirectory:"..."}
→ package_read_resolved {resolvedFilePath:".../Package.resolved"}
```

**Add/Remove:**
```
spm_add_dependency {packageSwiftPath:".../Package.swift", url:"https://github.com/Alamofire/Alamofire.git", requirement:"from: \\"5.8.0\\""}
→ spm_remove_dependency {packageSwiftPath:"...", dependencyUrlOrName:"Alamofire"}
```

**Migrate Legacy:**
```
cocoapods_to_spm_migrate {podfilePath:".../Podfile", packageSwiftPath:".../Package.swift", dryRun:true}
→ cocoapods_to_spm_migrate {podfilePath:".../Podfile", packageSwiftPath:".../Package.swift", dryRun:false}
```

**CocoaPods legacy:**
```
cocoapods_manage {projectPath:".../Podfile/dir", action:"install", repoUpdate:true}
→ carthage_manage {projectPath:".../Cartfile/dir", action:"bootstrap", platform:"iOS"}
```

## Notes

- `spm_add_dependency` checks `content.includes(url)` to avoid duplicates.
- `cocoapods_to_spm_migrate` has `knownOrgs` heuristic for popular pods (Alamofire→Alamofire, SnapKit→SnapKit, etc.).
- `package_reset_cache` cleans both Xcode and global SPM cache — useful when `resolve` fails.
