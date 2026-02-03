/**
 * OpenClaw Agent Interrupter Plugin
 *
 * Provides a /stop command to interrupt the agent by blocking
 * all subsequent tool calls until the next user message.
 */
// Track which sessions are in "stopped" state
const stoppedSessions = new Set();
const plugin = {
    id: 'openclaw-mattermost-toolchain-poster/interrupter',
    name: 'Agent Interrupter',
    description: 'Adds /stop command to interrupt agent tool execution',
    configSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
    },
    register(api) {
        console.log('[agent-interrupter] Registering /stop command');
        // Register /stop command
        api.registerCommand({
            name: 'stop',
            description: 'Stop the agent from executing further tool calls',
            acceptsArgs: false,
            requireAuth: true,
            handler: async (ctx) => {
                // Create a session key from available context
                const sessionKey = ctx.senderId ?? 'default';
                stoppedSessions.add(sessionKey);
                console.log('[agent-interrupter] Session stopped:', sessionKey);
                return { text: '🛑 Agent stopped. Tool calls will be blocked until you send a new message.' };
            },
        });
        // Register /resume command to manually clear the stop
        api.registerCommand({
            name: 'resume',
            description: 'Resume agent tool execution after /stop',
            acceptsArgs: false,
            requireAuth: true,
            handler: async (ctx) => {
                const sessionKey = ctx.senderId ?? 'default';
                if (stoppedSessions.has(sessionKey)) {
                    stoppedSessions.delete(sessionKey);
                    console.log('[agent-interrupter] Session resumed:', sessionKey);
                    return { text: '▶️ Agent resumed. Tool calls are now enabled.' };
                }
                return { text: 'Agent is not currently stopped.' };
            },
        });
        // Hook: message_received - clear stop state on new user message
        api.on('message_received', async (...args) => {
            const event = args[0];
            const senderId = event.metadata?.senderId;
            if (senderId && stoppedSessions.has(senderId)) {
                // Don't clear on /stop or /resume commands
                if (!event.content.startsWith('/stop') && !event.content.startsWith('/resume')) {
                    stoppedSessions.delete(senderId);
                    console.log('[agent-interrupter] Session auto-resumed on new message:', senderId);
                }
            }
        });
        // Hook: before_tool_call - block tools if session is stopped
        api.on('before_tool_call', async (...args) => {
            const ctx = args[1];
            // Check all possible session identifiers
            const sessionKey = ctx.sessionKey ?? 'default';
            // Check if any known session key is stopped
            for (const stopped of stoppedSessions) {
                // Simple match - in practice you may need more sophisticated matching
                if (stopped === sessionKey || stopped === 'default') {
                    console.log('[agent-interrupter] Blocking tool call:', ctx.toolName);
                    return {
                        block: true,
                        blockReason: 'Agent was stopped by user. Send a new message to resume.',
                    };
                }
            }
            return undefined;
        });
        console.log('[agent-interrupter] Plugin registered. Use /stop in chat to interrupt agent.');
    },
};
export default plugin;
//# sourceMappingURL=interrupter.js.map