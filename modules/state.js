// Centralized state + pub/sub + localStorage persistence + idempotent migration.
import { DEFAULT_TAGS, nowIso, uid } from './helpers.js';

const KEY_ITEMS = 'myActivities';            // legacy — preserved
const KEY_TAGS = 'trace.tags';
const KEY_VIEW = 'trace.view';
const KEY_FILTER = 'trace.filter';
const KEY_COLLAPSED = 'trace.collapsed';
const KEY_TAGS_SEEDED = 'tagsSeeded';
const KEY_SORT = 'sortSettings';             // legacy — preserved

function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn('localStorage write failed', key, e);
    }
}

// --- Migration (idempotent, runs once at module load) -----------------------

function migrate() {
    // 1) Ensure every item has id, updatedAt, tags array
    const items = readJson(KEY_ITEMS, []) || [];
    let itemsChanged = false;
    const migratedItems = items.map(it => {
        const out = { ...it };
        if (!out.id) { out.id = uid(); itemsChanged = true; }
        if (!out.updatedAt) { out.updatedAt = nowIso(); itemsChanged = true; }
        if (!Array.isArray(out.tags)) { out.tags = []; itemsChanged = true; }
        return out;
    });
    if (itemsChanged) writeJson(KEY_ITEMS, migratedItems);

    // 2) Seed default tags (once, then never again — `tagsSeeded` flag)
    const existingTags = readJson(KEY_TAGS, null);
    const seeded = localStorage.getItem(KEY_TAGS_SEEDED) === '1';
    let tags;
    if (Array.isArray(existingTags)) {
        tags = existingTags;
    } else if (!seeded) {
        const now = nowIso();
        tags = DEFAULT_TAGS.map((t, i) => ({ ...t, order: i, createdAt: now, updatedAt: now }));
        writeJson(KEY_TAGS, tags);
        localStorage.setItem(KEY_TAGS_SEEDED, '1');
    } else {
        tags = [];
    }

    return { items: migratedItems, tags };
}

const { items: initialItems, tags: initialTags } = migrate();

// --- State ------------------------------------------------------------------

export const state = {
    items: initialItems,
    tags: initialTags,
    view: localStorage.getItem(KEY_VIEW) || 'dashboard',
    filter: {
        query: (readJson(KEY_FILTER, {}) || {}).query || '',
        tags: new Set((readJson(KEY_FILTER, {}) || {}).tags || []),
    },
    collapsed: new Set(readJson(KEY_COLLAPSED, []) || []),
    sort: readJson(KEY_SORT, { type: 'auto', order: 'desc' }),
    user: null,
    syncStatus: 'offline',
    undoStack: [],
};

// --- Pub/sub ----------------------------------------------------------------

const listeners = new Set();
export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
export function notify() {
    listeners.forEach(fn => {
        try { fn(state); } catch (e) { console.error('listener failed', e); }
    });
}

// --- Persist ----------------------------------------------------------------

let syncPushItems = null;
let syncPushTags = null;
export function configureSyncPush({ pushItems, pushTags }) {
    syncPushItems = pushItems || null;
    syncPushTags = pushTags || null;
}

export function persistItems({ skipPush = false } = {}) {
    writeJson(KEY_ITEMS, state.items);
    if (!skipPush && syncPushItems) syncPushItems(state.items);
}

export function persistTags({ skipPush = false } = {}) {
    writeJson(KEY_TAGS, state.tags);
    if (!skipPush && syncPushTags) syncPushTags(state.tags);
}

export function persistView() { localStorage.setItem(KEY_VIEW, state.view); }
export function persistFilter() {
    writeJson(KEY_FILTER, { query: state.filter.query, tags: [...state.filter.tags] });
}
export function persistCollapsed() { writeJson(KEY_COLLAPSED, [...state.collapsed]); }
export function persistSort() { writeJson(KEY_SORT, state.sort); }

// --- Mutators ---------------------------------------------------------------

function touch(item) { item.updatedAt = nowIso(); }

export function visibleItems() {
    return state.items.filter(a => !a.deletedAt);
}

export function visibleTags() {
    return state.tags
        .filter(t => !t.deletedAt)
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function getItem(id) {
    return state.items.find(it => it.id === id) || null;
}

export function getTag(id) {
    return state.tags.find(t => t.id === id) || null;
}

export function addItem({ name, lastDate, cycleNum, cycleUnit, tags = [] }) {
    const item = {
        id: uid(),
        name,
        lastDate,
        history: [lastDate],
        tags: [...tags],
        updatedAt: nowIso(),
    };
    if (cycleNum && cycleUnit) {
        item.cycleNum = parseInt(cycleNum, 10);
        item.cycleUnit = cycleUnit;
    }
    state.items.push(item);
    persistItems();
    notify();
    return item;
}

export function updateItem(id, patch) {
    const item = getItem(id);
    if (!item) return null;
    Object.assign(item, patch);
    touch(item);
    persistItems();
    notify();
    return item;
}

export function refreshItem(id, targetDate) {
    const item = getItem(id);
    if (!item) return null;
    const prev = structuredClone(item);
    item.lastDate = targetDate;
    if (!Array.isArray(item.history)) item.history = [];
    item.history.push(targetDate);
    touch(item);
    persistItems();
    notify();
    return prev;
}

export function deleteItem(id) {
    const item = getItem(id);
    if (!item) return null;
    const prev = structuredClone(item);
    item.deletedAt = nowIso();
    touch(item);
    persistItems();
    notify();
    return prev;
}

export function restoreItem(prev) {
    if (!prev) return;
    const idx = state.items.findIndex(it => it.id === prev.id);
    if (idx >= 0) state.items[idx] = prev;
    else state.items.push(prev);
    persistItems();
    notify();
}

// --- Tag mutators -----------------------------------------------------------

function touchTag(tag) { tag.updatedAt = nowIso(); }

export function addTag({ label, color }) {
    const id = uid();
    const tag = { id, label, color, order: state.tags.length, createdAt: nowIso(), updatedAt: nowIso() };
    state.tags.push(tag);
    persistTags();
    notify();
    return tag;
}

export function updateTag(id, patch) {
    const tag = getTag(id);
    if (!tag) return null;
    Object.assign(tag, patch);
    touchTag(tag);
    persistTags();
    notify();
    return tag;
}

export function deleteTag(id) {
    const tag = getTag(id);
    if (!tag) return null;
    tag.deletedAt = nowIso();
    touchTag(tag);
    persistTags();
    // Cascade: remove this tagId from every item
    state.items.forEach(it => {
        if (Array.isArray(it.tags) && it.tags.includes(id)) {
            it.tags = it.tags.filter(t => t !== id);
            touch(it);
        }
    });
    persistItems();
    notify();
    return tag;
}

export function toggleItemTag(itemId, tagId, mode = 'toggle') {
    const item = getItem(itemId);
    if (!item) return;
    if (!Array.isArray(item.tags)) item.tags = [];
    const has = item.tags.includes(tagId);
    if (mode === 'add' && !has) item.tags.push(tagId);
    else if (mode === 'remove' && has) item.tags = item.tags.filter(t => t !== tagId);
    else if (mode === 'toggle') {
        item.tags = has ? item.tags.filter(t => t !== tagId) : [...item.tags, tagId];
    }
    touch(item);
    persistItems();
    notify();
}

// Move a tag association: drop `fromTag`, add `toTag`. Used by V2 drag (move).
export function moveItemTag(itemId, fromTag, toTag) {
    const item = getItem(itemId);
    if (!item) return;
    if (!Array.isArray(item.tags)) item.tags = [];
    let next = item.tags.filter(t => t !== fromTag);
    if (!next.includes(toTag)) next.push(toTag);
    item.tags = next;
    touch(item);
    persistItems();
    notify();
}

// --- View / filter ----------------------------------------------------------

export function setView(view) {
    state.view = view;
    persistView();
    notify();
}

export function setFilterQuery(q) {
    state.filter.query = q;
    persistFilter();
    notify();
}

export function toggleFilterTag(tagId) {
    if (state.filter.tags.has(tagId)) state.filter.tags.delete(tagId);
    else state.filter.tags.add(tagId);
    persistFilter();
    notify();
}

export function clearFilterTags() {
    state.filter.tags.clear();
    persistFilter();
    notify();
}

export function toggleCollapsed(sectionId) {
    if (state.collapsed.has(sectionId)) state.collapsed.delete(sectionId);
    else state.collapsed.add(sectionId);
    persistCollapsed();
    notify();
}

export function setSort(type, order) {
    state.sort = { type, order };
    persistSort();
    notify();
}

// --- Remote snapshots (cloud → local) ---------------------------------------

export function applyRemoteItems(remoteItems, mergeFn) {
    const merged = mergeFn(state.items, remoteItems);
    if (JSON.stringify(merged) === JSON.stringify(state.items)) return false;
    state.items = merged;
    persistItems({ skipPush: true });
    notify();
    return true;
}

export function applyRemoteTags(remoteTags, mergeFn) {
    const merged = mergeFn(state.tags, remoteTags);
    if (JSON.stringify(merged) === JSON.stringify(state.tags)) return false;
    state.tags = merged;
    persistTags({ skipPush: true });
    notify();
    return true;
}

export function setUser(user) {
    state.user = user;
    notify();
}

export function setSyncStatus(status) {
    state.syncStatus = status;
    notify();
}

// --- Derived helpers --------------------------------------------------------

export function filterItems(items) {
    const q = (state.filter.query || '').trim().toLowerCase();
    const tagFilter = state.filter.tags;
    return items.filter(it => {
        if (q && !it.name.toLowerCase().includes(q)) return false;
        if (tagFilter.size > 0) {
            const itemTags = it.tags || [];
            for (const t of tagFilter) if (!itemTags.includes(t)) return false;
        }
        return true;
    });
}
