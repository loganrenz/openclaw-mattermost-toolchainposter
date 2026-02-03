/**
 * Mattermost client supporting both webhooks and REST API
 */
import type { MattermostClientOptions } from './types.js';
export interface MattermostPayload {
    text: string;
    channel?: string;
    username?: string;
    icon_url?: string;
    icon_emoji?: string;
}
export declare class MattermostClient {
    private webhookUrl?;
    private baseUrl?;
    private botToken?;
    private defaultChannel?;
    private username?;
    private iconUrl?;
    private iconEmoji?;
    private dmChannelCache;
    constructor(options: MattermostClientOptions);
    /**
     * Get or create a direct message channel with a user
     * @param userId - The Mattermost user ID
     * @returns The DM channel ID
     */
    getDmChannel(userId: string): Promise<string>;
    /**
     * Post a message using Mattermost REST API (for DMs and channels)
     * @param channelId - The channel ID to post to
     * @param text - The message text (supports markdown)
     * @returns The post ID if available
     */
    postToChannel(channelId: string, text: string): Promise<string | undefined>;
    /**
     * Post a message to a DM with a user
     * @param userId - The Mattermost user ID
     * @param text - The message text
     */
    postToDm(userId: string, text: string): Promise<string | undefined>;
    /**
     * Post a message using incoming webhook (for fixed channels only)
     * @param text - The message text (supports markdown)
     * @param channel - Optional channel override
     * @returns The post ID if available
     */
    postToWebhook(text: string, channel?: string): Promise<string | undefined>;
    /**
     * Post a message - uses REST API if channelId provided, otherwise webhook
     * @param text - The message text
     * @param channelId - Optional channel ID for REST API posting
     */
    post(text: string, channelId?: string): Promise<string | undefined>;
    /**
     * Check if REST API is configured
     */
    hasRestApi(): boolean;
}
//# sourceMappingURL=mattermost.d.ts.map