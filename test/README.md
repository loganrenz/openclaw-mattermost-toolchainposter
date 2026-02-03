# OpenClaw Test Environment

This directory contains configuration for testing the Mattermost Toolchain Poster plugin with an existing OpenClaw gateway.

## Setup

1. **Copy config to OpenClaw config directory:**

   ```bash
   cp config.yaml ~/.openclaw/config.yaml
   ```

2. **Install the Mattermost plugin:**

   ```bash
   openclaw plugins install @openclaw/mattermost
   openclaw plugins enable mattermost
   ```

3. **Install our toolchain poster plugin:**

   ```bash
   cd /Users/narduk/code/openclaw-mattermost-toolchainposter
   openclaw plugins install -l ./
   openclaw plugins enable mattermost-toolchain-poster
   ```

4. **Restart the gateway:**
   ```bash
   openclaw gateway restart
   ```

## Configuration

- **Gateway endpoint:** claw.home.nard.uk
- **Mattermost bot:** phantom (token: u391m7kggb85ug4wo691hx7rww)
- **DM policy:** open (anyone can talk to the bot)
- **Chat mode:** oncall (responds to @mentions in channels)
