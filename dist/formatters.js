/**
 * Message formatters for tool call and result posts
 * Compact format for less visual noise in Mattermost
 */
/**
 * Format a tool call message for Mattermost (compact version)
 */
export function formatToolCall(toolName, params) {
    const paramsStr = formatParamsCompact(params);
    // Single line format with collapsed params
    return `:wrench: **${toolName}**\n> ${paramsStr}`;
}
/**
 * Format a tool result message for Mattermost
 * Uses code blocks for long outputs (Mattermost doesn't support HTML details tags)
 * Truncates to maxLines to keep output manageable
 */
export function formatToolResult(toolName, result, durationMs, truncateAt, maxLines = 20) {
    const durationStr = durationMs > 0 ? ` (${formatDuration(durationMs)})` : '';
    let resultText = formatResultCompact(result, truncateAt);
    const isError = result && typeof result === 'object' && 'error' in result;
    const emoji = isError ? ':x:' : ':white_check_mark:';
    // Truncate by lines if needed
    resultText = truncateLines(resultText, maxLines);
    // For longer outputs (> 100 chars), use a code block
    // Mattermost's native "Show more" will handle collapsing
    if (resultText.length > 100) {
        return `${emoji} **${toolName}**${durationStr}\n\`\`\`\n${resultText}\n\`\`\``;
    }
    // For short outputs, use a simple blockquote
    return `${emoji} **${toolName}**${durationStr}\n> ${resultText}`;
}
/**
 * Truncate text to a maximum number of lines
 */
function truncateLines(text, maxLines) {
    const lines = text.split('\n');
    if (lines.length <= maxLines) {
        return text;
    }
    const truncated = lines.slice(0, maxLines).join('\n');
    const remaining = lines.length - maxLines;
    return `${truncated}\n... (${remaining} more lines)`;
}
/**
 * Format parameters compactly - one line if small, otherwise truncated
 */
function formatParamsCompact(params) {
    try {
        // For common single-value params, format nicely
        const keys = Object.keys(params);
        if (keys.length === 0) {
            return '(no params)';
        }
        if (keys.length === 1) {
            const key = keys[0];
            const value = params[key];
            return `\`${key}\`: ${formatValue(value)}`;
        }
        // Multiple params - show as key=value pairs, truncated
        const pairs = keys.map(k => `${k}=${formatValue(params[k])}`);
        const str = pairs.join(', ');
        return truncateText(str, 200);
    }
    catch {
        return String(params);
    }
}
/**
 * Format a single value compactly
 */
function formatValue(value) {
    if (typeof value === 'string') {
        const truncated = truncateText(value, 100);
        return `\`${truncated}\``;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return `\`${value}\``;
    }
    if (Array.isArray(value)) {
        return `[${value.length} items]`;
    }
    if (value && typeof value === 'object') {
        const keys = Object.keys(value);
        return `{${keys.length} keys}`;
    }
    return String(value);
}
/**
 * Format result content compactly
 */
function formatResultCompact(result, truncateAt) {
    if (result === undefined || result === null) {
        return '(empty)';
    }
    // For error results
    if (result && typeof result === 'object' && 'error' in result) {
        const err = result.error;
        return truncateText(err, truncateAt);
    }
    // For string results
    if (typeof result === 'string') {
        return truncateText(result, truncateAt);
    }
    // For objects, show truncated JSON
    try {
        const json = JSON.stringify(result);
        return truncateText(json, truncateAt);
    }
    catch {
        return String(result);
    }
}
/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text, maxLength) {
    if (text.length <= maxLength) {
        return text;
    }
    return text.slice(0, maxLength) + '...';
}
/**
 * Format duration in human-readable form
 */
function formatDuration(ms) {
    if (ms < 1000) {
        return `${ms}ms`;
    }
    if (ms < 60000) {
        return `${(ms / 1000).toFixed(1)}s`;
    }
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
}
//# sourceMappingURL=formatters.js.map