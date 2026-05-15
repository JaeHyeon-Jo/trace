// V3 — Gantt-style timeline. Desktop only (mobile is guarded in topbar + CSS).
import { state, visibleItems, visibleTags, filterItems } from '../state.js';
import {
    escapeHtml, urgency, urgencyClass, daysUntilNext, parseDate,
    nextDueDate, daysBetween, DAY_MS, todayIso,
} from '../helpers.js';
import { openCrudModal } from '../modal.js';

const WINDOW_DAYS = 35; // ±35 days

export function render(root) {
    const tags = visibleTags();
    const items = filterItems(visibleItems());
    const today = new Date();
    const windowStart = new Date(today); windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);
    const windowEnd = new Date(today); windowEnd.setDate(windowEnd.getDate() + WINDOW_DAYS);
    const totalDays = WINDOW_DAYS * 2;

    const withCycle = items.filter(it => it.cycleNum && it.cycleUnit);
    const noCycle = items.filter(it => !(it.cycleNum && it.cycleUnit));

    // Sort: urgency desc → daysUntilNext asc
    withCycle.sort((a, b) => {
        const ua = urgency(a, today), ub = urgency(b, today);
        if (ua !== ub) return ub - ua;
        return (daysUntilNext(a, today) || 0) - (daysUntilNext(b, today) || 0);
    });

    const ticks = [];
    for (let d = -WINDOW_DAYS; d <= WINDOW_DAYS; d += 7) {
        const t = new Date(today); t.setDate(t.getDate() + d);
        const pos = ((d + WINDOW_DAYS) / totalDays) * 100;
        ticks.push({
            pos,
            label: d === 0 ? '오늘' : `${t.getMonth() + 1}/${t.getDate()}`,
            isToday: d === 0,
        });
    }

    root.innerHTML = `
        <div class="v3-root">
            <div class="v3-meta">
                <span>오늘 ${today.getMonth() + 1}/${today.getDate()}</span>
                <span>±${WINDOW_DAYS}일 윈도우</span>
            </div>

            <div class="v3-tick-row">
                <div></div>
                <div class="v3-tick-track">
                    ${ticks.map(t => `<div class="v3-tick ${t.isToday ? 'is-today' : ''}" style="left:${t.pos}%;">${escapeHtml(t.label)}</div>`).join('')}
                </div>
                <div></div>
            </div>

            ${withCycle.length === 0
                ? '<p class="dday-hint">주기 설정된 항목이 없어요.</p>'
                : withCycle.map(it => barRow(it, tags, today, windowStart, windowEnd, totalDays)).join('')}

            ${noCycle.length > 0 ? `
                <hr class="dday-divider">
                <h3 style="font-size:13px; font-weight:600; color:var(--ink-subtle); margin:0 0 8px;">주기 없는 1회성</h3>
                ${noCycle.map(it => oneShotRow(it, tags, today, windowStart, windowEnd, totalDays)).join('')}
            ` : ''}
        </div>
    `;

    root.querySelectorAll('[data-item-id]').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.dataset.itemId;
            const it = state.items.find(i => i.id === id);
            if (it) openCrudModal(it);
        });
    });
}

function barRow(item, tags, today, windowStart, windowEnd, totalDays) {
    const u = urgency(item, today);
    const cls = urgencyClass(u);
    const lastDate = parseDate(item.lastDate);
    const dueDate = nextDueDate(item);
    if (!dueDate) return '';

    const startDays = daysBetween(windowStart, lastDate);
    const endDays = daysBetween(windowStart, dueDate);
    const todayDays = daysBetween(windowStart, today);

    const startPct = Math.max(0, Math.min(100, (startDays / totalDays) * 100));
    const endPct = Math.max(0, Math.min(100, (endDays / totalDays) * 100));
    const todayPct = (todayDays / totalDays) * 100;

    if (endDays < 0 || startDays > totalDays) {
        // Fully outside window — show row but no bar
        return `<div class="v3-row" data-item-id="${item.id}" role="button" tabindex="0">
            <div class="v3-row-title"><span class="dday-urgency-dot ${cls}"></span><strong>${escapeHtml(item.name)}</strong></div>
            <div class="v3-bar-track"></div>
            <div class="v3-row-remain dday-hint">윈도우 밖</div>
        </div>`;
    }

    const fillTo = Math.max(startPct, Math.min(endPct, todayPct));
    const dn = daysUntilNext(item, today);
    const tagDots = (item.tags || []).slice(0, 3).map(tid => {
        const t = tags.find(x => x.id === tid);
        return t ? `<span class="v3-row-tag-dot" style="background:${t.color}"></span>` : '';
    }).join('');

    return `
        <div class="v3-row" data-item-id="${item.id}" role="button" tabindex="0">
            <div class="v3-row-title">
                <span class="dday-urgency-dot ${cls}"></span>
                <strong>${escapeHtml(item.name)}</strong>
                <span class="v3-row-tags">${tagDots}</span>
            </div>
            <div class="v3-bar-track">
                <div class="v3-bar ${cls}" style="left:${startPct}%; width:${Math.max(0, endPct - startPct)}%;"></div>
                <div class="v3-bar-fill ${cls}" style="left:${startPct}%; width:${Math.max(0, fillTo - startPct)}%;"></div>
                ${startDays >= 0 && startDays <= totalDays ? `<div class="v3-bar-dot ${cls}" style="left:${startPct}%;"></div>` : ''}
                ${endDays >= 0 && endDays <= totalDays ? `<div class="v3-bar-dot ${cls}" style="left:${endPct}%;"></div>` : ''}
                ${todayPct >= 0 && todayPct <= 100 ? `<div class="v3-today-line" style="left:${todayPct}%;"></div>` : ''}
            </div>
            <div class="v3-row-remain ${cls}">${dn === null ? '' : dn <= 0 ? `${Math.abs(dn)}일 지남` : `${dn}일 남음`}</div>
        </div>
    `;
}

function oneShotRow(item, tags, today, windowStart, windowEnd, totalDays) {
    const lastDate = parseDate(item.lastDate);
    const days = daysBetween(windowStart, lastDate);
    if (days < 0 || days > totalDays) {
        return `<div class="v3-row" data-item-id="${item.id}" role="button" tabindex="0">
            <div class="v3-row-title"><strong>${escapeHtml(item.name)}</strong></div>
            <div class="v3-bar-track"></div>
            <div class="v3-row-remain dday-hint">윈도우 밖</div>
        </div>`;
    }
    const pct = (days / totalDays) * 100;
    return `
        <div class="v3-row" data-item-id="${item.id}" role="button" tabindex="0">
            <div class="v3-row-title"><strong>${escapeHtml(item.name)}</strong></div>
            <div class="v3-bar-track">
                <div class="v3-bar-dot is-ok" style="left:${pct}%;"></div>
            </div>
            <div class="v3-row-remain dday-mono">${escapeHtml(item.lastDate)}</div>
        </div>
    `;
}
