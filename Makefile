UNAME := $(shell uname -s)

ifeq ($(UNAME),Darwin)
  GLOBAL_DIR := $(HOME)/.config/opencode
else ifeq ($(UNAME),Linux)
  GLOBAL_DIR := $(HOME)/.config/opencode
else
  GLOBAL_DIR := $(APPDATA)/opencode
endif

REPO_ROOT  := $(CURDIR)
LOCAL_DIR  := $(REPO_ROOT)/.opencode

# Docker/runtime detection
RUNTIME := $(shell if command -v podman >/dev/null 2>&1; then echo podman; elif command -v docker >/dev/null 2>&1; then echo docker; else echo ""; fi)
IMAGE_NAME := obloop:latest
CONTAINER_NAME := obloop

.PHONY: all setup build test install uninstall clean docker-build docker-run docker-clean

all: setup

# ---------------------------------------------------------------------------
# Dependency installation
# ---------------------------------------------------------------------------

node_modules: package.json
	bun install
	@touch node_modules

# ---------------------------------------------------------------------------
# Build / type-check
# ---------------------------------------------------------------------------

build: node_modules
	bun run typecheck

# ---------------------------------------------------------------------------
# Test (type-check is the full static verification available)
# ---------------------------------------------------------------------------

test: build

# ---------------------------------------------------------------------------
# Local setup – makes `opencode` in this repo use the plugin + agents
#
# OpenCode scans plugins/*.{ts,js} (flat files only, not subdirectories).
# We symlink plugin.ts directly as obloop.ts so Bun resolves its relative
# imports from the actual file location (the repo root).
#
# - .opencode/agents/  already present in the repo (backward.md, forward.md)
# - .opencode/skills/  already present in the repo (obloop, obloop-ack)
# - .opencode/plugins/obloop.ts  → symlink to repo root plugin.ts
# ---------------------------------------------------------------------------

setup: node_modules
	@mkdir -p $(LOCAL_DIR)/plugins
	@if [ -L "$(LOCAL_DIR)/plugins/obloop.ts" ]; then \
		echo "plugin symlink already exists, skipping"; \
	elif [ -e "$(LOCAL_DIR)/plugins/obloop.ts" ]; then \
		echo "ERROR: $(LOCAL_DIR)/plugins/obloop.ts exists and is not a symlink – remove it first" >&2; exit 1; \
	else \
		ln -s $(REPO_ROOT)/plugin.ts $(LOCAL_DIR)/plugins/obloop.ts; \
		echo "Created $(LOCAL_DIR)/plugins/obloop.ts -> $(REPO_ROOT)/plugin.ts"; \
	fi
	@# Clean up any old directory-style symlink from previous installs
	@if [ -L "$(LOCAL_DIR)/plugins/obloop" ] || [ -d "$(LOCAL_DIR)/plugins/obloop" ]; then \
		rm -rf "$(LOCAL_DIR)/plugins/obloop"; \
		echo "Removed old directory-style plugin link"; \
	fi
	@echo "Local setup complete. Run 'opencode' in this directory to use obloop."

# ---------------------------------------------------------------------------
# Global install – copies plugin source + entry file to the OS config dir
#
# OpenCode scans plugins/*.{ts,js}. We install:
#   plugins/obloop.ts        – entry file (re-exports from ./obloop/src/plugin.js)
#   plugins/obloop/src/      – source files (no node_modules needed; no runtime deps)
# ---------------------------------------------------------------------------

PLUGIN_SRC_DEST := $(GLOBAL_DIR)/plugins/obloop
PLUGIN_ENTRY    := $(GLOBAL_DIR)/plugins/obloop.ts
AGENTS_DEST     := $(GLOBAL_DIR)/agents
SKILLS_DEST     := $(GLOBAL_DIR)/skills

install: node_modules
	@echo "Installing to $(GLOBAL_DIR) ..."
	@# Plugin source – remove and re-copy so stale files don't accumulate
	@rm -rf $(PLUGIN_SRC_DEST)
	@mkdir -p $(PLUGIN_SRC_DEST)
	@cp -r $(REPO_ROOT)/src $(PLUGIN_SRC_DEST)/
	@# Entry file – re-exports from the source directory
	@printf 'export { default } from "./obloop/src/plugin.js"\n' > $(PLUGIN_ENTRY)
	@echo "  plugin  -> $(PLUGIN_SRC_DEST)/ + $(PLUGIN_ENTRY)"
	@# Agents – merge into shared directory, overwrite our files only
	@mkdir -p $(AGENTS_DEST)
	@cp $(LOCAL_DIR)/agents/backward.md $(AGENTS_DEST)/
	@cp $(LOCAL_DIR)/agents/forward.md  $(AGENTS_DEST)/
	@echo "  agents  -> $(AGENTS_DEST)"
	@# Skills – merge into shared directory, overwrite our subdirs only
	@mkdir -p $(SKILLS_DEST)/obloop $(SKILLS_DEST)/obloop-ack
	@cp $(LOCAL_DIR)/skills/obloop/SKILL.md     $(SKILLS_DEST)/obloop/
	@cp $(LOCAL_DIR)/skills/obloop-ack/SKILL.md $(SKILLS_DEST)/obloop-ack/
	@echo "  skills  -> $(SKILLS_DEST)"
	@echo "Global install complete."

# ---------------------------------------------------------------------------
# Global uninstall – removes only what install placed; leaves everything else
# ---------------------------------------------------------------------------

uninstall:
	@echo "Uninstalling from $(GLOBAL_DIR) ..."
	@rm -rf  $(PLUGIN_SRC_DEST)
	@rm -f   $(PLUGIN_ENTRY)
	@echo "  removed $(PLUGIN_SRC_DEST) and $(PLUGIN_ENTRY)"
	@rm -f   $(AGENTS_DEST)/backward.md $(AGENTS_DEST)/forward.md
	@echo "  removed agents from $(AGENTS_DEST)"
	@rm -rf  $(SKILLS_DEST)/obloop $(SKILLS_DEST)/obloop-ack
	@echo "  removed skills from $(SKILLS_DEST)"
	@echo "Global uninstall complete."

# ---------------------------------------------------------------------------
# Clean – removes the local plugin symlink (agents/skills stay; they're
# tracked in the repo under .opencode/)
# ---------------------------------------------------------------------------

clean:
	@rm -f $(LOCAL_DIR)/plugins/obloop.ts
	@echo "Removed local plugin symlink."

# ---------------------------------------------------------------------------
# Docker targets – uses podman if available, falls back to docker
# ---------------------------------------------------------------------------

docker-build:
ifeq ($(RUNTIME),)
	@echo "ERROR: Neither podman nor docker found" >&2; exit 1
else
	@echo "Using $(RUNTIME) to build $(IMAGE_NAME)..."
	$(RUNTIME) build -t $(IMAGE_NAME) .
	@echo "Build complete: $(IMAGE_NAME)"
endif

docker-run:
ifeq ($(RUNTIME),)
	@echo "ERROR: Neither podman nor docker found" >&2; exit 1
else
	@echo "Running $(IMAGE_NAME) with $(RUNTIME)..."
	$(RUNTIME) run -it --rm $(IMAGE_NAME)
endif

docker-clean:
ifeq ($(RUNTIME),)
	@echo "ERROR: Neither podman nor docker found" >&2; exit 1
else
	@echo "Removing $(IMAGE_NAME) with $(RUNTIME)..."
	$(RUNTIME) rmi $(IMAGE_NAME) 2>/dev/null || $(RUNTIME) image rm $(IMAGE_NAME) 2>/dev/null || true
	@echo "Image removed."
endif
