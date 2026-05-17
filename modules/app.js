// Entry point — wires state, topbar, views, and (optional) Firebase sync.
import {
    state, subscribe, setView, setUser, setSyncStatus,
    applyRemoteItems, applyRemoteTags, configureSyncPush,
} from './state.js';
import { mountTopbar, refresh as refreshTopbar } from './topbar.js';
import { isMobileViewport } from './helpers.js';

const SWIPE_VIEWS = ['dashboard', 'list'];
const SWIPE_EXIT_MS = 160;
const SWIPE_ENTER_MS = 200;
let swipeBusy = false;

function animateViewSwitch(rootEl, dir, nextView) {
    if (swipeBusy) return;
    swipeBusy = true;
    const exitClass  = dir === 'next' ? 'view-exit-left'        : 'view-exit-right';
    const enterClass = dir === 'next' ? 'view-enter-from-right' : 'view-enter-from-left';
    rootEl.classList.add(exitClass);
    setTimeout(() => {
        rootEl.classList.remove(exitClass);
        setView(nextView);
        rootEl.classList.add(enterClass);
        setTimeout(() => {
            rootEl.classList.remove(enterClass);
            swipeBusy = false;
        }, SWIPE_ENTER_MS);
    }, SWIPE_EXIT_MS);
}

function setupSwipeNavigation(rootEl) {
    let startX = 0, startY = 0, tracking = false;
    rootEl.addEventListener('touchstart', (e) => {
        if (!isMobileViewport() || e.touches.length !== 1 || swipeBusy) { tracking = false; return; }
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        tracking = true;
    }, { passive: true });
    rootEl.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (Math.abs(dx) < 60 || Math.abs(dy) > 40) return;
        const idx = SWIPE_VIEWS.indexOf(state.view);
        if (idx === -1) return;
        if (dx < 0 && idx < SWIPE_VIEWS.length - 1) animateViewSwitch(rootEl, 'next', SWIPE_VIEWS[idx + 1]);
        else if (dx > 0 && idx > 0)                 animateViewSwitch(rootEl, 'prev', SWIPE_VIEWS[idx - 1]);
    }, { passive: true });
}

import * as ViewDashboard from './views/dashboard.js';
import * as ViewList from './views/list.js';
import * as ViewTagged from './views/tagged.js';
import * as ViewTimeline from './views/timeline.js';
import * as ViewCalendar from './views/calendar.js';

const VIEW_MAP = {
    dashboard: ViewDashboard,
    list: ViewList,
    tagged: ViewTagged,
    timeline: ViewTimeline,
    calendar: ViewCalendar,
};

export async function start() {
    // Lazy-load sync.js (it requires firebase-config.js; gracefully fall back)
    let sync = null;
    try {
        sync = await import('../sync.js');
    } catch (e) {
        console.warn('Sync disabled (firebase-config.js missing or invalid):', e.message);
    }

    // Mount UI
    const topbarRoot = document.getElementById('topbarRoot');
    const viewRoot = document.getElementById('viewRoot');
    mountTopbar(topbarRoot, { sync });

    // Initial mobile guard
    if (isMobileViewport() && (state.view === 'timeline' || state.view === 'calendar')) {
        setView('list');
    }

    function renderActiveView() {
        const mod = VIEW_MAP[state.view] || ViewList;
        try {
            mod.render(viewRoot);
        } catch (err) {
            console.error('view render failed', err);
            viewRoot.innerHTML = `<div class="dday-empty"><p>화면을 그리는 중 오류가 발생했어요.</p></div>`;
        }
    }

    subscribe(() => {
        refreshTopbar(state);
        renderActiveView();
    });

    // Wire sync — push + subscribe
    if (sync) {
        configureSyncPush({
            pushItems: (items) => {
                if (!state.user) return;
                setSyncStatus('syncing');
                sync.pushItemsDebounced(state.user.uid, items)
                    .then(() => setSyncStatus('synced'))
                    .catch((err) => { console.error('cloud push items failed', err); setSyncStatus('error'); });
            },
            pushTags: (tags) => {
                if (!state.user) return;
                setSyncStatus('syncing');
                sync.pushTagsDebounced(state.user.uid, tags)
                    .then(() => setSyncStatus('synced'))
                    .catch((err) => { console.error('cloud push tags failed', err); setSyncStatus('error'); });
            },
        });

        let unsubItems = null;
        let unsubTags = null;

        sync.consumeRedirectResult();
        sync.watchAuth((user) => {
            setUser(user || null);
            if (unsubItems) { unsubItems(); unsubItems = null; }
            if (unsubTags) { unsubTags(); unsubTags = null; }
            if (user) {
                setSyncStatus('syncing');
                Promise.all([
                    sync.pushItems(user.uid, state.items).catch(e => console.warn('initial items push failed', e)),
                    sync.pushTags(user.uid, state.tags).catch(e => console.warn('initial tags push failed', e)),
                ]).finally(() => {
                    unsubItems = sync.subscribeItems(user.uid, (remote) => {
                        applyRemoteItems(remote, sync.mergeLWW);
                        setSyncStatus('synced');
                    });
                    unsubTags = sync.subscribeTags(user.uid, (remote) => {
                        applyRemoteTags(remote, sync.mergeTagsLWW);
                        setSyncStatus('synced');
                    });
                });
            } else {
                setSyncStatus('offline');
            }
        });

        sync.onForegroundMessage((payload) => {
            const title = (payload.notification && payload.notification.title) || 'D+Day';
            const body = (payload.notification && payload.notification.body) || '';
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(title, { body, icon: '/icon.svg' });
            }
        });
    } else {
        setSyncStatus('offline');
    }

    // Re-evaluate mobile guard on resize
    let lastMobile = isMobileViewport();
    window.addEventListener('resize', () => {
        const now = isMobileViewport();
        if (now !== lastMobile) {
            lastMobile = now;
            if (now && (state.view === 'timeline' || state.view === 'calendar')) {
                setView('list');
            }
            // Trigger refresh for layout differences
            renderActiveView();
        }
    });

    setupSwipeNavigation(viewRoot);

    // First paint
    renderActiveView();

    // Service worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('service-worker.js').catch(() => {});
        });
    }
}
