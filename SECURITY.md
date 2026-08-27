# Security Policy

> 🌐 **Language:** **English** (primary) | [Español](#-política-de-seguridad-es)

We take the security of **Xcode MCP Server** seriously. This document describes how to report vulnerabilities, what to expect, and which versions are supported. For the safety of all users, **please do not report security issues via public GitHub Issues**.

---

## Supported Versions

Only the latest `main` branch and the latest tagged release are actively supported with security fixes.

| Version | Supported |
|---|---|
| `main` (latest commit) | ✅ |
| Latest release (`v1.x`) | ✅ |
| Older tags / forks | ❌ — please update |

If you are on an older version, update to the latest `main` (`git pull origin main && yarn install`) before reporting.

We **do not** backport security fixes to older tags — we release a new patch version instead. Check [Releases](https://github.com/YanxReal/Xcode-MPC/releases) and [CI](https://github.com/YanxReal/Xcode-MPC/actions).

## Reporting a Vulnerability

### Preferred: GitHub Private Vulnerability Reporting (P0)

1. Go to **Security** tab → **Report a vulnerability** (or directly: `https://github.com/YanxReal/Xcode-MPC/security/advisories/new`)
2. Describe the issue, impact, and reproduction steps. Include:
   - Affected file(s) and line(s) — e.g. `index.js:39` (`runCommand`), `index.js:25` (`shellEscape`)
   - MCP tool name (e.g. `xcode_build`, `simctl_install_launch`)
   - Example `arguments` JSON that triggers the issue
   - Logs (`stdout` / `stderr` from `formatResult`)
   - Environment: `node --version`, `yarn --version`, `xcodebuild -version`, `macOS version`
   - Proof-of-concept (if any) — **do not include exploits for RCE in public**
3. Submit. You will receive an acknowledgment within **48 hours**.

> This creates a **private** advisory visible only to maintainers until a fix is published. You will be credited in the advisory if you wish.

### Alternative: Email

If you cannot use GitHub reporting, email the maintainer via the profile at https://github.com/YanxReal (use the GitHub-provided private email). Encrypt with PGP if needed and mention `Xcode-MPC SECURITY` in the subject.

**Please do not:**
- Open a public Issue, Discussion, or PR with vulnerability details
- Share exploits publicly before a fix is released
- Test against `github.com/YanxReal/*` infrastructure beyond your own clone

## What to Expect

| Stage | SLA |
|---|---|
| Acknowledgment | **≤ 48 hours** |
| Initial triage (reproduce / severity) | **≤ 5 business days** |
| Fix & private patch | **≤ 14 days** for High/Critical, best effort for Low/Medium |
| Public disclosure (advisory + release) | After patch is merged and tagged; coordinated with reporter |

We use **CVSS 3.1** for severity. You can track progress via the private advisory thread.

## Scope

**In scope:**

- `index.js` — MCP server, all 47 tools (`xcode_build`, `simctl_*`, `devicectl_*`, `xctrace_profile`, `agvtool_version_bump`, `xcode_get_active_file`, `xcode_sync_strings`, etc.)
- Helpers: `shellEscape` (`index.js:25`), `runCommand` (`index.js:39`), `expandTilde`, `findLatestXcresult`
- Dependency supply chain: `@modelcontextprotocol/sdk`, `yarn.lock` / `.yarn/releases`
- Build / CI: `Makefile`, `.github/workflows/ci.yml`, `scripts/smoke_test.py`
- Configuration templates: `opencode.json` / `~/.codex/config.toml` / `claude mcp` / `.mcp.json`

**Out of scope (but we still appreciate reports):**

- Vulnerabilities in Apple tooling itself (`xcodebuild`, `simctl`, `devicectl`, `xctrace`) — report to Apple Product Security instead and reference it
- Social engineering, physical access, or `DerivedData` tampering requiring local root
- DoS requiring already-authenticated local execution (`xcode_build` is intentionally a shell executor for local use)

## Disclosure Policy & Safe Harbor

- We follow **coordinated disclosure**. Please give us reasonable time to fix before public disclosure.
- We will **credit you** in the GitHub Security Advisory and Release Notes unless you prefer to remain anonymous.
- We will **not** take legal action against good-faith researchers who follow this policy, respect privacy, and avoid data exfiltration beyond what is necessary to demonstrate the issue.
- No bounty program is offered at this time, but valid reports will be publicly acknowledged.

## Hardening Notes for Users

- This server executes local shell commands (`xcodebuild`, `xcrun`, `security`, `osascript`) **as your user**. Only run it in trusted MCP clients (OpenCode, Codex, Claude Code) with `enabled:true`.
- Keep `.yarn/releases/yarn-4.18.0.cjs` and `yarn.lock` committed and run `yarn install --immutable` in CI.
- Use `make lint && make test && make doctor` before exposing to untrusted prompts.
- Enable GitHub **Secret scanning** and **Push protection** (already active on this repo) to avoid committing ` ExportOptions.plist` secrets, `.p12`, or API keys.

---

## 🇪🇸 Política de Seguridad (ES)

> Esta es la traducción al español. En caso de conflicto, prevalece la versión en inglés arriba.

Tomamos muy en serio la seguridad de **Xcode MCP Server**. Por la seguridad de todos, **no reportes vulnerabilidades en Issues públicos**.

### Versiones Soportadas

| Versión | Soporte |
|---|---|
| `main` (último commit) | ✅ |
| Último release (`v1.x`) | ✅ |
| Tags antiguos / forks | ❌ — actualiza |

### Cómo Reportar

**Preferido:** pestaña **Security → Report a vulnerability** en https://github.com/YanxReal/Xcode-MPC/security/advisories/new — es privado entre tú y los maintainers.

**Alternativa:** email al perfil https://github.com/YanxReal con asunto `Xcode-MPC SECURITY`.

Incluye: archivo/línea (`index.js:39`), tool MCP, `arguments` JSON, logs, `node --version`, `xcodebuild -version`, PoC sin exploits públicos.

### Qué Esperar

- Acuse de recibo ≤ 48h
- Triage inicial ≤ 5 días laborables
- Parche ≤ 14 días para Alta/Crítica
- Divulgación coordinada tras el tag + advisory

### Alcance

En alcance: `index.js` y las 43 tools, helpers `shellEscape`/`runCommand`, `yarn.lock`, `Makefile`, `ci.yml`, plantillas `opencode.json`/`config.toml`/`.mcp.json`.

Fuera de alcance: vulnerabilidades del propio Apple (`xcodebuild`/`simctl`) — repórtalas a Apple.

### Divulgación & Safe Harbor

Divulgación coordinada, crédito si lo deseas, sin acciones legales contra investigadores de buena fe, sin bounty por ahora.

### Recomendaciones

Ejecuta solo en clientes MCP de confianza, mantén `yarn.lock` inmutable, usa `make doctor` y ten activado **Secret scanning + Push protection** (ya activo en este repo).

---

**Thank you for helping keep Xcode MCP Server and the Apple ecosystem safe!**
If you have questions about this policy, open a **non-sensitive** Discussion or Issue with label `security-policy`.
