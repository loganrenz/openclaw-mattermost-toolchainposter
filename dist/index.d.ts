/**
 * Mattermost Toolchain Poster - OpenClaw Plugin
 *
 * Posts tool call information to the conversation channel, providing
 * visibility into agent tool usage directly in the chat.
 */
import type { PluginConfig } from './types.js';
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
    handler: (ctx: PluginCommandContext) => {
        text: string;
    } | Promise<{
        text: string;
    }>;
}
export interface PluginApi {
    config: PluginConfig;
    on(event: string, handler: (...args: unknown[]) => unknown): void;
    registerCommand?: (command: PluginCommand) => void;
}
declare const plugin: {
    id: string;
    name: string;
    configSchema: {
        type: string;
        additionalProperties: boolean;
        properties: {
            webhookUrl: {
                type: string;
                description: string;
            };
            baseUrl: {
                type: string;
                description: string;
            };
            botToken: {
                type: string;
                description: string;
            };
            channel: {
                type: string;
                description: string;
            };
            username: {
                type: string;
                default: string;
                description: string;
            };
            iconUrl: {
                type: string;
                description: string;
            };
            iconEmoji: {
                type: string;
                default: string;
                description: string;
            };
            includeResults: {
                type: string;
                default: boolean;
                description: string;
            };
            truncateResultsAt: {
                type: string;
                default: number;
                description: string;
            };
            excludeTools: {
                type: string;
                items: {
                    type: string;
                };
                default: string[];
                description: string;
            };
            postToConversation: {
                type: string;
                default: boolean;
                description: string;
            };
            enableHaltCommands: {
                type: string;
                default: boolean;
                description: string;
            };
        };
        required: never[];
    };
    register(api: PluginApi): void;
};
export default plugin;
//# sourceMappingURL=index.d.ts.map