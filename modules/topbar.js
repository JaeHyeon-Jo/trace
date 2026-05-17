// Topbar: brand + view switcher + search + actions + auth/sync/notification.
import { state, setView, setFilterQuery, setUser, setSyncStatus } from './state.js';
import { isMobileViewport, debounce } from './helpers.js';
import { openCrudModal, openTagManagerModal, openHelpModal } from './modal.js';

const VIEW_TABS = [
    { id: 'dashboard', label: '대시보드' },
    { id: 'list',      label: '리스트' },
    { id: 'tagged',    label: '태그' },
    { id: 'timeline',  label: '타임라인' },
    { id: 'calendar',  label: '캘린더' },
];

let syncRef = null;        // injected sync module (or null)

export function mountTopbar(rootEl, { sync = null } = {}) {
    syncRef = sync;

    rootEl.innerHTML = `
        <header class="dday-topbar">
            <a class="dday-brand" href="#" aria-label="D+Day 홈">
                <span class="dday-brand-dot"></span>
                D+Day!
            </a>

            <nav class="dday-view-switcher" role="tablist" id="viewSwitcher">
                ${VIEW_TABS.map(t => `
                    <button type="button" data-view="${t.id}" role="tab" aria-selected="false">${t.label}</button>
                `).join('')}
            </nav>

            <div class="dday-topbar-actions">
                <input id="searchInput" class="dday-input dday-search" type="search" placeholder="검색…" aria-label="검색">
                <span id="syncStatus" class="dday-sync-status" aria-live="polite"></span>
                <div class="dday-user" id="userWrap">
                    <button class="dday-btn ghost dday-user-trigger" id="authBtn" type="button" aria-haspopup="false" aria-expanded="false">🔐 로그인</button>
                    <div class="dday-user-menu" id="userMenu" role="menu" hidden>
                        <button class="dday-menu-item" id="tagsBtn"  role="menuitem">⚙ 태그 관리</button>
                        <button class="dday-menu-item" id="helpBtn"  role="menuitem">? 도움말</button>
                        <button class="dday-menu-item" id="notifBtn" role="menuitem" hidden>🔔 알림 설정</button>
                        <div class="dday-menu-sep"></div>
                        <button class="dday-menu-item dday-menu-danger" id="logoutBtn" role="menuitem">⎋ 로그아웃</button>
                    </div>
                </div>
                <button class="dday-btn" id="addBtn">+ 새 항목</button>
            </div>
        </header>
    `;

    // View switcher
    const switcher = rootEl.querySelector('#viewSwitcher');
    switcher.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-view]');
        if (!btn) return;
        const view = btn.dataset.view;
        if (isMobileViewport() && (view === 'timeline' || view === 'calendar' || view === 'tagged')) return;
        setView(view);
    });

    // Search
    const searchInput = rootEl.querySelector('#searchInput');
    searchInput.value = state.filter.query || '';
    searchInput.addEventListener('input', debounce(() => setFilterQuery(searchInput.value), 150));

    // User dropdown menu
    const userWrap = rootEl.querySelector('#userWrap');
    const userMenu = rootEl.querySelector('#userMenu');
    const authBtn  = rootEl.querySelector('#authBtn');

    function openUserMenu() {
        userMenu.hidden = false;
        authBtn.setAttribute('aria-expanded', 'true');
    }
    function closeUserMenu() {
        userMenu.hidden = true;
        authBtn.setAttribute('aria-expanded', 'false');
    }
    function toggleUserMenu() {
        if (userMenu.hidden) openUserMenu();
        else closeUserMenu();
    }

    document.addEventListener('click', (e) => {
        if (userMenu.hidden) return;
        if (userWrap.contains(e.target)) return;
        closeUserMenu();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !userMenu.hidden) closeUserMenu();
    });

    // Menu item actions
    rootEl.querySelector('#tagsBtn').addEventListener('click', () => { closeUserMenu(); openTagManagerModal(); });
    rootEl.querySelector('#helpBtn').addEventListener('click', () => { closeUserMenu(); openHelpModal(); });
    rootEl.querySelector('#notifBtn').addEventListener('click', async (e) => { closeUserMenu(); await handleNotifClick(e); });
    rootEl.querySelector('#logoutBtn').addEventListener('click', async () => {
        if (!syncRef) return;
        if (!confirm('로그아웃 하시겠습니까?')) return;
        closeUserMenu();
        try { await syncRef.logout(); }
        catch (err) { console.error('logout failed', err); alert('로그아웃 실패: ' + (err.message || err)); }
    });

    rootEl.querySelector('#addBtn').addEventListener('click', () => openCrudModal(null));

    // Auth button: when logged out → immediate login; when logged in → toggle menu
    authBtn.addEventListener('click', () => {
        if (!syncRef) {
            alert('Firebase 설정이 없습니다. README 의 "기기간 동기화 설정" 섹션을 참고하세요.');
            return;
        }
        if (state.user) {
            toggleUserMenu();
        } else {
            handleLogin();
        }
    });

    // Mobile guard: if persisted view is timeline/calendar/tagged on mobile, fallback to list
    if (isMobileViewport() && (state.view === 'timeline' || state.view === 'calendar' || state.view === 'tagged')) {
        setView('list');
    }

    // Reflect state in tab highlighting + sync status + auth
    refresh(state);
}

export function refresh(s) {
    document.querySelectorAll('#viewSwitcher button[data-view]').forEach(btn => {
        const active = btn.dataset.view === s.view;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    const ss = document.getElementById('syncStatus');
    if (ss) {
        const map = { offline: '', syncing: '🔄', synced: '✅', error: '⚠️' };
        const titleMap = { offline: '로컬 전용', syncing: '동기화 중', synced: '동기화됨', error: '동기화 실패' };
        ss.textContent = map[s.syncStatus] || '';
        ss.title = titleMap[s.syncStatus] || '';
    }

    const authBtn = document.getElementById('authBtn');
    const userMenu = document.getElementById('userMenu');
    const logoutBtn = document.getElementById('logoutBtn');
    if (authBtn) {
        if (s.user) {
            const name = s.user.displayName || s.user.email || '계정';
            authBtn.textContent = `👤 ${name.split(' ')[0]}`;
            authBtn.title = `${name} 메뉴 열기`;
            authBtn.setAttribute('aria-haspopup', 'true');
            if (logoutBtn) logoutBtn.hidden = false;
        } else {
            authBtn.textContent = syncRef ? '🔐 로그인' : '🔐 미설정';
            authBtn.title = syncRef ? 'Google 계정으로 로그인해 기기 간 동기화' : 'firebase-config.js 가 설정되어야 동기화가 활성화됩니다';
            authBtn.setAttribute('aria-haspopup', 'false');
            if (logoutBtn) logoutBtn.hidden = true;
            if (userMenu) userMenu.hidden = true;
            authBtn.setAttribute('aria-expanded', 'false');
        }
    }
    refreshNotifButton(s);
}

async function refreshNotifButton(s) {
    const btn = document.getElementById('notifBtn');
    if (!btn) return;
    if (!syncRef || !s.user) { btn.hidden = true; return; }
    btn.hidden = false;
    try {
        const state = await syncRef.notificationPermissionState();
        if (state === 'unsupported') { btn.hidden = true; return; }
        if (state === 'granted')      { btn.textContent = '🔔 알림 끄기';   btn.title = '알림 활성 (클릭 시 끄기)'; btn.disabled = false; }
        else if (state === 'denied')  { btn.textContent = '🔕 알림 차단됨'; btn.title = '브라우저에서 차단됨';      btn.disabled = true;  }
        else                          { btn.textContent = '🔔 알림 켜기';   btn.title = '알림 켜기';                btn.disabled = false; }
    } catch {
        btn.hidden = true;
    }
}

async function handleLogin() {
    try {
        await syncRef.loginWithGoogle();
    } catch (err) {
        console.error('login failed', err);
        const code = err.code || '';
        if (code === 'auth/unauthorized-domain') {
            alert('이 도메인은 Firebase 에 등록되어 있지 않습니다.\nFirebase Console → Authentication → Settings → Authorized domains 에 현재 도메인을 추가하세요.');
        } else {
            alert('로그인 실패: ' + (err.message || code));
        }
    }
}

async function handleNotifClick() {
    if (!syncRef || !state.user) return;
    try {
        const perm = await syncRef.notificationPermissionState();
        if (perm === 'granted') await syncRef.disableNotifications(state.user.uid);
        else await syncRef.enableNotifications(state.user.uid);
    } catch (err) {
        console.error('notification toggle failed', err);
        alert('알림 설정 실패: ' + (err.message || err));
    }
    refreshNotifButton(state);
}

// Re-export so app.js doesn't have to wire setUser/setSyncStatus directly
export const auth = { setUser, setSyncStatus };
