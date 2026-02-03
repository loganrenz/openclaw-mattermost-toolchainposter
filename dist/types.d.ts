/**
 * Plugin configuration types
 */
export interface PluginConfig {
    /** Mattermost incoming webhook URL (optional if using REST API) */
    webhookUrl?: string;
    /** Mattermost server base URL for REST API (e.g., https://mattermost.example.com) */
    baseUrl?: string;
    /** Bot token for REST API authentication */
    botToken?: string;
    /** Override channel (e.g., #agent-tools). Uses webhook default if not set. */
    channel?: string;
    /** Display name for bot posts */
    username?: string;
    /** Avatar URL for bot posts */
    iconUrl?: string;
    /** Emoji icon for bot posts (alternative to iconUrl) */
    iconEmoji?: string;
    /** Post tool results after execution completes (default: true) */
    includeResults?: boolean;
    /** Maximum characters for tool result output (default: 2000) */
    truncateResultsAt?: number;
    /** Maximum lines for tool result output (default: 20) */
    maxLines?: number;
    /** Tool names to exclude from posting */
    excludeTools?: string[];
    /** Post to original conversation channel when available (default: true with REST API) */
    postToConversation?: boolean;
    /** Enable /halt and /unhalt commands to interrupt agent (default: false) */
    enableHaltCommands?: boolean;
}
export interface MattermostPayload {
    text: string;
    channel?: string;
    username?: string;
    icon_url?: string;
    icon_emoji?: string;
}
export interface MattermostClientOptions {
    webhookUrl?: string;
    baseUrl?: string;
    botToken?: string;
    channel?: string;
    username?: string;
    iconUrl?: string;
    iconEmoji?: string;
}
//# sourceMappingURL=types.d.ts.map