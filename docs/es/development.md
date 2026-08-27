# Desarrollo

> 🌐 **Idioma:** [English](../development.md) | **Español**

## Flujo local

```bash
git clone https://github.com/YanxReal/Xcode-MPC.git
cd Xcode-MPC
make install   # yarn install
make doctor    # verifica toolchain
make lint      # node --check
make test      # smoke MCP
make dev       # watch mode
```

## Estructura

```
Xcode-MPC/
├── index.js                 # servidor MCP single-file (1220 líneas, 25 tools)
├── package.json             # Yarn 4, type:module, bin
├── yarn.lock                # lockfile inmutable
├── .yarnrc.yml              # yarnPath vendorizado
├── .yarn/releases/          # Yarn 4.18.0.cjs
├── Makefile                 # DX: install, lint, doctor, test, release
├── README.md
├── docs/
│   ├── installation.md
│   ├── tools.md
│   ├── opencode.md
│   ├── development.md       # este archivo
│   └── architecture.md
├── scripts/
│   ├── smoke_test.py        # smoke principal (python)
│   └── smoke_test.mjs       # fallback node
├── .github/
│   ├── workflows/ci.yml     # CI macOS + Linux
│   └── ISSUE_TEMPLATE/
└── LICENSE
```

## Makefile

```bash
make help        # lista targets
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
make fmt         # prettier (opcional)
make release VERSION=1.0.1
```

## CI

`.github/workflows/ci.yml`:

- **macOS 14** (`macos-14`): `yarn install --immutable` → `make lint` → `make doctor` → `make test`
- **Linux** (`ubuntu-latest`): solo `node --check` (sin Xcode)

Se ejecuta en `push` a `main/develop` y PRs a `main`.

## Convenciones

- **ES Modules** (`import`/`export`), `type: "module"`
- **StdioServerTransport** — sin HTTP, solo stdio
- **promisify(exec)** con `maxBuffer: 10MB`, `shellEscape` para paths
- **JSON Schema** estricto (`additionalProperties:false`)
- **try/catch** global en `CallToolRequestSchema` + retorno `isError:true`

## Añadir nueva herramienta

1. Define en `TOOLS` (`index.js:142`) con `name`, `description`, `inputSchema`
2. Implementa `handle_nueva` con `runCommand`/`formatResult`/`textContent`/`errorContent`
3. Registra en `HANDLERS` (`index.js:1147`)
4. Documenta en `docs/tools.md` y `README.md`
5. `make lint && make test && yarn inspect` → prueba `tools/call`

Ejemplo mínimo:

```js
{
  name: "xcode_version",
  description: "Muestra xcodebuild -version",
  inputSchema: { type:"object", properties:{}, additionalProperties:false }
}
async function handle_xcode_version(){ const r=await runCommand("xcodebuild -version"); return textContent(formatResult("xcode_version", r)); }
HANDLERS.xcode_version = handle_xcode_version;
```

## Release

```bash
make release VERSION=1.1.0
# 1. npm version 1.1.0 --no-git-tag-version
# 2. yarn install (actualiza yarn.lock)
# 3. git commit + tag v1.1.0 + push --tags
```

Luego crea Release en GitHub con changelog.

## Formateo

No hay formatter obligatorio. Si quieres:

```bash
npx --yes prettier --write "index.js" "docs/**/*.md"
# o
make fmt
```

Mantén single-file legible, sin `// TODO`.