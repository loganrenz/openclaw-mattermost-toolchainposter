/**
 * Mattermost Toolchain Poster - OpenClaw Plugin
 *
 * Posts tool call information to the conversation channel, providing 
 * visibility into agent tool usage directly in the chat.
 */

import type { PluginConfig } from './types.js';
import { MattermostClient } from './mattermost.js';
import { formatToolCall, formatToolResult } from './formatters.js';

const PLUGIN_VERSION = '1.3.14';

// Store for correlating before/after calls
const pendingCalls = new Map<string, { postId?: string; toolName: string; startTime: number }>();

// Track sender IDs per session/account to prevent crosstalk
// Key: identifier (sessionKey or accountName), Value: { senderId, timestamp }
const sessionSenders = new Map<string, { senderId: string; timestamp: number }>();

// Track sessions that have been stopped via /stop command
const stoppedSessions = new Set<string>();

// Event types for tool calls
interface BeforeToolCallEvent {
  toolName: string;
  params: Record<string, unknown>;
}

// tool_result_persist event structure
interface ToolResultPersistEvent {
  toolName: string;
  toolCallId: string;
  message: {
    role: string;
    content: Array<{ type: string; text: string }>;
    details?: {
      status?: string;
      exitCode?: number;
      durationMs?: number;
      aggregated?: string;
    };
    isError?: boolean;
  };
  isSynthetic?: boolean;
}

interface ToolContext {
  agentId?: string;
  sessionKey?: string;
  conversationId?: string;
  agentName?: string;
  toolName: string;
}

// Plugin command types
interface PluginCommandContext {
  senderId?: string;
  channel: string;
  args?: string;
}

interface PluginCommand {
  name: string;
  description: string;
  acceptsArgs?: boolean;
  requireAuth?: boolean;
  handler: (ctx: PluginCommandContext) => { text: string } | Promise<{ text: string }>;
}

export interface PluginApi {
  config: PluginConfig;
  on(event: string, handler: (...args: unknown[]) => unknown): void;
  registerCommand?: (command: PluginCommand) => void;
}

// Define the plugin as an object with id, name, configSchema, and register method
const plugin = {
  id: 'openclaw-mattermost-toolchain-poster',
  name: 'Mattermost Toolchain Poster',
  
  configSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      webhookUrl: {
        type: 'string',
        description: 'Mattermost incoming webhook URL (fallback if REST API not configured)',
      },
      baseUrl: {
        type: 'string',
        description: 'Mattermost server base URL for REST API (e.g., https://mattermost.example.com)',
      },
      botToken: {
        type: 'string',
        description: 'Bot token for REST API authentication',
      },
      channel: {
        type: 'string', 
        description: 'Override channel (e.g., #agent-tools). Uses conversation channel if not set.',
      },
      username: {
        type: 'string',
        default: 'OpenClaw Agent',
        description: 'Display name for bot posts (webhook only)',
      },
      iconUrl: {
        type: 'string',
        description: 'Avatar URL for bot posts (webhook only)',
      },
      iconEmoji: {
        type: 'string',
        default: ':robot:',
        description: 'Emoji icon for bot posts (webhook only)',
      },
      includeResults: {
        type: 'boolean',
        default: true,
        description: 'Post tool results after execution completes',
      },
      truncateResultsAt: {
        type: 'number',
        default: 2000,
        description: 'Maximum characters for tool result output',
      },
      excludeTools: {
        type: 'array',
        items: { type: 'string' },
        default: ['message'],
        description: 'Tool names to exclude from posting (message excluded by default)',
      },
      postToConversation: {
        type: 'boolean',
        default: true,
        description: 'Post to originating conversation DM (requires REST API)',
      },
      enableHaltCommands: {
        type: 'boolean',
        default: false,
        description: 'Enable /halt and /unhalt commands to interrupt agent',
      },
    },
    required: [],
  },

  register(api: PluginApi) {
    console.debug('[mattermost-toolchain-poster] === PLUGIN REGISTER START ===');
    
    // OpenClaw passes the entire config object - navigate to our plugin's config
    const fullConfig = api.config as Record<string, unknown>;
    
    // Debug: log what we received
    console.debug('[mattermost-toolchain-poster] Full config keys:', Object.keys(fullConfig || {}));
    console.debug('[mattermost-toolchain-poster] channels:', JSON.stringify((fullConfig as Record<string, unknown>).channels));
    
    // Navigate to plugins.entries['openclaw-mattermost-toolchain-poster'].config
    const pluginsSection = fullConfig.plugins as { entries?: Record<string, { config?: PluginConfig }> } | undefined;
    const pluginEntry = pluginsSection?.entries?.['openclaw-mattermost-toolchain-poster'];
    const pluginConfig = pluginEntry?.config ?? {} as PluginConfig;
    
    // Get Mattermost channel config - store ALL accounts for multi-bot support
    type MattermostAccount = { botToken?: string; baseUrl?: string; name?: string };
    type MattermostChannelConfig = { 
      accounts?: Record<string, MattermostAccount>;
      url?: string;
    };
    const mattermostChannel = (fullConfig.channels as { mattermost?: MattermostChannelConfig })?.mattermost;
    console.debug('[mattermost-toolchain-poster] mattermostChannel accounts:', mattermostChannel?.accounts ? Object.keys(mattermostChannel.accounts) : 'none');
    
    // Store all accounts keyed by account name (e.g., "default", "phantombot", etc.)
    const botAccounts = new Map<string, { token: string; url?: string }>();
    let defaultBaseUrl = mattermostChannel?.url || pluginConfig.baseUrl || process.env.MATTERMOST_URL;
    
    if (mattermostChannel?.accounts) {
      for (const [accountName, account] of Object.entries(mattermostChannel.accounts)) {
        if (account?.botToken) {
          botAccounts.set(accountName, {
            token: account.botToken,
            url: account.baseUrl || defaultBaseUrl,
          });
          // Also store by name if available (for matching against agent)
          if (account.name) {
            botAccounts.set(account.name, {
              token: account.botToken,
              url: account.baseUrl || defaultBaseUrl,
            });
          }
        }
      }
    }
    
    // Also add from plugin config / env as fallback with key "default"
    const envToken = pluginConfig.botToken || process.env.MATTERMOST_BOT_TOKEN;
    if (envToken) {
      botAccounts.set('default', {
        token: envToken,
        url: defaultBaseUrl,
      });
    }
    
    const webhookUrl = pluginConfig.webhookUrl || process.env.MATTERMOST_WEBHOOK_URL;
    
    console.debug('[mattermost-toolchain-poster] Bot accounts configured:', [...botAccounts.keys()]);
    console.debug('[mattermost-toolchain-poster] Default base URL:', defaultBaseUrl);
    
    // Helper to extract agent name from session key 
    // Handles both formats: "agent:ops:main" -> "ops" and "session:agent:ops:main" -> "ops"
    const extractAgentFromSessionKey = (sessionKey?: string): string | undefined => {
      if (!sessionKey) return undefined;
      // Try pattern: agent:AGENT_NAME:... (most common)
      let match = sessionKey.match(/^agent:([^:]+)/);
      if (match) return match[1];
      // Try pattern: session:agent:AGENT_NAME:... (fallback)
      match = sessionKey.match(/^session:agent:([^:]+)/);
      return match?.[1];
    };
    
    // Helper to get the right client for a given agent/context
    const getClient = (sessionKey?: string): { client: MattermostClient | null, accountName: string } => {
      // Extract agent name from session key
      const agentId = extractAgentFromSessionKey(sessionKey);
      
      // Try to find account matching the agent
      let account = agentId ? botAccounts.get(agentId) : undefined;
      let selectedAccountName = agentId || 'unknown';
      
      // Fallback to 'default' account
      if (!account) {
        account = botAccounts.get('default') || [...botAccounts.values()][0];
        selectedAccountName = account ? 'default' : 'none';
      }
      
      // Log which bot was selected (info level for visibility)
      console.log(`[mattermost-toolchain-poster] Bot selection: sessionKey=${sessionKey?.substring(0, 30) || 'undefined'} -> agent=${agentId || 'none'} -> account=${selectedAccountName}`);
      
      if (!account?.token && !webhookUrl) {
        return { client: null, accountName: selectedAccountName };
      }
      
      return {
        client: new MattermostClient({
          webhookUrl,
          baseUrl: account?.url || defaultBaseUrl,
          botToken: account?.token,
          channel: pluginConfig.channel,
          username: pluginConfig.username ?? 'OpenClaw Agent',
          iconEmoji: pluginConfig.iconEmoji ?? ':robot:',
          iconUrl: pluginConfig.iconUrl,
        }),
        accountName: selectedAccountName
      };
    };
    
    // Check if we have any valid configuration
    if (botAccounts.size === 0 && !webhookUrl) {
      console.warn('[mattermost-toolchain-poster] No Mattermost connection configured.');
      return;
    }
    
    console.log(`[mattermost-toolchain-poster v${PLUGIN_VERSION}] Plugin registered with`, botAccounts.size, 'bot account(s)');

    const excludedTools = new Set(pluginConfig.excludeTools ?? ['message']);
    const includeResults = pluginConfig.includeResults ?? true;
    const truncateAt = pluginConfig.truncateResultsAt ?? 2000;
    const maxLines = pluginConfig.maxLines ?? 20;
    const postToConversation = pluginConfig.postToConversation ?? true;
    const enableHaltCommands = pluginConfig.enableHaltCommands ?? false;
    let lastSessionKey: string | undefined; // Track session key for after_tool_call

    // Register /halt command if available and enabled (note: /stop is reserved by OpenClaw)
    if (enableHaltCommands && api.registerCommand) {
      api.registerCommand({
        name: 'halt',
        description: 'Halt the agent from executing further tool calls',
        acceptsArgs: false,
        requireAuth: true,
        handler: async (ctx) => {
          const sessionKey = ctx.senderId ?? 'default';
          stoppedSessions.add(sessionKey);
          console.log('[mattermost-toolchain-poster] Session halted:', sessionKey);
          
          // Also post to Mattermost
          const { client } = getClient();
          if (client?.hasRestApi() && ctx.senderId) {
            await client.postToDm(ctx.senderId, '🛑 Agent halted. Tool calls will be blocked until you send a new message.');
          }
          
          return { text: '🛑 Agent halted. Tool calls will be blocked until you send a new message.' };
        },
      });

      api.registerCommand({
        name: 'unhalt',
        description: 'Resume agent tool execution after /halt',
        acceptsArgs: false,
        requireAuth: true,
        handler: async (ctx) => {
          const sessionKey = ctx.senderId ?? 'default';
          if (stoppedSessions.has(sessionKey)) {
            stoppedSessions.delete(sessionKey);
            console.log('[mattermost-toolchain-poster] Session unhalted:', sessionKey);
            return { text: '▶️ Agent resumed. Tool calls are now enabled.' };
          }
          return { text: 'Agent is not currently halted.' };
        },
      });

      console.log('[mattermost-toolchain-poster] Registered /halt and /unhalt commands');
    }

    // Hook: message_received - capture sender ID for DM posting and clear stop state
    api.on('message_received', async (...args: unknown[]) => {
      const event = args[0] as { from: string; content: string; metadata?: Record<string, unknown> };
      const ctx = args[1] as { channelId: string; accountId: string; conversationId: string };
      
      // Get senderId and sessionKey from metadata for posting to DM
      const senderId = event.metadata?.senderId as string | undefined;
      const sessionKey = (event.metadata?.sessionKey as string | undefined) || ctx.conversationId;
      const accountId = ctx.accountId;
      const timestamp = Date.now();
      
      if (senderId) {
        const entry = { senderId, timestamp };
        
        // Map the direct session/conversation
        if (sessionKey) {
          sessionSenders.set(sessionKey, entry);
          if (!sessionKey.startsWith('agent:')) {
            sessionSenders.set(`agent:${sessionKey}`, entry);
          }
        }
        
        // Critical: Map the Agent that sent this message to this user
        // This allows tool calls using "agent:AGENT_NAME:main" to find this user
        if (accountId) {
          sessionSenders.set(accountId, entry);
          sessionSenders.set(`agent:${accountId}:main`, entry);
          console.log(`[mattermost-toolchain-poster] Linked user ${senderId} to agent/account ${accountId}`);
        }
      }
      
      // Clear halt state on new user message
      if (senderId && !event.content.startsWith('/halt') && !event.content.startsWith('/unhalt')) {
        if (stoppedSessions.has(senderId)) {
          stoppedSessions.delete(senderId);
          console.log('[mattermost-toolchain-poster] Session auto-resumed on new message');
        }
      }
    });
    console.debug('[mattermost-toolchain-poster] Registered message_received hook');

    // Hook: before_tool_call
    console.debug('[mattermost-toolchain-poster] Registering before_tool_call hook...');
    api.on('before_tool_call', async (...args: unknown[]) => {
      const event = args[0] as BeforeToolCallEvent;
      const ctx = args[1] as ToolContext;
      const { toolName, params } = event;

      // 1. Initial debug logs
      console.debug('[mattermost-toolchain-poster] === BEFORE_TOOL_CALL ===');
      console.debug('[mattermost-toolchain-poster] Tool:', toolName);
      console.debug('[mattermost-toolchain-poster] Session key:', ctx.sessionKey);
      
      // Store session key for use in after_tool_call
      lastSessionKey = ctx.sessionKey;

      // Skip excluded tools
      if (excludedTools.has(toolName)) {
        console.debug('[mattermost-toolchain-poster] Skipping excluded tool:', toolName);
        return undefined;
      }

      const message = formatToolCall(toolName, params);
      console.debug('[mattermost-toolchain-poster] Formatted message:', message.substring(0, 200));

      // 2. Select appropriate Mattermost account for this agent
      const { client, accountName } = getClient(ctx.sessionKey);
      if (!client) {
        console.warn('[mattermost-toolchain-poster] No client available for posting');
        return undefined;
      }

      // 3. Resolve sender ID for the session with strict separation for cron/subagents
      let senderId: string | undefined;

      const sessionEntry = sessionSenders.get(ctx.sessionKey ?? '');
      if (sessionEntry) {
        senderId = sessionEntry.senderId;
        console.debug('[mattermost-toolchain-poster] Resolved sender from session mapping:', senderId);
      } else {
        // Fallback to account-based lookup (who last talked to this bot account?)
        const accountEntry = sessionSenders.get(accountName);
        if (accountEntry) {
          // Only fallback if the message was received recently (within 30 mins)
          // AND it's not a subagent session (as per user request)
          const isFresh = (Date.now() - accountEntry.timestamp) < 30 * 60 * 1000;
          const isSubagent = ctx.sessionKey?.includes(':subagent:') || ctx.sessionKey?.includes(':cron:');
          
          if (isFresh && !isSubagent) {
             senderId = accountEntry.senderId;
             console.log(`[mattermost-toolchain-poster] Using fresh account sender fallback: ${senderId} for ${accountName}`);
          }
        }
      }

      // NO FALLBACK for cron jobs or subagents to prevent DM pollution as per user request.
      // If we don't have a direct user-session link, it goes to the channel.

      // 4. Check if session is stopped
      if (enableHaltCommands && senderId && stoppedSessions.has(senderId)) {
        console.log('[mattermost-toolchain-poster] Blocking tool call - session stopped:', toolName);
        return {
          block: true,
          blockReason: 'Agent interaction halted via /halt command.'
        };
      }

      const toolCallId = `${ctx.sessionKey ?? 'default'}-${toolName}-${Date.now()}`;

      try {
        let postId: string | undefined;
        // Try to post to DM if we have a resolved sender
        if (postToConversation && client.hasRestApi() && senderId) {
          console.log('[mattermost-toolchain-poster] Posting tool call to DM with user:', senderId);
          postId = await client.postToDm(senderId, message);
        } else {
          // Fall back to webhook for cron jobs, subagents, or channel contexts
          console.log('[mattermost-toolchain-poster] Posting tool call via webhook (no direct user context)');
          postId = await client.postToWebhook(message);
        }
        
        pendingCalls.set(toolCallId, {
          postId,
          toolName,
          startTime: Date.now(),
        });
      } catch (error) {
        console.error('[mattermost-toolchain-poster] Failed to post tool call:', error);
        // Try webhook as last resort fallback
        try {
          await client.postToWebhook(message);
        } catch (webhookError) {
          console.error('[mattermost-toolchain-poster] Webhook fallback also failed:', webhookError);
        }
      }
      return undefined;
    });

    // Hook: tool_result_persist (sync hook that fires after tool execution)
    // Note: after_tool_call may not be dispatched in some OpenClaw versions,
    // but tool_result_persist reliably fires after every tool execution.
    api.on('tool_result_persist', (...args: unknown[]) => {
      console.log('[mattermost-toolchain-poster] === TOOL_RESULT_PERSIST ===');
      const event = args[0] as ToolResultPersistEvent;
      const { toolName, message: msg } = event;
      
      // Extract result from the correct path in the event structure
      // Result is in message.content[0].text or message.details.aggregated
      const resultText = msg?.content?.[0]?.text || msg?.details?.aggregated || '';
      const isError = msg?.isError || false;
      const durationMs = msg?.details?.durationMs || 0;
      
      console.log('[mattermost-toolchain-poster] Tool:', toolName);
      console.log('[mattermost-toolchain-poster] Result length:', resultText.length);
      console.log('[mattermost-toolchain-poster] Is error:', isError);
      console.log('[mattermost-toolchain-poster] Duration:', durationMs);

      // Skip if results disabled or tool excluded
      if (!includeResults || excludedTools.has(toolName)) {
        console.log('[mattermost-toolchain-poster] Skipping - results disabled or excluded tool');
        return undefined;
      }

      const formattedMessage = formatToolResult(
        toolName,
        isError ? { error: resultText } : resultText,
        durationMs,
        truncateAt,
        maxLines
      );

      // Since this is a sync hook, we need to fire and forget the post
      // We can't await here, so just call the async function
      const postResult = async () => {
        try {
          const { client, accountName } = getClient(lastSessionKey);
          if (!client) return;
          
          let senderId: string | undefined;

          const sessionEntry = sessionSenders.get(lastSessionKey ?? '');
          if (sessionEntry) {
            senderId = sessionEntry.senderId;
          } else {
            // Fallback for results
            const accountEntry = sessionSenders.get(accountName);
            if (accountEntry) {
              const isFresh = (Date.now() - accountEntry.timestamp) < 30 * 60 * 1000;
              const isSubagent = lastSessionKey?.includes(':subagent:') || lastSessionKey?.includes(':cron:');
              if (isFresh && !isSubagent) {
                senderId = accountEntry.senderId;
              }
            }
          }

          if (postToConversation && client.hasRestApi() && senderId) {
            console.log('[mattermost-toolchain-poster] Posting tool result to DM with user:', senderId);
            await client.postToDm(senderId, formattedMessage);
          } else {
            console.log('[mattermost-toolchain-poster] Posting tool result via webhook (channel/cron)');
            await client.postToWebhook(formattedMessage);
          }
        } catch (err) {
          console.error('[mattermost-toolchain-poster] Failed to post tool result:', err);
          // Try webhook as fallback
          try {
            const { client: fallbackClient } = getClient(lastSessionKey);
            if (fallbackClient) await fallbackClient.postToWebhook(formattedMessage);
          } catch {
            // Silent fail on fallback
          }
        }
      };
      
      // Fire and forget
      postResult().catch(console.error);
      
      return undefined; // Don't modify the result
    });
    console.debug('[mattermost-toolchain-poster] Registered tool_result_persist hook');

    console.log(`[mattermost-toolchain-poster v${PLUGIN_VERSION}] Plugin registered successfully - all hooks ready`);
  },
};

export default plugin;
