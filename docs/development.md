# Development

> 🌐 **Language:** **English** | [Español](es/development.md)

## Local Workflow

```bash
git clone https://github.com/YanxReal/Xcode-MPC.git
cd Xcode-MPC
make install   # yarn install
make doctor    # verify toolchain
make lint      # node --check
make test      # smoke MCP
make dev       # watch mode
```

## Structure

```
Xcode-MPC/
├── index.js                 # single-file MCP server (2250 lines, 47 tools)
├── package.json             # Yarn 4, type:module, bin
├── yarn.lock                # immutable lockfile
├── .yarnrc.yml              # vendored yarnPath
├── .yarn/releases/          # Yarn 4.18.0.cjs
├── Makefile                 # DX: install, lint, doctor, test, release
├── README.md                # English (main)
├── README.es.md             # Español
├── docs/                    # English (main)
│   ├── installation.md
│   ├── tools.md
│   ├── opencode.md
│   ├── codex.md
│   ├── claude-code.md
│   ├── development.md       # this file
│   └── architecture.md
├── docs/es/                 # Español mirror
│   ├── installation.md
│   ├── tools.md
│   ├── opencode.md
│   ├── codex.md
│   ├── claude-code.md
│   ├── development.md
│   └── architecture.md
├── scripts/
│   ├── smoke_test.py        # main smoke (python)
│   └── smoke_test.mjs       # fallback node
├── .github/
│   ├── workflows/ci.yml     # CI macOS + Linux
│   └── ISSUE_TEMPLATE/
└── LICENSE
```

## Makefile

```bash
make help        # list targets
make install     # yarn install + chmod
make reinstall   # clean + install
make lint        # node --check index.js
make check       # alias lint
make doctor      # xcodebuild, simctl, etc.
make test        # smoke
make start       # yarn start
make dev         # yarn dev (--watch)
make inspect     # npx @modelcontextprotocol/inspector
make clean       # rm -rf node_modules .yarn/cache
make fmt         # prettier (optional)
make release VERSION=1.0.1
```

## CI

`.github/workflows/ci.yml`:

- **macOS 14** (`macos-14`): `yarn install --immutable` → `make lint` → `make doctor` → `make test`
- **Linux** (`ubuntu-latest`): only `node --check` (no Xcode)

Runs on `push` to `main/develop` and PRs to `main`.

## Conventions

- **ES Modules** (`import`/`export`), `type: "module"`
- **StdioServerTransport** — no HTTP, just stdio
- **promisify(exec)** with `maxBuffer: 10MB`, `shellEscape` for paths
- **Strict JSON Schema** (`additionalProperties:false`)
- **Global try/catch** in `CallToolRequestSchema` + return `isError:true`

## Adding a New Tool

1. Define in `TOOLS` (`index.js:142`) with `name`, `description`, `inputSchema`
2. Implement `handle_new` with `runCommand`/`formatResult`/`textContent`/`errorContent`
3. Register in `HANDLERS` (`index.js:1147`)
4. Document in `docs/tools.md` (and `docs/es/tools.md`) + `README.md` / `README.es.md`
5. `make lint && make test && yarn inspect` → test `tools/call`

Minimal example:

```js
{
  name: "xcode_version",
  description: "Show xcodebuild -version",
  inputSchema: { type:"object", properties:{}, additionalProperties:false }
}
async function handle_xcode_version(){ const r=await runCommand("xcodebuild -version"); return textContent(formatResult("xcode_version", r)); }
HANDLERS.xcode_version = handle_xcode_version;
```

## Release

```bash
make release VERSION=1.1.0
# 1. npm version 1.1.0 --no-git-tag-version
# 2. yarn install (updates yarn.lock)
# 3. git commit + tag v1.1.0 + push --tags
```

Then create a GitHub Release with changelog.

## Formatting

No mandatory formatter. If you want:

```bash
npx --yes prettier --write "index.js" "docs/**/*.md"
# or
make fmt
```

Keep single-file readable, no `// TODO`.
