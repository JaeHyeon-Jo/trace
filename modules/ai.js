// AI slot stubs. Statistical fallbacks only — no model calls yet.
import { parseDate, DAY_MS } from './helpers.js';

// eslint-disable-next-line no-unused-vars
export async function suggestTags(title) {
    // TODO: integrate AI model. For now, return no suggestions.
    return [];
}

// Average interval across history (3+ records). Returns integer days or null.
export function suggestCycleDays(history) {
    if (!Array.isArray(history) || history.length < 3) return null;
    const sorted = [...history].sort((a, b) => parseDate(a) - parseDate(b));
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
        const diff = Math.round((parseDate(sorted[i]) - parseDate(sorted[i - 1])) / DAY_MS);
        if (diff > 0) gaps.push(diff);
    }
    if (gaps.length === 0) return null;
    return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
}
