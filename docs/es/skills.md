# Skills

> 🌐 **Idioma:** [English](../skills.md) | **Español**

Packs de conocimiento modulares e invocables que enseñan a tu agente IA cuándo y cómo usar las 52 herramientas de Xcode MCP.

## ¿Por Qué Skills?

El servidor MCP tiene **52 herramientas** — demasiadas para explicar en cada prompt. Los skills las agrupan en **5 packs enfocados** (Build, Simulator/Vision, Assets, Package, más el meta-skill **xcode-mpc** de 52). Tu agente carga el skill correcto cuando dices *“compila MyApp”*, *“haz screenshot”*, *“genera AppIcon”*, etc.

## Las 5 Skills

| Skill | Herramientas | Archivo | Disparadores |
|---|---|---|---|
| **`xcode-mpc`** | **52** (todas) | `skills/xcode-mpc/SKILL.md` | **Por defecto** — cualquier iOS/macOS/watchOS/tvOS/visionOS, `xcodebuild`, `simctl`, `Assets`, `SPM`, `Vision`. Empieza aquí. |
| **`xcode-build`** | 8 | `skills/xcode-build/SKILL.md` | `xcode_build`, `xcode_clean`, `xcode_analyze`, `xcode_archive_export`, `swift_format_lint`, `xcode_run_tests`, `xcode_test_coverage` |
| **`xcode-simulator-vision`** | 20 | `skills/xcode-simulator-vision/SKILL.md` | `simctl`, `devicectl`, `xctrace`, `simctl_get_screen_analysis`, `inspect_ui_tree`, `tap_by_text`, `fill_field` |
| **`xcode-assets`** | 7 | `skills/xcode-assets/SKILL.md` | `Assets.xcassets`, `.colorset`, `.imageset`, `AppIcon`, `actool`, `sips` |
| **`xcode-package`** | 11 | `skills/xcode-package/SKILL.md` | `Package.swift`, `Package.resolved`, `Podfile`, `Cartfile`, `SPM`, `CocoaPods`, `compute-checksum` |

Todas en `skills/` en la raíz (inglés-primero).

## Instalación Rápida (Make)

```bash
git clone https://github.com/YanxReal/Xcode-MPC.git
cd Xcode-MPC
make install          # 1. Servidor MCP (Yarn)
make install-skills   # 2. Skills (5 skills → todos los directorios de agentes)
make test             # 3. Verifica 52 herramientas
```

`make install-skills` hace:

- Detecta: `~/.agents/skills` (Opencode), `~/.config/opencode/skills`, `~/.claude/skills` (Claude Code), `~/.codex/skills` (Codex), `.agents/skills` (local)
- Copia `skills/xcode-*` → cada dir con `cp -r`
- Verifica con `make list-skills`, desinstala con `make uninstall-skills`

**Opciones:**

```bash
./scripts/install-skills.sh --dry-run
./scripts/install-skills.sh --dest ~/.claude/skills --force
make install-skills FORCE=1
```

## Instalación Manual (sin Make)

```bash
./scripts/install-skills.sh
./scripts/install-skills.sh --list
./scripts/install-skills.sh --uninstall
```

## Ecosistema Skills.sh (Opcional)

Compatible con `npx skills` (https://skills.sh):

```bash
npx skills find xcode
npx skills add YanxReal/Xcode-MPC --skill xcode-mpc
```

La instalación local vía `make install-skills` es suficiente.

## Usando un Skill

Pide a tu agente:

```
Usa xcode-mpc para compilar MyApp para iPhone 15
Usa xcode-simulator-vision para hacer screenshot y pulsar "Continuar"
Usa xcode-assets para generar AppIcon para todos los OS desde /tmp/1024.png
Usa xcode-package para migrar Podfile a SPM (dryRun primero)
```

El agente carga `SKILL.md` y sabe qué tool MCP + JSON llamar.

## Actualización

```bash
git pull origin main
make install-skills FORCE=1
make test
```

## Ver También

- `README.md` / `README.es.md` — Quick start + Make
- `docs/es/tools.md` — JSON Schema completo 52 tools
- `AGENTS.md` — comportamiento IA, regla bilingüe
