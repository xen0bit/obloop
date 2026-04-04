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

.PHONY: all setup build test install uninstall clean

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
# - .opencode/agents/  already present in the repo (chaos.md, developer.md)
# - .opencode/skills/  already present in the repo (obloop, obloop-ack)
# - .opencode/plugins/obloop  → symlink to repo root so edits are live
# ---------------------------------------------------------------------------

setup: node_modules
	@mkdir -p $(LOCAL_DIR)/plugins
	@if [ -L "$(LOCAL_DIR)/plugins/obloop" ]; then \
		echo "plugin symlink already exists, skipping"; \
	elif [ -e "$(LOCAL_DIR)/plugins/obloop" ]; then \
		echo "ERROR: $(LOCAL_DIR)/plugins/obloop exists and is not a symlink – remove it first" >&2; exit 1; \
	else \
		ln -s $(REPO_ROOT) $(LOCAL_DIR)/plugins/obloop; \
		echo "Created $(LOCAL_DIR)/plugins/obloop -> $(REPO_ROOT)"; \
	fi
	@echo "Local setup complete. Run 'opencode' in this directory to use obloop."

# ---------------------------------------------------------------------------
# Global install – copies plugin, agents, and skills to the OS config dir
# ---------------------------------------------------------------------------

PLUGIN_DEST := $(GLOBAL_DIR)/plugins/obloop
AGENTS_DEST := $(GLOBAL_DIR)/agents
SKILLS_DEST := $(GLOBAL_DIR)/skills

install: node_modules
	@echo "Installing to $(GLOBAL_DIR) ..."
	@# Plugin – remove and re-copy so stale source files don't accumulate
	@rm -rf $(PLUGIN_DEST)
	@mkdir -p $(PLUGIN_DEST)
	@cp -r $(REPO_ROOT)/src          $(PLUGIN_DEST)/
	@cp    $(REPO_ROOT)/plugin.ts    $(PLUGIN_DEST)/
	@cp    $(REPO_ROOT)/package.json $(PLUGIN_DEST)/
	@cp    $(REPO_ROOT)/tsconfig.json $(PLUGIN_DEST)/
	@cd $(PLUGIN_DEST) && bun install --frozen-lockfile 2>/dev/null || bun install
	@echo "  plugin  -> $(PLUGIN_DEST)"
	@# Agents – merge into shared directory, overwrite our files only
	@mkdir -p $(AGENTS_DEST)
	@cp $(LOCAL_DIR)/agents/chaos.md     $(AGENTS_DEST)/
	@cp $(LOCAL_DIR)/agents/developer.md $(AGENTS_DEST)/
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
	@rm -rf  $(PLUGIN_DEST)
	@echo "  removed $(PLUGIN_DEST)"
	@rm -f   $(AGENTS_DEST)/chaos.md $(AGENTS_DEST)/developer.md
	@echo "  removed agents from $(AGENTS_DEST)"
	@rm -rf  $(SKILLS_DEST)/obloop $(SKILLS_DEST)/obloop-ack
	@echo "  removed skills from $(SKILLS_DEST)"
	@echo "Global uninstall complete."

# ---------------------------------------------------------------------------
# Clean – removes the local plugin symlink (agents/skills stay; they're
# tracked in the repo under .opencode/)
# ---------------------------------------------------------------------------

clean:
	@rm -f $(LOCAL_DIR)/plugins/obloop
	@echo "Removed local plugin symlink."
