// V5 — Dashboard (default view for new users).
import {
    state, visibleItems, visibleTags, filterItems, setView,
} from '../state.js';
import {
    escapeHtml, formatHeroDate, urgency, daysUntilNext, nextDueDate,
    formatShortDate, urgencyClass, formatDPlus, parseDate,
} from '../helpers.js';
import { openCrudModal } from '../modal.js';

export function render(root) {
    const items = filterItems(visibleItems());
    const tags = visibleTags();
    const today = new Date();

    const withCycle = items.filter(it => it.cycleNum && it.cycleUnit);
    const overdue = withCycle.filter(it => urgency(it, today) === 3);
    const soon = withCycle.filter(it => urgency(it, today) === 2);
    const active = withCycle.length;
    const tagCount = tags.length;

    // "이번 주 할 일" — sorted by daysUntilNext within 7 days (incl. overdue)
    const thisWeek = withCycle
        .filter(it => {
            const u = daysUntilNext(it, today);
            return u !== null && u <= 7;
        })
        .sort((a, b) => daysUntilNext(a, today) - daysUntilNext(b, today));

    // 태그별 분포 — count items + overdue per tag
    const tagDist = tags.map(t => {
        const owned = items.filter(it => (it.tags || []).includes(t.id));
        const due = owned.filter(it => urgency(it, today) === 3).length;
        return { tag: t, total: owned.length, due, ok: owned.length - due };
    }).filter(d => d.total > 0);

    // 최근 활동 — last 6 updates by lastDate desc
    const recent = items
        .slice()
        .sort((a, b) => parseDate(b.lastDate) - parseDate(a.lastDate))
        .slice(0, 6);

    const heroNum = overdue.length;
    const empty = items.length === 0;

    root.innerHTML = `
        <div class="v5-root">
            <section class="v5-hero">
                <div class="dday-eyebrow">${escapeHtml(formatHeroDate(today))}</div>
                <h1>${heroNum > 0
                    ? `처리해야 할 항목이 <span class="num">${heroNum}개</span>`
                    : empty ? '환영합니다 👋' : '오늘은 여유로운 하루'}</h1>
                <div class="sub">${empty
                    ? '첫 항목을 추가해서 시작해보세요.'
                    : `활성 주기 ${active}개${tagCount ? ` · 태그 ${tagCount}개` : ''}`}</div>
            </section>

            <section class="v5-stats" aria-label="요약 통계">
                ${stat('지난 주기', overdue.length, 'is-danger', '주기를 넘긴 항목')}
                ${stat('곧 다가옴', soon.length, 'is-warning', '3일 이내')}
                ${stat('활성 주기', active, '', '주기 설정된 항목')}
                ${stat('전체 태그', tagCount, '', '관리 중인 태그')}
            </section>

            ${empty ? `
                <div class="dday-empty">
                    <div class="emoji">⏳</div>
                    <p>아직 기록한 항목이 없어요.</p>
                    <button class="dday-btn" id="emptyAddBtn">+ 첫 항목 추가</button>
                </div>
            ` : `
                <section class="v5-grid">
                    <div class="v5-col">
                        <div class="dday-card dday-edge-top">
                            <h3 class="v5-card-title">이번 주 할 일</h3>
                            ${thisWeek.length === 0
                                ? '<p class="dday-hint">이번 주 다가오는 항목이 없어요.</p>'
                                : thisWeek.map(it => upcomingRow(it, today, tags)).join('')}
                        </div>
                    </div>
                    <div class="v5-col">
                        <div class="dday-card dday-edge-top">
                            <h3 class="v5-card-title">태그별 분포</h3>
                            ${tagDist.length === 0
                                ? '<p class="dday-hint">태그를 활용해보세요.</p>'
                                : tagDist.map(d => distRow(d)).join('')}
                        </div>
                        <div class="dday-card dday-edge-top">
                            <h3 class="v5-card-title">최근 활동</h3>
                            ${recent.length === 0
                                ? '<p class="dday-hint">기록 없음.</p>'
                                : recent.map(it => recentRow(it, tags)).join('')}
                        </div>
                    </div>
                </section>
            `}
        </div>
    `;

    // Wire interactions
    const emptyAdd = document.getElementById('emptyAddBtn');
    if (emptyAdd) emptyAdd.addEventListener('click', () => openCrudModal(null));

    root.querySelectorAll('[data-item-id]').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.dataset.itemId;
            const it = state.items.find(i => i.id === id);
            if (it) openCrudModal(it);
        });
    });

    root.querySelectorAll('[data-jump-view]').forEach(el => {
        el.addEventListener('click', () => setView(el.dataset.jumpView));
    });
}

function stat(label, n, modifier, sub) {
    return `
        <div class="v5-stat dday-edge-top ${modifier}">
            <div class="dday-eyebrow">${escapeHtml(label)}</div>
            <div class="num">${n}</div>
            <div class="sub">${escapeHtml(sub)}</div>
        </div>
    `;
}

function upcomingRow(item, today, tags) {
    const u = daysUntilNext(item, today);
    const due = nextDueDate(item);
    const cls = urgencyClass(urgency(item, today));
    const tagDots = (item.tags || []).slice(0, 3).map(tid => {
        const t = tags.find(x => x.id === tid);
        return t ? `<span class="dday-tag-dot" style="background:${t.color}"></span>` : '';
    }).join('');
    return `
        <div class="v5-upcoming-row" data-item-id="${item.id}" role="button" tabindex="0">
            <div class="v5-upcoming-name">
                <span class="dday-urgency-dot ${cls}"></span>
                <strong>${escapeHtml(item.name)}</strong>
                ${tagDots}
            </div>
            <span class="dday-mono">${due ? formatShortDate(due.toISOString().slice(0,10)) : ''}</span>
            <span class="v5-upcoming-when ${cls}">${u <= 0 ? `${Math.abs(u)}일 지남` : `${u}일 남음`}</span>
        </div>
    `;
}

function distRow(d) {
    const okPct = d.total ? (d.ok / d.total) * 100 : 0;
    const duePct = d.total ? (d.due / d.total) * 100 : 0;
    return `
        <div class="v5-dist-row">
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                <span class="dday-tag-dot" style="background:${d.tag.color}; display:inline-block; margin-right:6px;"></span>
                ${escapeHtml(d.tag.label)}
            </span>
            <div class="v5-dist-bar">
                <div class="v5-dist-bar-ok" style="width:${okPct}%; background:${d.tag.color};"></div>
                <div class="v5-dist-bar-due" style="width:${duePct}%;"></div>
            </div>
            <span class="v5-dist-count">${d.total}</span>
        </div>
    `;
}

function recentRow(item, tags) {
    const tagDots = (item.tags || []).slice(0, 3).map(tid => {
        const t = tags.find(x => x.id === tid);
        return t ? `<span class="dday-tag-dot" style="background:${t.color}"></span>` : '';
    }).join('');
    return `
        <div class="v5-recent-row" data-item-id="${item.id}" role="button" tabindex="0">
            <span class="v5-recent-date">${escapeHtml(item.lastDate)}</span>
            <strong style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(item.name)}</strong>
            <span style="display:inline-flex; gap:3px;">${tagDots}</span>
        </div>
    `;
}
