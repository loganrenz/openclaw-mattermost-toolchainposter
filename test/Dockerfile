# OpenClaw with Mattermost Toolchain Poster Plugin
FROM node:22-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install OpenClaw CLI globally (requires Node >= 22)
RUN npm install -g openclaw@latest

# Create app directory
WORKDIR /app

# Create OpenClaw config directory
RUN mkdir -p /root/.openclaw

# Copy config from test directory
COPY test/config.yaml /root/.openclaw/config.yaml

# Install Mattermost plugin
RUN openclaw plugins install @openclaw/mattermost || true

# Copy plugin files from parent context
COPY dist /app/plugins/mattermost-toolchain-poster/dist
COPY openclaw.plugin.json /app/plugins/mattermost-toolchain-poster/
COPY package.json /app/plugins/mattermost-toolchain-poster/

# Install the local plugin
RUN openclaw plugins install -l /app/plugins/mattermost-toolchain-poster || true
RUN openclaw plugins enable mattermost-toolchain-poster || true

# Expose gateway port
EXPOSE 18789

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:18789/health || exit 1

# Start the gateway
CMD ["openclaw", "gateway", "--port", "18789", "--verbose", "--allow-unconfigured"]

