/**
 * Mattermost Toolchain Poster - OpenClaw Plugin
 *
 * Posts tool call information to the conversation channel, providing
 * visibility into agent tool usage directly in the chat.
 */
import { MattermostClient } from './mattermost.js';
import { formatToolCall, formatToolResult } from './formatters.js';
// Store for correlating before/after calls
const pendingCalls = new Map();
// Track the most recent sender ID from message_received for DM posting
let lastSenderId;
// Track sessions that have been stopped via /stop command
const stoppedSessions = new Set();
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
    register(api) {
        // Debug: log raw config to understand structure
        const rawConfig = api.config;
        console.log('[mattermost-toolchain-poster] Raw config:', JSON.stringify(rawConfig, null, 2));
        // OpenClaw passes config nested under 'config' key, but also check flat for backwards compat
        const config = rawConfig.config ?? rawConfig;
        console.log('[mattermost-toolchain-poster] Resolved config:', JSON.stringify(config, null, 2));
        // Get config from options or environment variables
        const webhookUrl = config.webhookUrl || process.env.MATTERMOST_WEBHOOK_URL;
        const baseUrl = config.baseUrl || process.env.MATTERMOST_URL;
        const botToken = config.botToken || process.env.MATTERMOST_BOT_TOKEN;
        console.log('[mattermost-toolchain-poster] baseUrl:', baseUrl ? 'set' : 'not set');
        console.log('[mattermost-toolchain-poster] botToken:', botToken ? 'set' : 'not set');
        // Validate - need either REST API or webhook
        const hasRestApi = !!(baseUrl && botToken);
        const hasWebhook = !!webhookUrl;
        if (!hasRestApi && !hasWebhook) {
            console.warn('[mattermost-toolchain-poster] No Mattermost connection configured. Set MATTERMOST_URL + MATTERMOST_BOT_TOKEN or MATTERMOST_WEBHOOK_URL');
            return;
        }
        if (hasRestApi) {
            console.log('[mattermost-toolchain-poster] Using REST API for posting to DMs');
            console.log('[mattermost-toolchain-poster] Base URL:', baseUrl);
        }
        else {
            console.log('[mattermost-toolchain-poster] Using webhook (fixed channel only):', webhookUrl?.substring(0, 50) + '...');
        }
        const client = new MattermostClient({
            webhookUrl,
            baseUrl,
            botToken,
            channel: config.channel,
            username: config.username ?? 'OpenClaw Agent',
            iconEmoji: config.iconEmoji ?? ':robot:',
            iconUrl: config.iconUrl,
        });
        const excludedTools = new Set(config.excludeTools ?? ['message']);
        const includeResults = config.includeResults ?? true;
        const truncateAt = config.truncateResultsAt ?? 2000;
        const postToConversation = config.postToConversation ?? true;
        const enableHaltCommands = config.enableHaltCommands ?? false;
        // Register /halt command if available and enabled (note: /stop is reserved by OpenClaw)
        if (enableHaltCommands && api.registerCommand) {
            api.registerCommand({
                name: 'halt',
                description: 'Halt the agent from executing further tool calls',
                acceptsArgs: false,
                requireAuth: true,
                handler: async (ctx) => {
                    const sessionKey = ctx.senderId ?? lastSenderId ?? 'default';
                    stoppedSessions.add(sessionKey);
                    console.log('[mattermost-toolchain-poster] Session halted:', sessionKey);
                    // Also post to Mattermost
                    if (client.hasRestApi() && (ctx.senderId || lastSenderId)) {
                        await client.postToDm(ctx.senderId || lastSenderId, '🛑 Agent halted. Tool calls will be blocked until you send a new message.');
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
                    const sessionKey = ctx.senderId ?? lastSenderId ?? 'default';
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
        api.on('message_received', async (...args) => {
            const event = args[0];
            // Get senderId from metadata for posting to DM
            const senderId = event.metadata?.senderId;
            if (senderId) {
                lastSenderId = senderId;
                console.log('[mattermost-toolchain-poster] Captured sender ID:', lastSenderId);
                // Clear halt state on new user message (unless it's a /halt or /unhalt command)
                if (!event.content.startsWith('/halt') && !event.content.startsWith('/unhalt')) {
                    if (stoppedSessions.has(senderId)) {
                        stoppedSessions.delete(senderId);
                        console.log('[mattermost-toolchain-poster] Session auto-resumed on new message');
                    }
                }
            }
        });
        // Hook: before_tool_call
        api.on('before_tool_call', async (...args) => {
            const event = args[0];
            const ctx = args[1];
            const { toolName, params } = event;
            // Check if session is stopped - block all tool calls if so (only when halt commands enabled)
            if (enableHaltCommands) {
                const sessionKey = lastSenderId ?? ctx.sessionKey ?? 'default';
                if (stoppedSessions.has(sessionKey)) {
                    console.log('[mattermost-toolchain-poster] Blocking tool call - session stopped:', toolName);
                    return {
                        block: true,
                        blockReason: 'Agent was stopped by user. Send a new message to resume.',
                    };
                }
            }
            // Skip excluded tools
            if (excludedTools.has(toolName)) {
                return undefined;
            }
            const message = formatToolCall(toolName, params);
            const toolCallId = `${ctx.sessionKey ?? 'default'}-${toolName}-${Date.now()}`;
            try {
                let postId;
                // Try to post to DM if we have REST API and sender ID
                if (postToConversation && client.hasRestApi() && lastSenderId) {
                    console.log('[mattermost-toolchain-poster] Posting tool call to DM with user:', lastSenderId);
                    postId = await client.postToDm(lastSenderId, message);
                }
                else {
                    // Fall back to webhook
                    console.log('[mattermost-toolchain-poster] Posting tool call via webhook');
                    postId = await client.postToWebhook(message);
                }
                pendingCalls.set(toolCallId, {
                    postId,
                    toolName,
                    startTime: Date.now(),
                });
            }
            catch (error) {
                console.error('[mattermost-toolchain-poster] Failed to post tool call:', error);
                // Try webhook as fallback
                try {
                    await client.postToWebhook(message);
                }
                catch (webhookError) {
                    console.error('[mattermost-toolchain-poster] Webhook fallback also failed:', webhookError);
                }
            }
            return undefined;
        });
        // Hook: after_tool_call
        api.on('after_tool_call', async (...args) => {
            const event = args[0];
            const { toolName, result, error, durationMs } = event;
            // Skip if results disabled or tool excluded
            if (!includeResults || excludedTools.has(toolName)) {
                return;
            }
            const duration = durationMs ?? 0;
            const message = formatToolResult(toolName, error ? { error } : result, duration, truncateAt);
            try {
                // Try to post to DM if we have REST API and sender ID
                if (postToConversation && client.hasRestApi() && lastSenderId) {
                    await client.postToDm(lastSenderId, message);
                }
                else {
                    await client.postToWebhook(message);
                }
            }
            catch (err) {
                console.error('[mattermost-toolchain-poster] Failed to post tool result:', err);
                // Try webhook as fallback
                try {
                    await client.postToWebhook(message);
                }
                catch {
                    // Silent fail on fallback
                }
            }
        });
        console.log('[mattermost-toolchain-poster] Plugin registered successfully');
    },
};
export default plugin;
//# sourceMappingURL=index.js.map