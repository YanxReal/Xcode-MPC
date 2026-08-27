# AGENTS — How AI Should Work in This Repo

> **This is the single source of truth for any AI agent (OpenCode, Codex, Claude Code, Cursor, Copilot, etc.) working in this repository.**
> If you are an AI, read this whole file before editing anything. If you are a human, this tells you what to expect from AI.

**Version:** 1.0.0 · **Applies to:** `YanxReal/Xcode-MPC` · **Stack:** `index.js` single-file MCP server, Yarn 4, Make, `StdioServerTransport`

---

## 1. Bilingual Rule — NON-NEGOTIABLE

This repo is **bilingual by design**:

| Language | Canonical files | Audience |
|---|---|---|
| **English (primary)** | `README.md`, `docs/*.md` | International, GitHub default |
| **Español (mirror)** | `README.es.md`, `docs/es/*.md` | Hispanohablante |

**Rule:** *Every change to a user-facing Markdown file MUST be mirrored in both languages in the same commit.*

- If you edit `README.md`, you **must** edit `README.es.md` with the equivalent Spanish translation.
- If you edit `docs/installation.md`, you **must** edit `docs/es/installation.md`.
- If you edit `docs/tools.md`, you **must** edit `docs/es/tools.md`, etc.
- Do **not** leave one language behind. A PR that touches `docs/opencode.md` but not `docs/es/opencode.md` will be rejected.

**How to translate:**
- Keep structure identical (same headings, order, tables). Only language changes.
- Preserve code blocks, JSON/TOML, `shellEscape` examples, and `index.js:line` references verbatim — do not translate code.
- Keep badges, links, and `{{placeholders}}` intact. Translate only prose.
- When in doubt, copy the English structure and translate paragraph by paragraph to Spanish.

**Verification (run before commit):**
```bash
# Both READMEs must have same tool count
grep -c "47 tools" README.md
grep -c "47 herramientas" README.es.md
# Both docs sets must exist
ls docs/*.md docs/es/*.md
# No 25/31/43 leftovers
grep -r "25 tools\|31 tools\|43 tools" --include="*.md" docs/ README* && echo "FAIL: stale count" || echo "OK"
```

---

## 2. Language Switcher

Every file has a switcher at the top:

- English files: `> 🌐 **Language:** **English** | [Español](es/... or README.es.md)`
- Spanish files: `> 🌐 **Idioma:** [English](../... or README.md) | **Español**`

If you create a **new doc** `docs/new-feature.md`, you **must** also create `docs/es/new-feature.md` with the mirrored switcher:
- `docs/new-feature.md` → `[Español](es/new-feature.md)`
- `docs/es/new-feature.md` → `[English](../new-feature.md)`

Same for `README.md` ↔ `README.es.md`.

---

## 3. Project Conventions

### 3.1 Single-File Server
- `index.js` is **intentionally monolithic** (~2250 lines, single file). Do not split into `src/` without explicit human approval.
- Keep `#!/usr/bin/env node`, `import { Server } from "@modelcontextprotocol/sdk/server/index.js"` and `import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"` at the top.
- Use `promisify(exec)` with `MAX_BUFFER=10MB`, `shellEscape`, `expandTilde`, `runCommand`, `formatResult`, `textContent`/`errorContent` helpers.
- Every tool needs: `TOOLS` entry (`name`, `description`, `inputSchema` with `additionalProperties:false`) + `async handle_*` + `HANDLERS` registration + `try/catch` in `CallToolRequestSchema`.

### 3.2 Adding a New Tool
1. Define in `TOOLS` (`index.js:142` area) with JSON Schema.
2. Implement `handle_new_tool` before `// Dispatcher` with validation, `fs.access`, `shellEscape`, and `return textContent` / `errorContent`.
3. Register in `HANDLERS` map and bump `Server version` (`1.3.0` → `1.3.1` for patch, `1.4.0` for feature) and log `47→48 herramientas registradas`.
4. Update `package.json:version` + `description` (`47 herramientas`).
5. Update **both** `README.md` + `README.es.md`: Features table, Tools section (numbered), TOC anchor, smoke count.
6. Update **both** `docs/tools.md` + `docs/es/tools.md`: add section `## 13. ...` with JSON examples.
7. Run `make lint && make test` (must be `47→48 tools`).
8. Commit bilingual docs together.

### 3.3 Yarn 4 + Make
- `packageManager: "yarn@4.18.0"`, `nodeLinker: node-modules` in `.yarnrc.yml`, vendored `.yarn/releases/yarn-4.18.0.cjs` must stay committed.
- Always use `make install` (not `yarn install` directly in docs examples for beginners), `make lint`, `make doctor`, `make test`, `make inspect`.
- `yarn.lock` must be committed; `yarn install --immutable` in CI.

### 3.4 Versioning & Docs Counts
- Current: **47 tools**, **1.3.0**, **2250 lines**. When you add a tool, search-replace `47 → 48` in `README*`, `docs/**/tools.md`, `docs/**/development.md`, `docs/**/architecture.md`, `SECURITY.md`, `package.json`, and `index.js` log.
- Never leave `25`/`31`/`43` leftovers — the `AGENTS.md` check above must pass.

---

## 4. Behavior & Tone

- **Objective & concise.** No fluff, no excessive praise. State facts, show `file:line`, show commands.
- **Verify before claiming.** Run `node --check index.js`, `make test`, or `python3 scripts/smoke_test.py` before saying “it works”.
- **Evidence > speculation.** If your finding contradicts a prior claim, state the discrepancy and trust the file.
- **No TODO comments.** Deliver complete, runnable code (`// TODO: ...` is forbidden).
- **Ask before destructive actions.** `make clean` / `rm -rf ~/Library/Developer/Xcode/DerivedData` / `git push --force` require explicit user confirmation.

---

## 5. Multi-Client Support

The same `index.js` (stdio) must work with **all three clients** without changes:

| Client | Config | Verify |
|---|---|---|
| **OpenCode** | `~/.config/opencode/opencode.jsonc` → `mcp.xcode.command: ["node", "/.../index.js"]` | Restart OpenCode → `list xcode tools` |
| **Codex** | `~/.codex/config.toml` → `[mcp_servers.xcode] command="node"` | `codex mcp list` |
| **Claude Code** | `claude mcp add xcode -- node /.../index.js` or `.mcp.json` | `claude mcp list` |

If you change MCP transport or args, test all three. Document in **both** `README.md` and `README.es.md`.

---

## 6. Commit & PR Rules

- Commit messages: `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...` in **English** (even if docs are bilingual).
- Every commit that touches `*.md` must show `README.md` + `README.es.md` or `docs/*.md` + `docs/es/*.md` together. Example:
  ```
  docs: add asset_generate_appicon (47→48)
  ```
- PR template: check `make lint && make test` OK, and confirm bilingual sync.
- Never commit `node_modules`, `.yarn/cache`, `DerivedData`, `*.ipa`, `.env`.

---

## 7. Checklist Before Push (AI must run)

```bash
make lint
make test          # must show 47 tools
grep -r "25 tools\|31 tools\|43 tools" --include="*.md" . && echo "FAIL" || echo "OK bilingual counts"
ls docs/es/*.md | wc -l  # must equal ls docs/*.md | wc -l
node --check index.js
```

If any check fails, fix before `git push`.

---

## 8. If You Are Unsure

- Ask the user (in their language: if they wrote in Spanish, answer in Spanish) before guessing URLs, tool counts, or Apple API names.
- Prefer editing existing files over creating new ones. Never create `*.md` unless explicitly requested, except the required mirror in `docs/es/`.

**Remember:** *Bilingual sync is not optional — it is the definition of “done” in this repo.*

---

*Maintained by [@YanxReal](https://github.com/YanxReal) — last updated 2026-08-27 for 47 tools, v1.3.0, Yarn 4 + Make + CI + Vision/UI.*
