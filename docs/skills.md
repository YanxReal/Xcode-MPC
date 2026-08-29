# Skills

> 🌐 **Language:** **English** | [Español](es/skills.md)

Modular, user-invocable knowledge packs that teach your AI agent when and how to use the 52 Xcode MCP tools.

## Why Skills?

The MCP server has **52 tools** — too many to explain in every prompt. Skills group them into **5 focused packs** (Build, Simulator/Vision, Assets, Package, plus the full **xcode-mpc** 52-tool meta-skill). Your agent auto-loads the right skill when you mention *“build MyApp”*, *“take a screenshot”*, *“generate AppIcon”*, etc.

## The 5 Skills

| Skill | Tools | File | Triggers |
|---|---|---|---|
| **`xcode-mpc`** | **52** (all) | `skills/xcode-mpc/SKILL.md` | **Default** — any iOS/macOS/watchOS/tvOS/visionOS, `xcodebuild`, `simctl`, `Assets`, `SPM`, `Vision`. Start here. |
| **`xcode-build`** | 8 | `skills/xcode-build/SKILL.md` | `xcode_build`, `xcode_clean`, `xcode_analyze`, `xcode_archive_export`, `swift_format_lint`, `xcode_run_tests`, `xcode_test_coverage` |
| **`xcode-simulator-vision`** | 20 | `skills/xcode-simulator-vision/SKILL.md` | `simctl`, `devicectl`, `xctrace`, `simctl_get_screen_analysis`, `inspect_ui_tree`, `tap_by_text`, `fill_field` |
| **`xcode-assets`** | 7 | `skills/xcode-assets/SKILL.md` | `Assets.xcassets`, `.colorset`, `.imageset`, `AppIcon`, `actool`, `sips` |
| **`xcode-package`** | 11 | `skills/xcode-package/SKILL.md` | `Package.swift`, `Package.resolved`, `Podfile`, `Cartfile`, `SPM`, `CocoaPods`, `compute-checksum` |

All skills are in `skills/` at the repo root (English-first). Each has frontmatter:

```yaml
---
name: xcode-mpc
description: Professional MCP Server for Xcode — 52 tools ...
user-invocable: true
allowed-tools: Bash(xcodebuild *), Bash(xcrun *), ...
---
```

## Quick Install (Make)

```bash
git clone https://github.com/YanxReal/Xcode-MPC.git
cd Xcode-MPC
make install          # 1. MCP server (Yarn)
make install-skills   # 2. Skills (5 skills → all agent dirs)
make test             # 3. Verify 52 tools
```

`make install-skills` does:

- Detects: `~/.agents/skills` (Opencode), `~/.config/opencode/skills`, `~/.claude/skills` (Claude Code), `~/.codex/skills` (Codex), `.agents/skills` (project local)
- Copies `skills/xcode-*` → each dir via `cp -r`
- Use `make list-skills` to verify, `make uninstall-skills` to remove

**Options:**

```bash
./scripts/install-skills.sh --dry-run   # preview
./scripts/install-skills.sh --dest ~/.claude/skills --force  # custom + overwrite
make install-skills FORCE=1              # overwrite
make install-skills DEST=~/.agents/skills
```

## Manual Install (without Make)

```bash
./scripts/install-skills.sh
./scripts/install-skills.sh --list
./scripts/install-skills.sh --uninstall
```

## Skills.sh Ecosystem (Optional)

Skills are compatible with `npx skills` (https://skills.sh):

```bash
npx skills find xcode
npx skills add YanxReal/Xcode-MPC --skill xcode-mpc  # once published
```

Local install via `make install-skills` is enough — `~/.agents/skills/xcode-mpc` is auto-discovered.

## Using a Skill

Just ask your agent (OpenCode, Codex, Claude Code):

```
Use xcode-mpc to build MyApp for iPhone 15
Use xcode-simulator-vision to take a screenshot and tap "Continue"
Use xcode-assets to generate AppIcon for all Apple OS from /tmp/1024.png
Use xcode-package to migrate Podfile to SPM (dryRun first)
```

The agent loads `SKILL.md` and knows which MCP tool + JSON to call.

## Updating

```bash
git pull origin main
make install-skills FORCE=1
make test
```

## Structure

```
skills/
├── README.md
├── xcode-mpc/SKILL.md           # 52 tools — main
├── xcode-build/SKILL.md         # 8
├── xcode-simulator-vision/SKILL.md # 20
├── xcode-assets/SKILL.md        # 7
└── xcode-package/SKILL.md       # 11
scripts/install-skills.sh        # installer (bash 3.2 compatible)
Makefile: install-skills / list-skills / uninstall-skills / skills-help
```

## See Also

- `README.md` / `README.es.md` — Quick start + Make commands
- `docs/tools.md` — full 52-tool JSON Schema
- `AGENTS.md` — AI behavior, bilingual rule
