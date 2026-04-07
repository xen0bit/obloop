FROM docker/sandbox-templates:opencode

USER root

# Install Bun and copy to a global location
RUN curl -fsSL https://bun.sh/install | bash && \
    cp /root/.bun/bin/bun /usr/local/bin/bun && \
    chmod +x /usr/local/bin/bun

USER agent

WORKDIR /home/agent/workspace/obloop

# Copy package files first for better layer caching
COPY --chown=agent:agent package.json bun.lock* ./

# Install dependencies
RUN bun install

# Copy the rest of the source code
COPY --chown=agent:agent . .

# Install obloop globally into opencode config
RUN make install

WORKDIR /home/agent/workspace
