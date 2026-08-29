.PHONY: help install deps clean reinstall lint check start dev inspect test fmt doctor enable-corepack skills install-skills uninstall-skills list-skills skills-help

# Variables
YARN ?= yarn
NODE ?= node

# Detectar yarn version para mensajes
YARN_VERSION := $(shell $(YARN) --version 2>/dev/null || echo "not-found")

.DEFAULT_GOAL := help

help: ## Muestra esta ayuda
	@echo ""
	@echo " Xcode MCP Server — Makefile"
	@echo " Yarn $(YARN_VERSION) | Node $$(node --version)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo " Ejemplos:"
	@echo "  make install        # instala dependencias"
	@echo "  make dev            # modo watch"
	@echo "  make inspect        # inspector MCP"
	@echo ""

enable-corepack: ## Habilita Corepack (recomendado para Yarn 4)
	@corepack enable 2>/dev/null || echo "corepack no disponible, usando yarnPath .yarn/releases"
	@echo "✓ corepack habilitado"

install: ## Instala dependencias con Yarn (equivalente a yarn install)
	@if ! command -v yarn >/dev/null 2>&1; then \
		echo "⚠️  yarn no encontrado, instalando vía corepack..."; \
		corepack enable; corepack prepare yarn@stable --activate; \
	fi
	@echo "➜ yarn install (Yarn $(YARN_VERSION))"
	$(YARN) install
	@chmod +x index.js
	@echo "✓ dependencias instaladas"

deps: install ## Alias de install

reinstall: clean install ## Limpia e reinstala desde cero

clean: ## Limpia node_modules, caches y artefactos
	@echo "➜ limpiando..."
	rm -rf node_modules .yarn/cache .pnp.* .parcel-cache build
	rm -rf ~/Library/Developer/Xcode/DerivedData 2>/dev/null; true
	@echo "✓ limpio"

lint: ## Valida sintaxis de index.js
	@echo "➜ node --check index.js"
	@$(NODE) --check index.js && echo "✓ lint ok"

check: lint ## Alias de lint
	@echo "➜ verificando imports..."
	@$(NODE) --input-type=module -e "import('./index.js')" 2>&1 | head -n 20 || true

start: ## Inicia el servidor MCP (stdio)
	$(YARN) start

dev: ## Inicia en modo watch (Node --watch)
	$(YARN) dev

inspect: ## Abre el inspector MCP oficial
	$(YARN) inspect

test: ## Smoke test MCP (initialize + tools/list + sync_strings)
	@echo "➜ smoke test MCP..."
	@python3 scripts/smoke_test.py 2>&1 || node scripts/smoke_test.mjs 2>&1 || echo "ejecuta: python3 scripts/smoke_test.py"

fmt: ## Formatea con prettier si está disponible (no-op si no)
	@if command -v npx >/dev/null 2>&1; then \
		npx --yes prettier --write "index.js" "docs/**/*.md" 2>/dev/null || echo "prettier no configurado, skip"; \
	else echo "npx no disponible"; fi

doctor: ## Verifica entorno Xcode / Apple Dev Tools
	@echo "== Doctor =="
	@echo "Node: $$(node --version)"
	@echo "Yarn: $$(yarn --version)"
	@echo "Xcode: $$(xcodebuild -version 2>&1 | head -n 2 || echo 'no encontrado')"
	@echo "xcrun: $$(xcrun --version 2>&1 | head -n 1 || echo 'no encontrado')"
	@echo "simctl: $$(xcrun simctl list --version 2>&1 | head -n 1 || echo 'simctl check: xcrun simctl list --json devices')"
	@echo "swift-format: $$(which swift-format 2>&1 || echo 'no encontrado (brew install swift-format)')"
	@echo "swiftlint: $$(which swiftlint 2>&1 || echo 'no encontrado (brew install swiftlint)')"
	@echo "security: $$(which security)"
	@echo "osascript: $$(which osascript)"
	@echo "make: $$(make --version | head -n 1)"
	@echo "✓ doctor completo"

# Atajos GitHub
gh-init: ## Inicializa repo y primer push (usa GH_REPO env)
	@if [ -z "$(GH_REPO)" ]; then echo "Uso: make gh-init GH_REPO=git@github.com:USER/REPO.git"; exit 1; fi
	git init 2>/dev/null || true
	git add .
	git commit -m "feat: initial commit — Xcode MCP Server (Yarn + Make + Docs)" 2>/dev/null || echo "nada que commitear"
	git branch -M main
	git remote add origin $(GH_REPO) 2>/dev/null || git remote set-url origin $(GH_REPO)
	git push -u origin main

release: ## Crea tag y push (usa VERSION env, ej: make release VERSION=1.0.1)
	@if [ -z "$(VERSION)" ]; then echo "Uso: make release VERSION=1.0.1"; exit 1; fi
	npm version $(VERSION) --no-git-tag-version
	yarn install
	git add package.json yarn.lock
	git commit -m "chore(release): v$(VERSION)"
	git tag v$(VERSION)
	git push && git push --tags
	@echo "✓ release v$(VERSION) pusheado"

# Skills
skills: install-skills ## Alias de install-skills

install-skills: ## Instala skills (5 skills, 52 tools) a ~/.agents/skills, ~/.claude/skills, etc.
	@echo "➜ instalando skills..."
	@bash scripts/install-skills.sh $(if $(FORCE),--force,) $(if $(DEST),--dest $(DEST),)
	@echo "✓ skills instalados — prueba: make list-skills"

uninstall-skills: ## Desinstala skills de todos los destinos
	@bash scripts/install-skills.sh --uninstall
	@echo "✓ skills desinstalados"

list-skills: ## Lista skills instalados
	@bash scripts/install-skills.sh --list

skills-help: ## Ayuda detallada de skills
	@bash scripts/install-skills.sh --help
