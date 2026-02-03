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

export class MattermostClient {
  private webhookUrl?: string;
  private baseUrl?: string;
  private botToken?: string;
  private defaultChannel?: string;
  private username?: string;
  private iconUrl?: string;
  private iconEmoji?: string;

  // Cache for DM channel lookups
  private dmChannelCache = new Map<string, string>();

  constructor(options: MattermostClientOptions) {
    this.webhookUrl = options.webhookUrl;
    this.baseUrl = options.baseUrl;
    this.botToken = options.botToken;
    this.defaultChannel = options.channel;
    this.username = options.username;
    this.iconUrl = options.iconUrl;
    this.iconEmoji = options.iconEmoji;
  }

  /**
   * Get or create a direct message channel with a user
   * @param userId - The Mattermost user ID
   * @returns The DM channel ID
   */
  async getDmChannel(userId: string): Promise<string> {
    // Check cache first
    const cached = this.dmChannelCache.get(userId);
    if (cached) {
      return cached;
    }

    if (!this.baseUrl || !this.botToken) {
      throw new Error('REST API requires baseUrl and botToken');
    }

    // First, get the bot's user ID
    const meResponse = await fetch(`${this.baseUrl}/api/v4/users/me`, {
      headers: {
        'Authorization': `Bearer ${this.botToken}`,
      },
    });

    if (!meResponse.ok) {
      throw new Error(`Failed to get bot user: ${meResponse.status}`);
    }

    const me = await meResponse.json() as { id: string };

    // Create or get the DM channel
    const channelResponse = await fetch(`${this.baseUrl}/api/v4/channels/direct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.botToken}`,
      },
      body: JSON.stringify([me.id, userId]),
    });

    if (!channelResponse.ok) {
      const errorText = await channelResponse.text().catch(() => 'Unknown error');
      throw new Error(`Failed to get DM channel: ${channelResponse.status} ${errorText}`);
    }

    const channel = await channelResponse.json() as { id: string };
    
    // Cache it
    this.dmChannelCache.set(userId, channel.id);
    
    return channel.id;
  }

  /**
   * Post a message using Mattermost REST API (for DMs and channels)
   * @param channelId - The channel ID to post to
   * @param text - The message text (supports markdown)
   * @returns The post ID if available
   */
  async postToChannel(channelId: string, text: string): Promise<string | undefined> {
    if (!this.baseUrl || !this.botToken) {
      throw new Error('REST API requires baseUrl and botToken');
    }

    const payload = {
      channel_id: channelId,
      message: text,
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/v4/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.botToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Mattermost API failed: ${response.status} ${errorText}`);
      }

      const result = await response.json() as { id?: string };
      return result.id;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Mattermost API failed: ${String(error)}`);
    }
  }

  /**
   * Post a message to a DM with a user
   * @param userId - The Mattermost user ID
   * @param text - The message text
   */
  async postToDm(userId: string, text: string): Promise<string | undefined> {
    const channelId = await this.getDmChannel(userId);
    return this.postToChannel(channelId, text);
  }

  /**
   * Post a message using incoming webhook (for fixed channels only)
   * @param text - The message text (supports markdown)
   * @param channel - Optional channel override
   * @returns The post ID if available
   */
  async postToWebhook(text: string, channel?: string): Promise<string | undefined> {
    if (!this.webhookUrl) {
      throw new Error('Webhook posting requires webhookUrl');
    }

    const payload: MattermostPayload = {
      text,
    };

    // Add optional fields
    const targetChannel = channel ?? this.defaultChannel;
    if (targetChannel) {
      payload.channel = targetChannel;
    }

    if (this.username) {
      payload.username = this.username;
    }

    if (this.iconUrl) {
      payload.icon_url = this.iconUrl;
    } else if (this.iconEmoji) {
      payload.icon_emoji = this.iconEmoji;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Mattermost webhook failed: ${response.status} ${errorText}`);
      }

      // Mattermost webhooks return "ok" on success, not a post ID
      return undefined;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Mattermost webhook failed: ${String(error)}`);
    }
  }

  /**
   * Post a message - uses REST API if channelId provided, otherwise webhook
   * @param text - The message text
   * @param channelId - Optional channel ID for REST API posting
   */
  async post(text: string, channelId?: string): Promise<string | undefined> {
    if (channelId && this.baseUrl && this.botToken) {
      return this.postToChannel(channelId, text);
    }
    return this.postToWebhook(text);
  }

  /**
   * Check if REST API is configured
   */
  hasRestApi(): boolean {
    return !!(this.baseUrl && this.botToken);
  }
}
