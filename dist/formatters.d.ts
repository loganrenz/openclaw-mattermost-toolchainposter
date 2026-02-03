/**
 * Message formatters for tool call and result posts
 * Compact format for less visual noise in Mattermost
 */
/**
 * Format a tool call message for Mattermost (compact version)
 */
export declare function formatToolCall(toolName: string, params: Record<string, unknown>): string;
/**
 * Format a tool result message for Mattermost (compact version)
 */
export declare function formatToolResult(toolName: string, result: unknown, durationMs: number, truncateAt: number): string;
/**
 * Truncate text to a maximum length with ellipsis
 */
export declare function truncateText(text: string, maxLength: number): string;
//# sourceMappingURL=formatters.d.ts.map