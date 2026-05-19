// V1 — Dense list with tag rail + sorted by urgency.
import {
    state, visibleItems, archivedItems, visibleTags, filterItems,
    toggleFilterTag, clearFilterTags, toggleCollapsed,
    refreshItem, restoreItem, deleteItem, archiveItem, unarchiveItem,
} from '../state.js';
import {
    escapeHtml, urgency, urgencyClass, daysUntilNext, formatDPlus,
    cycleProgress, formatCycleDisplay, todayIso,
} from '../helpers.js';
import { openCrudModal } from '../modal.js';
import { showUndoToast } from '../toast.js';

const ARCHIVE_SECTION = '__archived';

export function render(root) {
    const tags = visibleTags();
    const itemsAll = visibleItems();
    const items = filterItems(itemsAll).slice();
    const archived = filterItems(archivedItems()).slice();
    const archiveCollapsed = !state.collapsed.has(ARCHIVE_SECTION);

    // README §V1 sort: urgency desc → daysUntilNext asc → elapsed desc
    const today = new Date();
    items.sort((a, b) => {
        const ua = urgency(a, today), ub = urgency(b, today);
        if (ua !== ub) return ub - ua;
        const da = daysUntilNext(a, today), db = daysUntilNext(b, today);
        const dav = da === null ? Infinity : da;
        const dbv = db === null ? Infinity : db;
        return dav - dbv;
    });

    // Archived: most recently archived first
    archived.sort((a, b) => (b.archivedAt || '').localeCompare(a.archivedAt || ''));

    const overdue = items.filter(it => urgency(it, today) === 3).length;
    const soon = items.filter(it => urgency(it, today) === 2).length;

    root.innerHTML = `
        <div class="v1-tag-rail" role="toolbar" aria-label="태그 필터">
            <button type="button" class="dday-tag ${state.filter.tags.size === 0 ? 'is-active' : ''}" data-tag-id="">
                전체 <span class="dday-tag-count">${itemsAll.length}</span>
            </button>
            ${tags.map(t => {
                const n = itemsAll.filter(it => (it.tags || []).includes(t.id)).length;
                if (n === 0) return '';
                const active = state.filter.tags.has(t.id);
                return `
                    <button type="button" class="dday-tag ${active ? 'is-active' : ''}" data-tag-id="${t.id}">
                        <span class="dday-tag-dot" style="background:${t.color}"></span>
                        ${escapeHtml(t.label)} <span class="dday-tag-count">${n}</span>
                    </button>
                `;
            }).join('')}
        </div>

        <div class="v1-col-header">
            <div>항목</div>
            <div>태그</div>
            <div>경과</div>
            <div>다음 주기</div>
            <div></div>
        </div>

        <div class="v1-list">
            ${items.length === 0
                ? `<div class="dday-empty"><div class="emoji">⏳</div><p>표시할 항목이 없어요.</p></div>`
                : items.map(it => row(it, tags, today)).join('')}
        </div>

        ${archived.length > 0 ? `
            <section class="v1-archive ${archiveCollapsed ? 'is-collapsed' : ''}" data-section-id="${ARCHIVE_SECTION}">
                <button type="button" class="v1-archive-header" data-action="toggle-archive">
                    <span class="v1-archive-arrow">▼</span>
                    <span class="v1-archive-title">📦 보관함</span>
                    <span class="dday-tag-count">${archived.length}</span>
                </button>
                <div class="v1-archive-body">
                    ${archived.map(it => archivedRow(it, tags, today)).join('')}
                </div>
            </section>
        ` : ''}

        <div class="v1-footer">
            <span>지난 <strong>${overdue}</strong></span>
            <span>곧 다가옴 <strong>${soon}</strong></span>
            <span>표시 ${items.length} / 전체 ${itemsAll.length}${archived.length > 0 ? ` · 보관 ${archived.length}` : ''}</span>
        </div>
    `;

    // Tag rail
    root.querySelectorAll('.v1-tag-rail .dday-tag').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.tagId;
            if (id === '') clearFilterTags();
            else toggleFilterTag(id);
        });
    });

    // Row click → edit. Action buttons stop propagation.
    root.querySelectorAll('.dday-row[data-item-id]').forEach(rowEl => {
        rowEl.addEventListener('click', () => {
            const id = rowEl.dataset.itemId;
            const it = state.items.find(i => i.id === id);
            if (it) openCrudModal(it);
        });
    });

    root.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            if (action === 'toggle-archive') {
                toggleCollapsed(ARCHIVE_SECTION);
                return;
            }
            const id = btn.dataset.itemId;
            const it = state.items.find(i => i.id === id);
            if (!it) return;
            if (action === 'refresh') {
                const prev = refreshItem(id, todayIso());
                showUndoToast(`${it.name} 리프레시됨`, () => restoreItem(prev));
            } else if (action === 'delete') {
                const prev = deleteItem(id);
                showUndoToast(`${prev.name || '항목'} 삭제됨`, () => restoreItem(prev));
            } else if (action === 'archive') {
                const prev = archiveItem(id);
                showUndoToast(`${prev.name || '항목'} 보관됨`, () => restoreItem(prev));
            } else if (action === 'unarchive') {
                const prev = unarchiveItem(id);
                showUndoToast(`${prev.name || '항목'} 복원됨`, () => restoreItem(prev));
            }
        });
    });
}

function row(item, tags, today) {
    const u = urgency(item, today);
    const cls = urgencyClass(u);
    const dn = daysUntilNext(item, today);
    const progress = cycleProgress(item, today);
    const progressPct = progress === null ? 0 : Math.min(100, progress * 100);

    const tagChips = (item.tags || []).slice(0, 3).map(tid => {
        const t = tags.find(x => x.id === tid);
        if (!t) return '';
        return `<span class="dday-tag" style="pointer-events:none;"><span class="dday-tag-dot" style="background:${t.color}"></span>${escapeHtml(t.label)}</span>`;
    }).join('');

    const cycleLabel = (item.cycleNum && item.cycleUnit)
        ? formatCycleDisplay(item.cycleNum, item.cycleUnit) : '—';

    const remainText = dn === null ? '주기 없음'
        : dn <= 0 ? `${Math.abs(dn)}일 지남`
        : `${dn}일 남음`;

    return `
        <div class="dday-row" data-item-id="${item.id}" role="button" tabindex="0">
            <div class="v1-title">
                <span class="dday-urgency-dot ${cls}"></span>
                <div class="v1-title-text">
                    <strong>${escapeHtml(item.name)}</strong>
                    <span class="dday-mono">${escapeHtml(item.lastDate)} · ${formatDPlus(item, today)}</span>
                </div>
            </div>
            <div class="v1-tags-inline">${tagChips || '<span class="dday-hint">—</span>'}</div>
            <div class="dday-mono">${cycleLabel}</div>
            <div class="v1-track-wrap">
                <div class="dday-track ${cls}">
                    <div class="fill" style="--progress:${progressPct}%; width:${progressPct}%;"></div>
                </div>
                <div class="v1-track-meta ${cls}"><span>${remainText}</span></div>
            </div>
            <div class="v1-actions">
                <button class="dday-btn icon" data-action="refresh" data-item-id="${item.id}" title="리프레시">↻</button>
                <button class="dday-btn icon" data-action="archive" data-item-id="${item.id}" title="보관">📦</button>
                <button class="dday-btn icon" data-action="delete" data-item-id="${item.id}" title="삭제">×</button>
            </div>
        </div>
    `;
}

function archivedRow(item, tags, today) {
    const tagChips = (item.tags || []).slice(0, 3).map(tid => {
        const t = tags.find(x => x.id === tid);
        if (!t) return '';
        return `<span class="dday-tag" style="pointer-events:none;"><span class="dday-tag-dot" style="background:${t.color}"></span>${escapeHtml(t.label)}</span>`;
    }).join('');

    return `
        <div class="dday-row v1-archived-row" data-item-id="${item.id}" role="button" tabindex="0">
            <div class="v1-title">
                <span class="dday-urgency-dot"></span>
                <div class="v1-title-text">
                    <strong>${escapeHtml(item.name)}</strong>
                    <span class="dday-mono">${escapeHtml(item.lastDate)}</span>
                </div>
            </div>
            <div class="v1-tags-inline">${tagChips || '<span class="dday-hint">—</span>'}</div>
            <div class="dday-mono dday-hint">보관됨</div>
            <div class="v1-track-wrap"><div class="v1-track-meta"><span class="dday-hint">${item.archivedAt ? escapeHtml(item.archivedAt.slice(0, 10)) : ''}</span></div></div>
            <div class="v1-actions">
                <button class="dday-btn icon" data-action="unarchive" data-item-id="${item.id}" title="복원">↺</button>
                <button class="dday-btn icon" data-action="delete" data-item-id="${item.id}" title="삭제">×</button>
            </div>
        </div>
    `;
}
