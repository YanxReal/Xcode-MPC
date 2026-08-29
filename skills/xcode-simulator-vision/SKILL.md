---
name: xcode-simulator-vision
description: Simulator, devices, profiling and Vision/UI automation. Use for simctl lifecycle/media/location/privacy/appearance, devicectl, xctrace, Vision LLM screen analysis, tap_by_text and fill_field. Triggers: simctl, devicectl, xctrace, simctl_get_screen_analysis, inspect_ui_tree, tap_by_text, fill_field, simctl_list, install_launch.
user-invocable: true
metadata:
  author: YanxReal
  version: 1.4.0
---

# Xcode Simulator & Vision/UI

Covers **simulators (9 core + 5 extra), devices (2), profiling (1) and Vision/UI (4)** — 20 tools for running and interacting with simulators intelligently.

## Tools

**Core simctl (9):** `simctl_list` (`booted`), `simctl_lifecycle` (`boot|shutdown|erase`), `simctl_install_launch`, `simctl_media_capture` (`screenshot|record`), `simctl_push_notification`, `simctl_location_mock`, `simctl_privacy_control`, `simctl_ui_appearance`, `simctl_open_url`

**Extra simctl (5):** `simctl_set_appearance` (`light|dark`), `simctl_set_dynamic_type` (12 `extra-small`→`accessibility-extra-extra-extra-large`), `simctl_manage_storekit` (`load|clear|buy|refund`), `simctl_simulate_event` (`incoming_call`→`tel://`, `network_offline/online`→`status_bar`), `simctl_send_push` (object `jsonPayload` with `aps` → `simctl push`)

**Devices/Profiling:** `devicectl_list`, `devicectl_logs` (1-120s), `xctrace_profile` (`Time Profiler|Allocations|Leaks`)

**Vision/UI (4):** `simctl_get_screen_analysis` (`screenshot` + `sips` → `{imagePath,resolution}`), `simctl_inspect_ui_tree` (accessibility tree → `[{role,center}]`), `simctl_tap_by_text` (partial/exact → `CLICKED:x,y`), `simctl_fill_field` (`clearFirst` + `keystroke`)

## Vision Workflow (Preferred)

Instead of guessing coordinates:

```
simctl_get_screen_analysis {udid:"booted"}  // get /tmp/sim_screen_latest.png + resolution for Vision LLM
→ simctl_inspect_ui_tree {}                  // get JSON tree with centers
→ simctl_tap_by_text {text:"Continuar"}      // smart tap computes center
→ simctl_fill_field {labelOrPlaceholder:"Correo", textToType:"test@example.com", clearFirst:true}
```

For icon-only buttons, use the `imagePath` from `get_screen_analysis` with Vision LLM to estimate coordinates, then fallback to `tap_by_text`.

## Classic Simulator Flow

```
simctl_list {booted:true}
→ simctl_lifecycle {action:"boot", udid:"..."}
→ simctl_install_launch {appPath:"build/.../MyApp.app", bundleId:"com.yanxreal.myapp", launch:true}
→ simctl_location_mock {latitude:40.41, longitude:-3.70}
→ simctl_media_capture {type:"screenshot", outputPath:"/tmp/01.png"}
→ simctl_set_appearance {appearance:"dark"}
→ simctl_set_dynamic_type {sizeCategory:"large"}
```

## Notes

- **Never interpolate `text` directly into `osascript -e`** — server uses temp file + `escapeAppleScriptString` to prevent injection.
- `simctl_get_screen_analysis` always writes to `outputPath` (default `/tmp/sim_screen_latest.png`) and returns instructions for Vision LLM.
- `inspect_ui_tree` requires `Simulator.app` frontmost and Automation permission.
