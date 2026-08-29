<div align="center">

# Xcode-MPC Skills

*5 modular skills for the 52-tool Xcode MCP Server — Yarn 4 + Make + Vision/UI*

</div>

> 🌐 **Language:** **English** (skills are English-first, bilingual docs in `../docs/`)

## What are Skills?

Skills are **modular, user-invocable knowledge packs** that extend your AI agent (OpenCode, Codex, Claude Code, Cursor). Each skill teaches the agent *when* and *how* to use a group of MCP tools — no guessing `xcrun` flags.

This repo ships **5 skills** (52 tools total) as `skills/*/SKILL.md` with `name`, `description`, `allowed-tools`:

| Skill | Tools | When to Use |
|---|---|---|
| [`xcode-mpc`](./xcode-mpc/SKILL.md) | **52** (all) | **Default** — any iOS/macOS/watchOS/tvOS/visionOS, `xcodebuild`, `simctl`, `Assets`, `SPM`, `Vision`. Start here. |
| [`xcode-build`](./xcode-build/SKILL.md) | 8 | Build/clean/analyze/archive/lint, tests & coverage (`xcodebuild build`, `swift_format_lint`). |
| [`xcode-simulator-vision`](./xcode-simulator-vision/SKILL.md) | 20 | Simulators, devices, profiling, Vision/UI (`simctl`, `devicectl`, `xctrace`, `tap_by_text`). |
| [`xcode-assets`](./xcode-assets/SKILL.md) | 7 | Assets.xcassets, colors, images, AppIcon ALL OS, `actool`/`sips`. |
| [`xcode-package`](./xcode-package/SKILL.md) | 11 | SPM, CocoaPods, Carthage, `Podfile→SPM` migrate, `compute-checksum`. |

## Quick Install (Make — Recommended)

```bash
git clone https://github.com/YanxReal/Xcode-MPC.git
cd Xcode-MPC

# 1. Install MCP server
make install

# 2. Install skills to all known agent locations
make install-skills

# Or preview without writing
make install-skills --dry-run  # or: ./scripts/install-skills.sh --dry-run
```

`make install-skills` does:

1. Detects agent dirs: `~/.agents/skills` (Opencode), `~/.config/opencode/skills`, `~/.claude/skills`, `.agents/skills` (project)
2. Copies `skills/xcode-*` → each dir (via `rsync` or `cp -r`)
3. Verifies: `ls ~/.agents/skills | grep xcode`

**Options:**

```bash
make install-skills DEST=~/.agents/skills  # custom dest
make install-skills FORCE=1                 # overwrite existing
make uninstall-skills                       # remove
make list-skills                            # show installed
```

**Manual (without Make):**

```bash
./scripts/install-skills.sh
./scripts/install-skills.sh --dest ~/.claude/skills --force
./scripts/install-skills.sh --dry-run
```

## Skills.sh Ecosystem (Optional)

Skills are compatible with `npx skills`:

```bash
npx skills find xcode          # search (once published)
npx skills add YanxReal/Xcode-MPC --skill xcode-mpc  # add remote
```

Local skills in `~/.agents/skills/xcode-mpc` are auto-discovered by Opencode/Codex via the `skill` tool — no `npx skills add` needed if you used `make install-skills`.

## Using a Skill

In your agent, just ask:

```
Use xcode-mpc to build MyApp scheme for iPhone 15
Use xcode-simulator-vision to take a screenshot and tap "Continue"
Use xcode-assets to generate AppIcon for all Apple OS from /tmp/1024.png
Use xcode-package to migrate Podfile to SPM
```

The agent will load `SKILL.md` and know which MCP tools to call (`xcode_build`, `simctl_tap_by_text`, etc.) with correct JSON.

## Structure

```
skills/
├── README.md                    # this file
├── xcode-mpc/SKILL.md           # 52 tools — main, user-invocable
├── xcode-build/SKILL.md         # 8 tools
├── xcode-simulator-vision/SKILL.md # 20 tools
├── xcode-assets/SKILL.md        # 7 tools
└── xcode-package/SKILL.md       # 11 tools
```

Each `SKILL.md` has frontmatter:

```yaml
---
name: xcode-mpc
description: Professional MCP Server for Xcode — 52 tools ...
user-invocable: true
allowed-tools: Bash(xcodebuild *), Bash(xcrun *), ...
---
```

## Updating

```bash
git pull origin main
make install-skills FORCE=1
make test  # 52 tools
```

## Uninstall

```bash
make uninstall-skills
# or
./scripts/install-skills.sh --uninstall
```

---

**Maintained by [@YanxReal](https://github.com/YanxReal) — 52 tools, 1.4.0, 5 skills**
