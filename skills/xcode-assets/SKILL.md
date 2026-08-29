---
name: xcode-assets
description: Manage Assets.xcassets — colors, images, AppIcon for ALL Apple OS, actool validation, StoreKit. Use for asset_list_contents, asset_manage_color, asset_manage_image, asset_generate_appicon, actool, AppIcon, sips. Triggers: Assets.xcassets, .colorset, .imageset, AppIcon, actool, sips.
user-invocable: true
metadata:
  author: YanxReal
  version: 1.4.0
---

# Xcode Assets & AppIcon

Manages **Assets.xcassets** with fine control over `Contents.json` + `actool` + `sips` (7 tools: 6 assets + 1 AppIcon).

## Tools

- `asset_list_contents` — `fs.readdir` recursive, filter `*.colorset|imageset|appiconset|symbolset|dataset` → `{name,type,relativePath,absolutePath}`
- `asset_manage_color` — creates `${name}.colorset/Contents.json` with `sRGB` components via `hexToRgbFloat` (`#RRGGBB`→`0.000-1.000`). Light as `universal`, Dark as `universal` + `appearances:[{luminance:dark}]`. Supports `#RRGGBBAA`.
- `asset_manage_image` — creates `${name}.imageset`. Bitmap: copy `1x/2x/3x` as `Name_1x.png` etc. Vector: single `Name.pdf` with `preserves-vector-representation:true`.
- `asset_read_info` — reads `Contents.json` (or file) and returns raw JSON.
- `asset_delete` — safe `fs.rm -rf` validates `.colorset|.imageset|...` + `.xcassets` containment.
- `asset_validate_actool` — `xcrun actool --compile /tmp/actool_out --platform iphoneos|macosx|appletvos|watchos|xros --minimum-deployment-target 15.0`
- `asset_generate_appicon` — **42 slots for ALL OS**: iOS 18 + macOS 10 + watchOS 7 + tvOS 4 + visionOS 3. If `baseImagePath` (1024x1024) → `sips -z {pixels}` per slot.

## Workflows

**Color + Image + Validate:**
```
asset_manage_color {xcassetsPath:".../Assets.xcassets", name:"Primary", hexLight:"#FF5733", hexDark:"#900C3F"}
→ asset_manage_image {xcassetsPath:"...", name:"Logo", imagePath1x:"/tmp/a.png", imagePath2x:"/tmp/a@2x.png"}
→ asset_list_contents {xcassetsPath:"..."}
→ asset_validate_actool {xcassetsPath:"...", platform:"iphoneos"}
```

**AppIcon Full OS:**
```
asset_generate_appicon {xcassetsPath:".../Assets.xcassets", iconName:"AppIcon", baseImagePath:"/tmp/1024.png", includeIos:true, includeMacOs:true, includeWatchOs:true, includeTvOs:true, includeVisionOs:true}
// → 42 images, sips resized: icon_iphone_20x20@2x.png (40px), icon_mac_512x512@2x.png (1024px), icon_watch_... etc.
```

## Notes

- `hexToRgbFloat` converts `#RRGGBB` to `sRGB` float `0.000-1.000` with `alpha` support.
- `sips` is macOS native — no extra deps. If missing, tool still creates `Contents.json` with slots.
- `asset_delete` validates extension and `.xcassets` containment to prevent `rm -rf /` accidents.
