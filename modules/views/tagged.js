// V2 — Tag sections (multi-tag aware) + HTML5 drag for tag re-grouping.
import {
    state, visibleItems, visibleTags, filterItems, toggleCollapsed,
    moveItemTag, toggleItemTag,
} from '../state.js';
import {
    escapeHtml, urgency, urgencyClass, daysUntilNext, formatDPlus,
    cycleProgress, formatCycleDisplay,
} from '../helpers.js';
import { openCrudModal } from '../modal.js';

const NO_TAG = '__notag';

export function render(root) {
    const tags = visibleTags();
    const items = filterItems(visibleItems());
    const today = new Date();

    // Group items by tag. An item with multiple tags appears in each section.
    const groups = new Map();
    tags.forEach(t => groups.set(t.id, []));
    groups.set(NO_TAG, []);

    items.forEach(it => {
        const itemTags = (it.tags || []).filter(tid => tags.find(t => t.id === tid));
        if (itemTags.length === 0) {
            groups.get(NO_TAG).push(it);
        } else {
            itemTags.forEach(tid => {
                if (groups.has(tid)) groups.get(tid).push(it);
            });
        }
    });

    const sectionsHtml = [
        ...tags.map(t => section(t.id, t.label, t.color, groups.get(t.id) || [], tags, today)),
        section(NO_TAG, '태그 없음', '#8a8f98', groups.get(NO_TAG) || [], tags, today),
    ].join('');

    root.innerHTML = items.length === 0
        ? `<div class="dday-empty"><div class="emoji">⏳</div><p>표시할 항목이 없어요.</p></div>`
        : sectionsHtml;

    // Section toggle
    root.querySelectorAll('.v2-section-header').forEach(h => {
        h.addEventListener('click', () => {
            const id = h.parentElement.dataset.sectionId;
            toggleCollapsed(id);
        });
    });

    // Card click → edit
    root.querySelectorAll('.v2-card[data-item-id]').forEach(c => {
        c.addEventListener('click', (e) => {
            // Don't trigger after a drag
            if (c.classList.contains('was-dragged')) {
                c.classList.remove('was-dragged');
                return;
            }
            const id = c.dataset.itemId;
            const it = state.items.find(i => i.id === id);
            if (it) openCrudModal(it);
        });
    });

    // Drag and drop
    wireDragDrop(root);
}

function section(sectionId, label, color, items, allTags, today) {
    const collapsed = state.collapsed.has(sectionId);
    const overdueN = items.filter(it => urgency(it, today) === 3).length;
    return `
        <section class="v2-section ${collapsed ? 'is-collapsed' : ''}" data-section-id="${sectionId}" data-tag-id="${sectionId}">
            <header class="v2-section-header">
                <span class="v2-section-arrow">▼</span>
                <span class="dday-tag-dot" style="background:${color}"></span>
                <h3>${escapeHtml(label)}</h3>
                <span class="count">${items.length}</span>
                ${overdueN > 0 ? `<span class="overdue-badge">${overdueN} 지남</span>` : ''}
            </header>
            <div class="v2-section-body">
                ${items.length === 0
                    ? '<p class="dday-hint" style="grid-column: 1/-1;">없음</p>'
                    : items.map(it => card(it, sectionId, allTags, today)).join('')}
            </div>
        </section>
    `;
}

function card(item, sectionTagId, allTags, today) {
    const u = urgency(item, today);
    const cls = urgencyClass(u);
    const otherTags = (item.tags || []).filter(tid => tid !== sectionTagId);
    const otherTagChips = otherTags.slice(0, 3).map(tid => {
        const t = allTags.find(x => x.id === tid);
        if (!t) return '';
        return `<span class="dday-tag" style="pointer-events:none;"><span class="dday-tag-dot" style="background:${t.color}"></span>${escapeHtml(t.label)}</span>`;
    }).join('');
    const dn = daysUntilNext(item, today);
    const progress = cycleProgress(item, today);
    const progressPct = progress === null ? 0 : Math.min(100, progress * 100);
    const cycleLabel = (item.cycleNum && item.cycleUnit)
        ? formatCycleDisplay(item.cycleNum, item.cycleUnit) : '주기 없음';
    const remain = dn === null ? '' : dn <= 0 ? `${Math.abs(dn)}일 지남` : `${dn}일 남음`;

    return `
        <article class="dday-card v2-card"
                 data-item-id="${item.id}"
                 data-from-tag="${sectionTagId}"
                 draggable="true">
            <div class="v2-card-head">
                <strong>${escapeHtml(item.name)}</strong>
                <span class="v2-card-dplus ${cls}">${formatDPlus(item, today)}</span>
            </div>
            ${otherTagChips ? `<div class="v2-card-tags">${otherTagChips}</div>` : ''}
            <div class="v2-card-foot">
                <div class="dday-track ${cls}">
                    <div class="fill" style="--progress:${progressPct}%; width:${progressPct}%;"></div>
                </div>
                <div class="v2-card-meta">
                    <span>${escapeHtml(cycleLabel)} · ${escapeHtml(item.lastDate)}</span>
                    <span class="${cls}">${remain}</span>
                </div>
            </div>
        </article>
    `;
}

// --- Drag & Drop ------------------------------------------------------------

function wireDragDrop(root) {
    let draggingCard = null;
    let draggingFromTag = null;
    let draggingId = null;

    root.querySelectorAll('.v2-card').forEach(card => {
        card.addEventListener('dragstart', (e) => {
            draggingCard = card;
            draggingFromTag = card.dataset.fromTag;
            draggingId = card.dataset.itemId;
            card.classList.add('is-dragging');
            try {
                e.dataTransfer.setData('text/plain', JSON.stringify({ id: draggingId, from: draggingFromTag }));
                e.dataTransfer.effectAllowed = 'copyMove';
            } catch {}
        });
        card.addEventListener('dragend', () => {
            if (draggingCard) draggingCard.classList.remove('is-dragging');
            // Defer flag so the trailing click doesn't reopen modal
            if (draggingCard) {
                draggingCard.classList.add('was-dragged');
                setTimeout(() => draggingCard?.classList.remove('was-dragged'), 50);
            }
            draggingCard = null;
            draggingFromTag = null;
            draggingId = null;
            root.querySelectorAll('.is-drop-target').forEach(s => s.classList.remove('is-drop-target'));
        });
    });

    root.querySelectorAll('.v2-section').forEach(section => {
        section.addEventListener('dragover', (e) => {
            if (!draggingId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = e.shiftKey ? 'copy' : 'move';
            section.classList.add('is-drop-target');
        });
        section.addEventListener('dragleave', (e) => {
            if (!section.contains(e.relatedTarget)) section.classList.remove('is-drop-target');
        });
        section.addEventListener('drop', (e) => {
            e.preventDefault();
            section.classList.remove('is-drop-target');
            const toTag = section.dataset.tagId;
            if (!draggingId || !toTag || toTag === draggingFromTag) return;

            if (toTag === NO_TAG) {
                // Drop on "태그 없음" → remove only the from-tag
                if (draggingFromTag && draggingFromTag !== NO_TAG) {
                    toggleItemTag(draggingId, draggingFromTag, 'remove');
                }
                return;
            }

            const isCopy = e.shiftKey;
            if (isCopy) {
                toggleItemTag(draggingId, toTag, 'add');
            } else {
                if (draggingFromTag && draggingFromTag !== NO_TAG) {
                    moveItemTag(draggingId, draggingFromTag, toTag);
                } else {
                    // Dragging from "태그 없음" with no source tag → just add
                    toggleItemTag(draggingId, toTag, 'add');
                }
            }
        });
    });
}
