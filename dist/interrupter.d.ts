/**
 * OpenClaw Agent Interrupter Plugin
 *
 * Provides a /stop command to interrupt the agent by blocking
 * all subsequent tool calls until the next user message.
 */
export interface PluginApi {
    config: Record<string, unknown>;
    registerCommand: (command: {
        name: string;
        description: string;
        acceptsArgs?: boolean;
        requireAuth?: boolean;
        handler: (ctx: {
            senderId?: string;
            channel: string;
            args?: string;
        }) => {
            text: string;
        } | Promise<{
            text: string;
        }>;
    }) => void;
    on(event: string, handler: (...args: unknown[]) => unknown): void;
}
declare const plugin: {
    id: string;
    name: string;
    description: string;
    configSchema: {
        type: string;
        additionalProperties: boolean;
        properties: {};
    };
    register(api: PluginApi): void;
};
export default plugin;
//# sourceMappingURL=interrupter.d.ts.map