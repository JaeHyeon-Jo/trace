// V4 — Monthly calendar (7×6) + side panel. Desktop only.
import { state, visibleItems, visibleTags, filterItems } from '../state.js';
import {
    escapeHtml, urgency, urgencyClass, daysUntilNext, nextDueDate,
    parseDate, toCycleDays, daysBetween, formatShortDate,
} from '../helpers.js';
import { openCrudModal } from '../modal.js';

let viewMonth = null; // {y, m}

function ensureMonth(today) {
    if (!viewMonth) viewMonth = { y: today.getFullYear(), m: today.getMonth() };
}

export function render(root) {
    const today = new Date();
    ensureMonth(today);

    const tags = visibleTags();
    const items = filterItems(visibleItems());

    const { y, m } = viewMonth;
    const firstOfMonth = new Date(y, m, 1);
    const lastOfMonth = new Date(y, m + 1, 0);
    // Grid start = Sunday before the 1st
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

    // Per-day buckets across 6 weeks (42 cells)
    const buckets = Array.from({ length: 42 }, () => []);
    items.forEach(it => {
        const cd = toCycleDays(it);
        const last = parseDate(it.lastDate);
        // Always show last record itself, plus future cycle multiples (up to 4)
        const positions = [last];
        if (cd) {
            const due = nextDueDate(it);
            let cursor = new Date(due);
            for (let i = 0; i < 4; i++) {
                positions.push(new Date(cursor));
                cursor.setDate(cursor.getDate() + cd);
            }
        }
        positions.forEach(p => {
            const idx = daysBetween(gridStart, p);
            if (idx >= 0 && idx < 42) {
                buckets[idx].push({
                    item: it,
                    date: p,
                    isLast: p.getTime() === last.getTime(),
                });
            }
        });
    });

    // Side panel: top 7 upcoming
    const upcoming = items
        .filter(it => toCycleDays(it) !== null)
        .map(it => ({ it, u: daysUntilNext(it, today) }))
        .filter(x => x.u !== null && x.u >= -30)
        .sort((a, b) => a.u - b.u)
        .slice(0, 7);

    root.innerHTML = `
        <div class="v4-header">
            <button class="dday-btn icon" id="prevMonth" aria-label="이전 달">‹</button>
            <h3>${y}년 ${m + 1}월</h3>
            <button class="dday-btn icon" id="nextMonth" aria-label="다음 달">›</button>
            <button class="dday-btn ghost" id="todayBtn">오늘</button>
        </div>

        <div class="v4-root">
            <div>
                <div class="v4-weekdays">
                    ${['일','월','화','수','목','금','토'].map(d => `<div>${d}</div>`).join('')}
                </div>
                <div class="v4-grid">
                    ${buckets.map((bucket, i) => cell(bucket, i, gridStart, firstOfMonth, lastOfMonth, today, tags)).join('')}
                </div>
                <div class="v4-legend">
                    <span class="v4-legend-item"><span class="v4-legend-dot" style="background:rgba(94,106,210,0.2)"></span>오늘</span>
                    <span class="v4-legend-item"><span class="v4-legend-dot" style="background:rgba(229,72,77,0.5)"></span>지난 주기</span>
                    <span class="v4-legend-item"><span class="v4-legend-dot" style="background:var(--surface-3)"></span>마지막 기록</span>
                </div>
            </div>

            <aside class="v4-side">
                <h4>다가오는 주기</h4>
                ${upcoming.length === 0
                    ? '<p class="dday-hint">없음</p>'
                    : upcoming.map(({ it, u }) => {
                        const cls = urgencyClass(urgency(it, today));
                        return `
                        <div class="dday-card" data-item-id="${it.id}" role="button" tabindex="0">
                            <strong style="display:block; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(it.name)}</strong>
                            <div class="${cls}" style="font-size:11px; margin-top:4px;">
                                ${u <= 0 ? `${Math.abs(u)}일 지남` : `${u}일 남음`}
                            </div>
                        </div>`;
                    }).join('')}
            </aside>
        </div>
    `;

    root.querySelector('#prevMonth').addEventListener('click', () => {
        viewMonth = { y: m === 0 ? y - 1 : y, m: m === 0 ? 11 : m - 1 };
        render(root);
    });
    root.querySelector('#nextMonth').addEventListener('click', () => {
        viewMonth = { y: m === 11 ? y + 1 : y, m: m === 11 ? 0 : m + 1 };
        render(root);
    });
    root.querySelector('#todayBtn').addEventListener('click', () => {
        viewMonth = { y: today.getFullYear(), m: today.getMonth() };
        render(root);
    });

    root.querySelectorAll('[data-item-id]').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.dataset.itemId;
            const it = state.items.find(i => i.id === id);
            if (it) openCrudModal(it);
        });
    });
}

function cell(bucket, idx, gridStart, firstOfMonth, lastOfMonth, today, tags) {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + idx);
    const isOtherMonth = cellDate.getMonth() !== firstOfMonth.getMonth();
    const isToday = sameDay(cellDate, today);

    const chips = bucket.slice(0, 3).map(b => {
        const t = (b.item.tags || []).map(tid => tags.find(x => x.id === tid)).filter(Boolean)[0];
        const isPast = b.date < today && !b.isLast;
        return `
            <div class="v4-chip ${isPast ? 'is-due' : ''}" data-item-id="${b.item.id}" title="${escapeHtml(b.item.name)}">
                ${t ? `<span class="v4-chip-dot" style="background:${t.color}"></span>` : ''}
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(b.item.name)}</span>
            </div>
        `;
    }).join('');
    const more = bucket.length > 3 ? `<div class="v4-more">+${bucket.length - 3}</div>` : '';

    return `
        <div class="v4-cell ${isOtherMonth ? 'is-other-month' : ''} ${isToday ? 'is-today' : ''}">
            <div class="v4-cell-num">${cellDate.getDate()}</div>
            ${chips}
            ${more}
        </div>
    `;
}

function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
