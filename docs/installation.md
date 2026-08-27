# Installation

> 🌐 **Language:** **English** | [Español](es/installation.md)

Step-by-step guide to install **Xcode MCP Server** with **Yarn 4 (Berry)** and **Make**.

## 1. Prerequisites

```bash
# macOS + Xcode
xcodebuild -version
# Xcode 15.4  Build version 15F31d  (example)

# Command Line Tools (includes make, git, xcrun)
xcode-select --install
make --version
# GNU Make 3.81

# Node 18+
node --version
# v20.x / v22.x

# Yarn 4 — via Corepack (recommended)
corepack enable
corepack prepare yarn@stable --activate
yarn --version
# 4.18.0
```

> **Note:** The project uses `yarnPath: .yarn/releases/yarn-4.18.0.cjs` — you don't need a global Yarn install if you have Corepack. `make install` falls back automatically.

Optional but recommended:
```bash
brew install swift-format swiftlint
```

## 2. Clone

```bash
git clone https://github.com/YanxReal/Xcode-MPC.git
cd Xcode-MPC
```

## 3. Install dependencies

### Via Make (recommended)

```bash
make install
```

Equivalent to:
```bash
yarn install
chmod +x index.js
```

Expected output:
```
➤ YN0000: · Yarn 4.18.0
➤ YN0000: ┌ Resolution step
➤ YN0000: └ Completed
➤ YN0000: · Done with warnings in 3s
✓ dependencies installed
```

### Via Yarn directly

```bash
yarn install
```

### Clean reinstall

```bash
make reinstall
# rm -rf node_modules .yarn/cache + yarn install
```

## 4. Verify

```bash
make doctor
# Node: v20.x
# Yarn: 4.18.0
# Xcode: Xcode 15.x
# xcrun: xcrun version 70
# ...

make lint
# ✓ lint ok

make test
# ✓ tools/list: 43 tools
# ✓ xcode_sync_strings OK
# ✓ smoke test PASSED
```

## 5. Yarn Berry Configuration

The repo includes:

- `.yarnrc.yml` → `yarnPath: .yarn/releases/yarn-4.18.0.cjs`
- `.yarn/releases/yarn-4.18.0.cjs` — Vendored Yarn (no global install needed)
- `yarn.lock` — Immutable lockfile (`yarn install --immutable` in CI)

Useful commands:

```bash
yarn --version          # 4.18.0
yarn install            # install
yarn install --immutable # CI — fails if lock is out of sync
yarn up                 # update deps
yarn dedupe             # deduplicate
yarn info --all         # inspect
```

### Migrate from npm

If you come from `npm` / `package-lock.json`:

```bash
rm -f package-lock.json
yarn install
git add yarn.lock .yarnrc.yml package.json
```

## 6. Troubleshooting

| Issue | Solution |
|---|---|
| `yarn: command not found` | `corepack enable && corepack prepare yarn@stable --activate` or `npm i -g yarn` |
| `YN0028: The lockfile would have been modified` | Run `yarn install` locally and commit `yarn.lock` |
| `xcodebuild: command not found` | `sudo xcode-select -s /Applications/Xcode.app` |
| `simctl` fails | `xcrun simctl list --json devices` must work — open Xcode once |
| `DerivedData` corrupted | `make clean` or `rm -rf ~/Library/Developer/Xcode/DerivedData` |

## 7. Next steps

- [OpenCode Integration](opencode.md)
- [Tools Reference](tools.md)
- [Codex Integration](codex.md)
- [Claude Code Integration](claude-code.md)
