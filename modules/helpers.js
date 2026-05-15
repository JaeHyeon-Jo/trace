// Date / cycle / urgency helpers.
// Preserves legacy field names (lastDate, cycleNum, cycleUnit) — Cloud Function
// `dailyCycleCheck` depends on them.

export const DAY_MS = 86400000;

export const DEFAULT_TAGS = [
    { id: 'health',   label: '건강',   color: '#27a644' },
    { id: 'life',     label: '생활',   color: '#5e6ad2' },
    { id: 'work',     label: '업무',   color: '#4ea7fc' },
    { id: 'family',   label: '가족',   color: '#eb5757' },
    { id: 'beauty',   label: '미용',   color: '#f2994a' },
    { id: 'shopping', label: '쇼핑',   color: '#f2c94c' },
    { id: 'car',      label: '차량',   color: '#bb6bd9' },
    { id: 'exercise', label: '운동',   color: '#56ccf2' },
    { id: 'finance',  label: '금융',   color: '#9b51e0' },
    { id: 'pet',      label: '반려',   color: '#a0d911' },
];

export const TAG_COLOR_PALETTE = DEFAULT_TAGS.map(t => t.color);

export function parseDate(iso) {
    // Use noon to avoid DST edge cases when computing day diffs.
    return new Date(iso + 'T12:00:00');
}

export function todayIso() {
    return new Date().toISOString().substring(0, 10);
}

export function startOfDay(d) {
    const out = new Date(d);
    out.setHours(0, 0, 0, 0);
    return out;
}

export function daysBetween(a, b) {
    return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
}

export function toCycleDays(item) {
    if (!item.cycleNum || !item.cycleUnit) return null;
    if (item.cycleUnit === 'day') return item.cycleNum;
    if (item.cycleUnit === 'week') return item.cycleNum * 7;
    if (item.cycleUnit === 'month') return item.cycleNum * 30; // approximation
    return null;
}

export function elapsedDays(item, today = new Date()) {
    return daysBetween(parseDate(item.lastDate), today);
}

export function daysUntilNext(item, today = new Date()) {
    const days = toCycleDays(item);
    if (days == null) return null;
    return days - elapsedDays(item, today);
}

export function cycleProgress(item, today = new Date()) {
    const days = toCycleDays(item);
    if (days == null) return null;
    const e = elapsedDays(item, today);
    return Math.min(1, Math.max(0, e / days));
}

export function nextDueDate(item) {
    const days = toCycleDays(item);
    if (days == null) return null;
    const d = parseDate(item.lastDate);
    d.setDate(d.getDate() + days);
    return d;
}

export function formatDPlus(item, today = new Date()) {
    const e = elapsedDays(item, today);
    const cd = toCycleDays(item);
    if (cd && e >= 7 && cd >= 14) {
        const w = Math.floor(e / 7);
        const r = e % 7;
        return r === 0 ? `D+${w}주` : `D+${w}주 ${r}일`;
    }
    return `D+${e}`;
}

// urgency:
//   3 — overdue (days until next <= 0)
//   2 — approaching (<= 3 days)
//   1 — ok
//   0 — no cycle defined
export function urgency(item, today = new Date()) {
    if (!toCycleDays(item)) return 0;
    const u = daysUntilNext(item, today);
    if (u <= 0) return 3;
    if (u <= 3) return 2;
    return 1;
}

export function urgencyClass(u) {
    if (u === 3) return 'is-due';
    if (u === 2) return 'is-soon';
    if (u === 1) return 'is-ok';
    return '';
}

// ----- Legacy wrappers (preserved for compatibility) -----

export function calculateCycleDiff(lastDate, cycleNum, cycleUnit) {
    const cd = toCycleDays({ cycleNum, cycleUnit });
    if (cd == null) return { diffDays: 0, nextDueDate: null };
    const taskDate = parseDate(lastDate);
    const next = new Date(taskDate);
    next.setDate(next.getDate() + cd);
    const today = new Date();
    const diffDays = Math.floor((next - today) / DAY_MS);
    return { diffDays, nextDueDate: next };
}

export function formatCycleDisplay(cycleNum, cycleUnit) {
    const unitMap = { day: '일', week: '주', month: '월' };
    return `${cycleNum}${unitMap[cycleUnit]}`;
}

export function formatDate(d) {
    return d.toISOString().substring(0, 10);
}

// ----- Small utilities -----

export function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
}

export function nowIso() {
    return new Date().toISOString();
}

export function uid() {
    return (crypto && crypto.randomUUID) ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function debounce(fn, ms) {
    let t = null;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

export function isMobileViewport() {
    return window.matchMedia('(max-width: 767px)').matches;
}

// Korean weekday formatting helper for hero ("5월 15일 · 금요일")
const WEEKDAYS_KR = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
export function formatHeroDate(d = new Date()) {
    return `${d.getMonth() + 1}월 ${d.getDate()}일 · ${WEEKDAYS_KR[d.getDay()]}`;
}

export function formatShortDate(iso) {
    if (!iso) return '';
    const [, m, d] = iso.split('-');
    return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}
