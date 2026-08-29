#!/usr/bin/env bash
# install-skills.sh — Install Xcode-MPC skills to all known agent locations
# Usage: ./scripts/install-skills.sh [--dest <dir>] [--force] [--dry-run] [--uninstall] [--list]
set -euo pipefail

SKILLS_SRC="$(cd "$(dirname "$0")/.." && pwd)/skills"
DRY_RUN=0
FORCE=0
UNINSTALL=0
LIST=0
CUSTOM_DEST=""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Install Xcode-MPC skills (5 skills, 52 tools) to agent skill directories.

Options:
  --dest <dir>   Custom destination (default: auto-detect all)
  --force        Overwrite existing skills
  --dry-run      Preview without writing
  --uninstall    Remove installed skills
  --list         Show installed skills and exit
  -h, --help     Show this help

Auto-detected destinations:
  - ~/.agents/skills         (Opencode / generic)
  - ~/.config/opencode/skills (Opencode config)
  - ~/.claude/skills         (Claude Code)
  - .agents/skills           (project local)
  - ~/.codex/skills          (Codex, if exists)

Examples:
  ./scripts/install-skills.sh
  ./scripts/install-skills.sh --dry-run
  ./scripts/install-skills.sh --dest ~/.claude/skills --force
  ./scripts/install-skills.sh --uninstall
  make install-skills
  make install-skills FORCE=1

Skills:
  - xcode-mpc (52 tools) — main
  - xcode-build (8)
  - xcode-simulator-vision (20)
  - xcode-assets (7)
  - xcode-package (11)

Repo: https://github.com/YanxReal/Xcode-MPC
EOF
}

log() { echo -e "${GREEN}➜${NC} $*"; }
warn() { echo -e "${YELLOW}⚠️${NC} $*"; }
err() { echo -e "${RED}✗${NC} $*" >&2; }

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dest) CUSTOM_DEST="$2"; shift 2;;
    --force) FORCE=1; shift;;
    --dry-run) DRY_RUN=1; shift;;
    --uninstall) UNINSTALL=1; shift;;
    --list) LIST=1; shift;;
    -h|--help) usage; exit 0;;
    *) err "Unknown option: $1"; usage; exit 1;;
  esac
done

# Discover destinations
DESTS=()
if [[ -n "$CUSTOM_DEST" ]]; then
  dest_expanded="${CUSTOM_DEST/#\~/$HOME}"
  DESTS=("$dest_expanded")
else
  # Auto-detect
  candidates=(
    "$HOME/.agents/skills"
    "$HOME/.config/opencode/skills"
    "$HOME/.claude/skills"
    "$HOME/.codex/skills"
    "$(pwd)/.agents/skills"
  )
  for d in "${candidates[@]}"; do
    # Always include the two primary ones even if not existing (create them)
    if [[ "$d" == "$HOME/.agents/skills" || "$d" == "$HOME/.claude/skills" ]]; then
      DESTS+=("$d")
    elif [[ -d "$(dirname "$d")" ]]; then
      DESTS+=("$d")
    fi
  done
  # Deduplicate (bash 3.2 compatible, no mapfile)
  deduped=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && deduped+=("$line")
  done < <(printf "%s\n" "${DESTS[@]}" | sort -u)
  DESTS=("${deduped[@]}")
fi

# Also always include local project .agents/skills if not custom
if [[ -z "$CUSTOM_DEST" && ! " ${DESTS[*]} " =~ " $(pwd)/.agents/skills " ]]; then
  # Only if parent exists or we are in project
  if [[ -d "$(pwd)/.git" ]]; then
    DESTS+=("$(pwd)/.agents/skills")
  fi
fi

# Validate source
if [[ ! -d "$SKILLS_SRC" ]]; then
  err "Skills source not found: $SKILLS_SRC"
  exit 1
fi

SKILLS_LIST=( "$SKILLS_SRC"/xcode-* )
if [[ ${#SKILLS_LIST[@]} -eq 0 ]] || [[ ! -e "${SKILLS_LIST[0]}" ]]; then
  err "No skills found in $SKILLS_SRC/xcode-*"
  exit 1
fi

# List mode
if [[ $LIST -eq 1 ]]; then
  echo -e "${CYAN}Installed Xcode skills:${NC}"
  for dest in "${DESTS[@]}"; do
    echo ""
    echo "[$dest]"
    if [[ -d "$dest" ]]; then
      ls -1 "$dest" 2>/dev/null | grep -E "xcode-" || echo "  (none)"
      for s in xcode-mpc xcode-build xcode-simulator-vision xcode-assets xcode-package; do
        if [[ -f "$dest/$s/SKILL.md" ]]; then
          echo "  ✓ $s"
        else
          echo "  ✗ $s (missing)"
        fi
      done
    else
      echo "  (dir not exists)"
    fi
  done
  echo ""
  echo "Source: $SKILLS_SRC"
  ls -1 "$SKILLS_SRC" | sed 's/^/  - /'
  exit 0
fi

# Uninstall
if [[ $UNINSTALL -eq 1 ]]; then
  for dest in "${DESTS[@]}"; do
    if [[ ! -d "$dest" ]]; then continue; fi
    for skill_path in "${SKILLS_LIST[@]}"; do
      skill=$(basename "$skill_path")
      target="$dest/$skill"
      if [[ -d "$target" ]]; then
        if [[ $DRY_RUN -eq 1 ]]; then
          echo -e "${YELLOW}[dry-run]${NC} would remove $target"
        else
          rm -rf "$target"
          log "Removed $target"
        fi
      fi
    done
  done
  if [[ $DRY_RUN -eq 0 ]]; then
    echo -e "${GREEN}✓ Uninstalled${NC}"
  fi
  exit 0
fi

# Install
echo -e "${CYAN}Xcode-MPC Skills Installer${NC} — 5 skills, 52 tools"
echo "Source: $SKILLS_SRC"
echo "Destinations: ${DESTS[*]}"
echo ""

for dest in "${DESTS[@]}"; do
  # Expand ~
  dest="${dest/#\~/$HOME}"
  if [[ $DRY_RUN -eq 1 ]]; then
    echo -e "${YELLOW}[dry-run]${NC} would install to $dest"
    for skill_path in "${SKILLS_LIST[@]}"; do
      skill=$(basename "$skill_path")
      echo "  - $skill → $dest/$skill"
    done
    continue
  fi
  mkdir -p "$dest"
  for skill_path in "${SKILLS_LIST[@]}"; do
    skill=$(basename "$skill_path")
    target="$dest/$skill"
    if [[ -d "$target" && $FORCE -eq 0 ]]; then
      warn "Skipping $target (exists, use --force to overwrite)"
      continue
    fi
    rm -rf "$target"
    cp -r "$skill_path" "$target"
    log "Installed $skill → $dest/$skill"
  done
done

if [[ $DRY_RUN -eq 1 ]]; then
  echo ""
  echo -e "${YELLOW}Dry run complete — no files written. Run without --dry-run to install.${NC}"
  exit 0
fi

echo ""
echo -e "${GREEN}✓ Installed 5 skills to ${#DESTS[@]} destinations${NC}"
echo ""
echo "Verify:"
echo "  make list-skills  # or ./scripts/install-skills.sh --list"
echo "  ls ~/.agents/skills | grep xcode"
echo "  ls ~/.claude/skills | grep xcode"
echo ""
echo "Test MCP:"
echo "  make test  # 52 tools"
echo ""
echo "Update later:"
echo "  git pull && make install-skills FORCE=1"
