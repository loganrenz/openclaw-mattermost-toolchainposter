# OpenClaw Mattermost Toolchain Poster

An OpenClaw plugin that posts tool call information to Mattermost, providing visibility into agent tool usage directly in chat.

## Features

- 📡 **Real-time Tool Call Visibility** - See tool calls and results as they happen
- 💬 **DM Integration** - Posts directly to the conversation DM (with REST API)
- 🔧 **Webhook Fallback** - Works with simple incoming webhooks too
- ⚙️ **Configurable** - Exclude specific tools, customize formatting
- 🛑 **Optional Halt Commands** - Enable `/halt` and `/unhalt` to interrupt agent execution

## Installation

```bash
openclaw plugin install github:narduk/openclaw-mattermost-toolchainposter
```

Or manually:

```bash
git clone https://github.com/narduk/openclaw-mattermost-toolchainposter.git
cd openclaw-mattermost-toolchainposter
npm install && npm run build
openclaw plugin install .
```

## Configuration

Add to your `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "openclaw-mattermost-toolchain-poster": {
        "enabled": true
      }
    }
  }
}
```

### Environment Variables

| Variable                 | Description                                                         |
| ------------------------ | ------------------------------------------------------------------- |
| `MATTERMOST_URL`         | Mattermost server base URL (e.g., `https://mattermost.example.com`) |
| `MATTERMOST_BOT_TOKEN`   | Bot token or Personal Access Token with `create_post` permission    |
| `MATTERMOST_WEBHOOK_URL` | (Optional) Incoming webhook URL as fallback                         |

### Plugin Options

| Option               | Type     | Default          | Description                           |
| -------------------- | -------- | ---------------- | ------------------------------------- |
| `webhookUrl`         | string   | -                | Mattermost webhook URL                |
| `baseUrl`            | string   | -                | Mattermost server URL for REST API    |
| `botToken`           | string   | -                | Bot token for REST API                |
| `channel`            | string   | -                | Override channel for webhook posts    |
| `username`           | string   | `OpenClaw Agent` | Bot display name                      |
| `iconEmoji`          | string   | `:robot:`        | Bot icon emoji                        |
| `includeResults`     | boolean  | `true`           | Post tool results after execution     |
| `truncateResultsAt`  | number   | `2000`           | Max characters for results            |
| `excludeTools`       | string[] | `['message']`    | Tools to exclude from posting         |
| `postToConversation` | boolean  | `true`           | Post to DM when using REST API        |
| `enableHaltCommands` | boolean  | `false`          | Enable `/halt` and `/unhalt` commands |

## Halt Commands (Optional)

When `enableHaltCommands` is `true`:

- `/halt` - Stop the agent from executing further tool calls
- `/unhalt` - Resume agent tool execution

Sending any regular message also auto-resumes the agent.

## License

MIT
