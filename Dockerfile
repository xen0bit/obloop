FROM docker/sandbox-templates:opencode

USER root

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV GO_VERSION=1.23.6
ENV GOPATH=/home/user/go
ENV GOBIN=/home/user/go/bin
ENV BUN_INSTALL=/home/user/.bun

# Install core development tools and utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Core utilities
    coreutils findutils grep sed gawk diffutils patch \
    less file tree bc man-db \
    # Networking
    curl wget net-tools iputils-ping dnsutils netcat-openbsd socat telnet \
    openssh-client rsync ca-certificates gnupg apt-transport-https \
    # Editors
    vim nano \
    # Version control
    git \
    # Build tools
    build-essential cmake make \
    # Scripting & languages
    perl ruby-full lua5.4 \
    # Data processing
    jq xmlstarlet sqlite3 \
    # Compression
    zip unzip tar gzip bzip2 xz-utils zstd p7zip-full \
    # System
    procps htop lsof strace sysstat \
    sudo tmux screen xxd \
    # LSP & language support
    pkg-config libssl-dev libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# Create user account with sudo access
RUN useradd -m -s /bin/bash user && \
    echo 'user ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# Install Node.js (LTS)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install Go
RUN wget -q https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz -O /tmp/go.tar.gz && \
    tar -C /usr/local -xzf /tmp/go.tar.gz && \
    rm /tmp/go.tar.gz && \
    chown -R user:user /usr/local/go

# Install clancy
USER user
RUN go install github.com/eduardolat/clancy/cmd/clancy@latest
USER root

# Install Bun for user
USER user
RUN curl -fsSL https://bun.sh/install | bash

# Install global npm packages for LSP and development
USER root
RUN npm install -g \
    typescript \
    ts-node \
    yarn \
    eslint \
    prettier \
    @astrojs/language-server \
    bash-language-server \
    vscode-langservers-extracted \
    yaml-language-server \
    dockerfile-language-server-nodejs

# Install Python and uv
USER user
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Java for JDTLS (Java LSP)
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-21-jdk-headless \
    && rm -rf /var/lib/apt/lists/*

# Install Rust for rust-analyzer
USER user
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# Install additional LSP servers
USER root
RUN apt-get update && apt-get install -y --no-install-recommends php-cli php-mbstring php-xml && \
    rm -rf /var/lib/apt/lists/* && \
    curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

# Install Lua Language Server
USER root
RUN curl -sL https://github.com/LuaLS/lua-language-server/releases/download/3.18.0/lua-language-server-3.18.0-linux-x64.tar.gz | \
    tar -xzf - -C /usr/local

# Install markdown language server
USER root
RUN npm install -g markdownlint-cli markdownlint-cli2

# Set up paths
ENV PATH="/home/user/.local/bin:/home/user/.bun/bin:/home/user/go/bin:/usr/local/go/bin:$PATH"

# Obloop configuration via environment variables (optional - override defaults)
# ENV OBLOOP_AGENTS="backward,forward"
# ENV OBLOOP_PROMPT="Execute your current task."
# ENV OBLOOP_MAX_STEPS="100"
# ENV OBLOOP_TIMEOUT="60m"
# ENV OBLOOP_STOP_PHRASE="<promise>DONE</promise>"
# ENV OBLOOP_STOP_MODE="suffix"
# ENV OBLOOP_DELAY="5s"

# Copy obloop source
WORKDIR /home/user/workspace/obloop
COPY --chown=user:user package.json bun.lock* ./

# Fix ownership so user can write to the workspace
RUN chown -R user:user /home/user

# Install obloop dependencies
USER user
RUN bun install

# Copy the rest of obloop
COPY --chown=user:user . .

# Install obloop globally
USER root
RUN cd /home/user/workspace/obloop && \
    bun install && \
    mkdir -p /home/user/.config/opencode/plugins/obloop && \
    cp -r /home/user/workspace/obloop/src /home/user/.config/opencode/plugins/obloop/ && \
    printf 'export { default } from "./obloop/src/obloop.js"\n' > /home/user/.config/opencode/plugins/obloop.ts && \
    mkdir -p /home/user/.config/opencode/agents && \
    cp /home/user/workspace/obloop/.opencode/agents/*.md /home/user/.config/opencode/agents/ && \
    mkdir -p /home/user/.config/opencode/skills/obloop /home/user/.config/opencode/skills/obloop-ack && \
    cp /home/user/workspace/obloop/.opencode/skills/obloop/SKILL.md /home/user/.config/opencode/skills/obloop/ && \
    cp /home/user/workspace/obloop/.opencode/skills/obloop-ack/SKILL.md /home/user/.config/opencode/skills/obloop-ack/ && \
    chown -R user:user /home/user/.config/opencode

# Set up workspace
WORKDIR /home/user/workspace

# Enable bash history and source rust/cargo env
RUN echo 'export HISTFILE=~/.bash_history' >> /home/user/.bashrc && \
    echo 'export HISTSIZE=-1' >> /home/user/.bashrc && \
    echo 'export HISTFILESIZE=-1' >> /home/user/.bashrc && \
    echo 'export PATH="/home/user/.local/bin:/home/user/.bun/bin:/home/user/go/bin:/usr/local/go/bin:/home/user/.cargo/bin:$PATH"' >> /home/user/.bashrc && \
    echo 'source /home/user/.cargo/env 2>/dev/null || true' >> /home/user/.bashrc && \
    chown user:user /home/user/.bashrc

USER user

# Default command
CMD ["/bin/bash"]
