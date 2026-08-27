# Instalación

> 🌐 **Idioma:** [English](../installation.md) | **Español**

Guía paso a paso para instalar **Xcode MCP Server** con **Yarn 4 (Berry)** y **Make**.

## 1. Requisitos previos

```bash
# macOS + Xcode
xcodebuild -version
# Xcode 15.4  Build version 15F31d  (ejemplo)

# Command Line Tools (incluye make, git, xcrun)
xcode-select --install
make --version
# GNU Make 3.81

# Node 18+
node --version
# v20.x / v22.x

# Yarn 4 — vía Corepack (recomendado)
corepack enable
corepack prepare yarn@stable --activate
yarn --version
# 4.18.0
```

> **Nota:** El proyecto usa `yarnPath: .yarn/releases/yarn-4.18.0.cjs` — no necesitas instalar Yarn global si tienes Corepack. `make install` hace fallback automático.

Opcional pero recomendado:
```bash
brew install swift-format swiftlint
```

## 2. Clonar

```bash
git clone https://github.com/YanxReal/Xcode-MPC.git
cd Xcode-MPC
```

## 3. Instalar dependencias

### Vía Make (recomendada)

```bash
make install
```

Equivale a:
```bash
yarn install
chmod +x index.js
```

Salida esperada:
```
➤ YN0000: · Yarn 4.18.0
➤ YN0000: ┌ Resolution step
➤ YN0000: └ Completed
➤ YN0000: · Done with warnings in 3s
✓ dependencias instaladas
```

### Vía Yarn directo

```bash
yarn install
```

### Reinstalación limpia

```bash
make reinstall
# rm -rf node_modules .yarn/cache + yarn install
```

## 4. Verificar

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
# ✓ tools/list: 47 herramientas
# ✓ xcode_sync_strings OK
# ✓ smoke test PASSED
```

## 5. Configuración Yarn Berry

El repo incluye:

- `.yarnrc.yml` → `yarnPath: .yarn/releases/yarn-4.18.0.cjs`
- `.yarn/releases/yarn-4.18.0.cjs` — Yarn vendorizado (no necesita instalación global)
- `yarn.lock` — lockfile inmutable (`yarn install --immutable` en CI)

Comandos útiles:

```bash
yarn --version          # 4.18.0
yarn install            # instalar
yarn install --immutable # CI — falla si lock desincronizado
yarn up                 # actualizar deps
yarn dedupe             # deduplicar
yarn info --all         # inspeccionar
```

### Migrar desde npm

Si vienes de `npm` / `package-lock.json`:

```bash
rm -f package-lock.json
yarn install
git add yarn.lock .yarnrc.yml package.json
```

## 6. Troubleshooting

| Problema | Solución |
|---|---|
| `yarn: command not found` | `corepack enable && corepack prepare yarn@stable --activate` o `npm i -g yarn` |
| `YN0028: The lockfile would have been modified` | `yarn install` local y commitear `yarn.lock` |
| `xcodebuild: command not found` | `sudo xcode-select -s /Applications/Xcode.app` |
| `simctl` falla | `xcrun simctl list --json devices` debe funcionar — abre Xcode una vez |
| `DerivedData` corrupto | `make clean` o `rm -rf ~/Library/Developer/Xcode/DerivedData` |

## 7. Siguiente paso

- [Integración OpenCode](opencode.md)
- [Referencia Tools](tools.md)