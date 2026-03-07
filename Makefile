# obloop Makefile — OS-detected paths, make / install / uninstall
# On Windows, run from Git Bash or WSL for best compatibility (uses sh + cp/rm).

# OS detection (Linux, Darwin/macOS, Windows_NT)
UNAME_S := $(shell uname -s 2>/dev/null || echo Unknown)
ifeq ($(OS),Windows_NT)
  DETECTED_OS := Windows
else ifeq ($(UNAME_S),Linux)
  DETECTED_OS := Linux
else ifeq ($(UNAME_S),Darwin)
  DETECTED_OS := Darwin
else
  DETECTED_OS := Unknown
endif

# OpenCode config dir by OS
# Linux/Darwin: ~/.config/opencode  |  Windows: %APPDATA%\opencode
ifeq ($(DETECTED_OS),Windows)
  OPENCODE_HOME ?= $(USERPROFILE)/AppData/Roaming/opencode
else
  OPENCODE_HOME ?= $(HOME)/.config/opencode
endif

PLUGINS_DIR := $(OPENCODE_HOME)/plugins
SKILLS_DIR  := $(OPENCODE_HOME)/skills
# Install entry point at top level (OpenCode only auto-loads files directly in plugins/)
INSTALL_ENTRY := $(PLUGINS_DIR)/obloop.ts
INSTALL_SRC   := $(PLUGINS_DIR)/src

.PHONY: all install uninstall help

# Default: run typecheck
all:
	bun run typecheck

help:
	@echo "obloop Makefile (detected OS: $(DETECTED_OS), OPENCODE_HOME: $(OPENCODE_HOME))"
	@echo ""
	@echo "  make          Run typecheck"
	@echo "  make install  Install plugin (obloop.ts + src/) and skills into $(PLUGINS_DIR) and $(SKILLS_DIR)"
	@echo "  make uninstall Remove installed plugin and skills"

install: install-plugin install-skills
	@echo "Installed obloop to $(PLUGINS_DIR) (obloop.ts + src/) and skills to $(SKILLS_DIR)"

install-plugin:
	@mkdir -p "$(PLUGINS_DIR)" "$(INSTALL_SRC)"
	@cp -f obloop.ts "$(INSTALL_ENTRY)"
	@cp -f src/*.ts "$(INSTALL_SRC)/"
	@echo "Plugin entry: $(INSTALL_ENTRY) (OpenCode loads files directly in plugins/)"
	@if [ -f package.json ]; then cp -f package.json "$(PLUGINS_DIR)/obloop-package.json"; fi

install-skills:
	@mkdir -p "$(SKILLS_DIR)"
	@cp -R .opencode/skills/obloop .opencode/skills/obloop-ack "$(SKILLS_DIR)/" 2>/dev/null || true
	@echo "Skills copied to $(SKILLS_DIR)"

uninstall: uninstall-plugin uninstall-skills
	@echo "Uninstalled obloop"

uninstall-plugin:
	@rm -f "$(INSTALL_ENTRY)"
	@rm -rf "$(INSTALL_SRC)"
	@rm -f "$(PLUGINS_DIR)/obloop-package.json"
	@echo "Removed $(INSTALL_ENTRY) and $(INSTALL_SRC)"

uninstall-skills:
	@rm -rf "$(SKILLS_DIR)/obloop" "$(SKILLS_DIR)/obloop-ack"
	@echo "Removed obloop skills from $(SKILLS_DIR)"
