// Modal manager — CRUD modal, tag-manager modal, help modal.
// Uses .is-open toggle pattern + window click-outside (preserves legacy UX).
import {
    state, getItem, addItem, updateItem, deleteItem, restoreItem,
    archiveItem, unarchiveItem,
    addTag, updateTag, deleteTag, visibleTags,
} from './state.js';
import { escapeHtml, todayIso, TAG_COLOR_PALETTE } from './helpers.js';
import { suggestCycleDays } from './ai.js';
import { showUndoToast } from './toast.js';

const HOST_ID = 'modalHost';

function host() {
    let el = document.getElementById(HOST_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = HOST_ID;
    document.body.appendChild(el);
    return el;
}

function close() {
    document.querySelectorAll('.dday-modal.is-open').forEach(m => m.classList.remove('is-open'));
    host().innerHTML = '';
}

function attachOutsideClose(modalEl) {
    modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) close();
    });
    document.addEventListener('keydown', escListener);
}

function escListener(e) {
    if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', escListener);
    }
}

// --- CRUD modal -------------------------------------------------------------

export function openCrudModal(itemOrNull) {
    const isEdit = !!itemOrNull;
    const item = itemOrNull || {};
    const tags = visibleTags();
    const selectedTagIds = new Set(item.tags || []);

    const html = `
        <div class="dday-modal is-open" id="crudModal" aria-modal="true" role="dialog">
            <div class="dday-modal-content">
                <header class="dday-modal-header">
                    <h2>${isEdit ? '항목 수정' : '새 항목 추가'}</h2>
                    <button class="dday-modal-close" data-action="close" aria-label="닫기">&times;</button>
                </header>

                <form id="crudForm">
                    <div class="dday-form-row">
                        <label for="crudName">제목</label>
                        <input id="crudName" class="dday-input" type="text" placeholder="어떤 일을 하셨나요?" required value="${escapeHtml(item.name || '')}">
                    </div>

                    <div class="dday-form-row">
                        <label for="crudDate">마지막 날짜</label>
                        <input id="crudDate" class="dday-input" type="date" required value="${escapeHtml(item.lastDate || todayIso())}">
                    </div>

                    <div class="dday-form-row">
                        <label>이상적인 주기 (선택)</label>
                        <div class="dday-cycle-row">
                            <input id="crudCycleNum" class="dday-input" type="number" min="1" placeholder="숫자" value="${escapeHtml(item.cycleNum || '')}">
                            <select id="crudCycleUnit" class="dday-select">
                                <option value="">단위</option>
                                <option value="day" ${item.cycleUnit === 'day' ? 'selected' : ''}>일</option>
                                <option value="week" ${item.cycleUnit === 'week' ? 'selected' : ''}>주</option>
                                <option value="month" ${item.cycleUnit === 'month' ? 'selected' : ''}>월</option>
                            </select>
                        </div>
                        <div class="dday-hint" id="cycleSuggestion"></div>
                    </div>

                    <div class="dday-form-row">
                        <label>태그</label>
                        <div class="dday-tag-picker" id="crudTagPicker">
                            ${tags.map(t => `
                                <button type="button" class="dday-tag ${selectedTagIds.has(t.id) ? 'is-active' : ''}" data-tag-id="${t.id}">
                                    <span class="dday-tag-dot" style="background:${t.color}"></span>
                                    ${escapeHtml(t.label)}
                                </button>
                            `).join('')}
                            ${tags.length === 0 ? '<span class="dday-hint">태그가 없습니다. 우측 상단 ⚙ 에서 추가하세요.</span>' : ''}
                        </div>
                    </div>

                    <div class="dday-form-actions">
                        ${isEdit ? '<button type="button" class="dday-btn ghost danger" data-action="delete">삭제</button>' : ''}
                        ${isEdit ? (item.archivedAt
                            ? '<button type="button" class="dday-btn ghost" data-action="unarchive">↺ 복원</button>'
                            : '<button type="button" class="dday-btn ghost" data-action="archive">📦 보관</button>') : ''}
                        <button type="button" class="dday-btn ghost" data-action="close">취소</button>
                        <button type="submit" class="dday-btn">${isEdit ? '저장' : '추가'}</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    host().innerHTML = html;
    const modal = document.getElementById('crudModal');
    attachOutsideClose(modal);

    modal.querySelectorAll('[data-action="close"]').forEach(b => b.addEventListener('click', close));
    if (isEdit) {
        modal.querySelector('[data-action="delete"]').addEventListener('click', () => {
            const prev = deleteItem(item.id);
            close();
            showUndoToast(`${prev.name || '항목'} 삭제됨`, () => restoreItem(prev));
        });
        const archiveBtn = modal.querySelector('[data-action="archive"]');
        if (archiveBtn) {
            archiveBtn.addEventListener('click', () => {
                const prev = archiveItem(item.id);
                close();
                showUndoToast(`${prev.name || '항목'} 보관됨`, () => restoreItem(prev));
            });
        }
        const unarchiveBtn = modal.querySelector('[data-action="unarchive"]');
        if (unarchiveBtn) {
            unarchiveBtn.addEventListener('click', () => {
                const prev = unarchiveItem(item.id);
                close();
                showUndoToast(`${prev.name || '항목'} 복원됨`, () => restoreItem(prev));
            });
        }
    }

    // Tag picker toggles
    modal.querySelectorAll('#crudTagPicker .dday-tag').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('is-active');
            const id = btn.dataset.tagId;
            if (selectedTagIds.has(id)) selectedTagIds.delete(id);
            else selectedTagIds.add(id);
        });
    });

    // Cycle suggestion (only when editing existing item with history)
    if (isEdit && Array.isArray(item.history) && item.history.length >= 3) {
        const suggested = suggestCycleDays(item.history);
        const hint = document.getElementById('cycleSuggestion');
        if (suggested && hint) {
            hint.innerHTML = `과거 평균 간격 <strong>${suggested}일</strong>`;
        }
    }

    const form = document.getElementById('crudForm');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('crudName').value.trim();
        const lastDate = document.getElementById('crudDate').value;
        const cycleNumRaw = document.getElementById('crudCycleNum').value;
        const cycleUnit = document.getElementById('crudCycleUnit').value;
        if (!name || !lastDate) return;

        const tagIds = [...selectedTagIds];
        const payload = {
            name,
            lastDate,
            tags: tagIds,
            cycleNum: cycleNumRaw ? parseInt(cycleNumRaw, 10) : undefined,
            cycleUnit: cycleUnit || undefined,
        };

        if (isEdit) {
            // For edit: explicitly clear cycle when user blanked it
            updateItem(item.id, {
                name: payload.name,
                lastDate: payload.lastDate,
                tags: payload.tags,
                cycleNum: payload.cycleNum ?? null,
                cycleUnit: payload.cycleUnit ?? null,
            });
        } else {
            addItem({
                name: payload.name,
                lastDate: payload.lastDate,
                tags: payload.tags,
                cycleNum: payload.cycleNum,
                cycleUnit: payload.cycleUnit,
            });
        }
        close();
    });

    setTimeout(() => document.getElementById('crudName').focus(), 30);
}

// --- Tag manager modal ------------------------------------------------------

export function openTagManagerModal() {
    const tags = visibleTags();

    const html = `
        <div class="dday-modal is-open" id="tagModal" aria-modal="true" role="dialog">
            <div class="dday-modal-content">
                <header class="dday-modal-header">
                    <h2>태그 관리</h2>
                    <button class="dday-modal-close" data-action="close" aria-label="닫기">&times;</button>
                </header>

                <div id="tagList">
                    ${tags.map(t => tagRowHtml(t)).join('')}
                    ${tags.length === 0 ? '<p class="dday-hint">태그가 없습니다. 아래에서 추가하세요.</p>' : ''}
                </div>

                <hr class="dday-divider">

                <form id="newTagForm">
                    <div class="dday-form-row">
                        <label>새 태그</label>
                        <div style="display:flex; gap:8px;">
                            <input id="newTagLabel" class="dday-input" type="text" placeholder="태그 이름" required>
                        </div>
                        <div class="dday-color-picker" id="newTagColor">
                            ${TAG_COLOR_PALETTE.map((c, i) => `
                                <button type="button" class="${i === 0 ? 'is-selected' : ''}" style="background:${c}" data-color="${c}"></button>
                            `).join('')}
                        </div>
                    </div>
                    <div class="dday-form-actions">
                        <button type="button" class="dday-btn ghost" data-action="close">닫기</button>
                        <button type="submit" class="dday-btn">+ 추가</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    host().innerHTML = html;
    const modal = document.getElementById('tagModal');
    attachOutsideClose(modal);
    modal.querySelectorAll('[data-action="close"]').forEach(b => b.addEventListener('click', close));

    wireTagListHandlers();

    // New tag color picker
    const colorPicker = document.getElementById('newTagColor');
    let selectedColor = TAG_COLOR_PALETTE[0];
    colorPicker.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-color]');
        if (!btn) return;
        colorPicker.querySelectorAll('button').forEach(b => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        selectedColor = btn.dataset.color;
    });

    document.getElementById('newTagForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const label = document.getElementById('newTagLabel').value.trim();
        if (!label) return;
        addTag({ label, color: selectedColor });
        // Re-render tag list inline
        const tagList = document.getElementById('tagList');
        tagList.innerHTML = visibleTags().map(t => tagRowHtml(t)).join('');
        wireTagListHandlers();
        document.getElementById('newTagLabel').value = '';
    });
}

function tagRowHtml(t) {
    return `
        <div class="dday-tag-row" data-tag-id="${t.id}">
            <button type="button" class="dday-color-swatch" data-action="color" style="background:${t.color}" aria-label="색상 변경"></button>
            <input class="dday-input" type="text" value="${escapeHtml(t.label)}" data-action="label">
            <span class="dday-mono">${(state.items.filter(it => !it.deletedAt && !it.archivedAt && (it.tags || []).includes(t.id))).length} 항목</span>
            <button type="button" class="dday-btn icon" data-action="delete" title="삭제">×</button>
        </div>
    `;
}

function wireTagListHandlers() {
    const tagList = document.getElementById('tagList');
    if (!tagList) return;

    tagList.querySelectorAll('.dday-tag-row').forEach(row => {
        const id = row.dataset.tagId;
        const labelInput = row.querySelector('[data-action="label"]');
        const colorBtn = row.querySelector('[data-action="color"]');
        const delBtn = row.querySelector('[data-action="delete"]');

        labelInput.addEventListener('change', () => {
            const v = labelInput.value.trim();
            if (v) updateTag(id, { label: v });
        });

        colorBtn.addEventListener('click', () => {
            openColorPickerPopover(colorBtn, (color) => {
                updateTag(id, { color });
                colorBtn.style.background = color;
            });
        });

        delBtn.addEventListener('click', () => {
            const count = state.items.filter(it => !it.deletedAt && !it.archivedAt && (it.tags || []).includes(id)).length;
            if (count > 0) {
                if (!confirm(`이 태그는 ${count}개 항목에 사용 중입니다. 정말 삭제할까요? 해당 항목들에서 태그가 자동 제거됩니다.`)) return;
            }
            deleteTag(id);
            const tagList = document.getElementById('tagList');
            tagList.innerHTML = visibleTags().map(t => tagRowHtml(t)).join('');
            wireTagListHandlers();
        });
    });
}

function openColorPickerPopover(anchor, onPick) {
    const existing = document.getElementById('colorPopover');
    if (existing) existing.remove();
    const rect = anchor.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.id = 'colorPopover';
    pop.className = 'dday-card';
    pop.style.cssText = `position:fixed; top:${rect.bottom + 6}px; left:${rect.left}px; z-index:300; padding:8px;`;
    pop.innerHTML = `<div class="dday-color-picker">${TAG_COLOR_PALETTE.map(c => `<button type="button" style="background:${c}" data-color="${c}"></button>`).join('')}</div>`;
    document.body.appendChild(pop);
    pop.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-color]');
        if (!btn) return;
        onPick(btn.dataset.color);
        pop.remove();
    });
    setTimeout(() => {
        const off = (e) => {
            if (!pop.contains(e.target)) {
                pop.remove();
                document.removeEventListener('click', off);
            }
        };
        document.addEventListener('click', off);
    }, 0);
}

// --- Help modal -------------------------------------------------------------

export function openHelpModal() {
    const html = `
        <div class="dday-modal is-open" id="helpModal" aria-modal="true" role="dialog">
            <div class="dday-modal-content">
                <header class="dday-modal-header">
                    <h2>사용 설명서</h2>
                    <button class="dday-modal-close" data-action="close" aria-label="닫기">&times;</button>
                </header>

                <section style="margin-bottom:24px;">
                    <h3 style="font-size:14px; margin:0 0 8px;">📝 항목 추가/수정</h3>
                    <p style="font-size:13px; color:var(--ink-muted); line-height:1.55;">우상단 <strong>+ 새 항목</strong> 으로 추가, 행/카드 클릭으로 수정. 한 항목에 여러 태그를 붙일 수 있습니다.</p>
                </section>

                <section style="margin-bottom:24px;">
                    <h3 style="font-size:14px; margin:0 0 8px;">🔭 5가지 뷰</h3>
                    <ul style="font-size:13px; color:var(--ink-muted); line-height:1.55; padding-left:18px; margin:0;">
                        <li><strong>대시보드:</strong> 오늘 할 일 + 통계 요약</li>
                        <li><strong>리스트:</strong> 임박순 한 줄 리스트</li>
                        <li><strong>태그:</strong> 태그별 섹션 (멀티태그 항목은 여러 섹션에 등장)</li>
                        <li><strong>타임라인 / 캘린더:</strong> 시각화 (데스크탑 전용)</li>
                    </ul>
                </section>

                <section style="margin-bottom:24px;">
                    <h3 style="font-size:14px; margin:0 0 8px;">🎯 임박도 색상</h3>
                    <ul style="font-size:13px; color:var(--ink-muted); line-height:1.55; padding-left:18px; margin:0;">
                        <li><span style="color:var(--danger);">●</span> 빨강 — 주기 지남</li>
                        <li><span style="color:var(--warning);">●</span> 주황 — 3일 이내</li>
                        <li><span style="color:var(--success);">●</span> 초록 — 여유</li>
                    </ul>
                </section>

                <section style="margin-bottom:24px;">
                    <h3 style="font-size:14px; margin:0 0 8px;">↔ 드래그</h3>
                    <p style="font-size:13px; color:var(--ink-muted); line-height:1.55;">태그 뷰에서 카드를 다른 섹션으로 드래그하면 태그가 이동합니다 (Shift+드래그 = 태그 추가).</p>
                </section>

                <section style="margin-bottom:24px;">
                    <h3 style="font-size:14px; margin:0 0 8px;">☁️ 동기화 & 알림</h3>
                    <p style="font-size:13px; color:var(--ink-muted); line-height:1.55;">우상단 🔐 로그인 후 여러 기기 자동 동기화. 주기 도달 시 매일 오전 9시(KST) 푸시 알림.</p>
                </section>
            </div>
        </div>
    `;
    host().innerHTML = html;
    const modal = document.getElementById('helpModal');
    attachOutsideClose(modal);
    modal.querySelectorAll('[data-action="close"]').forEach(b => b.addEventListener('click', close));
}

// Notification toggle helper, exposed for topbar
export const closeModal = close;
