# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

**D+Day** (브랜드: `D+Day!`) is a lightweight activity tracker. You record the date
you last did something; the app shows how many days have **elapsed** (D+N) and how
many days **remain** until the next ideal cycle. It is the inverse of a countdown
D-Day. UI copy is **Korean**; code, comments, and identifiers are English.

Live demo: https://d-plus-day.web.app · Firebase project: `d-plus-day`

## Architecture at a glance

This is a **build-step-free static web app**. No bundler, no transpiler, no
`package.json` at the root, no `npm install`. Plain ES modules loaded directly by
the browser via `<script type="module">`. Do **not** introduce a build tool, a
framework, or TypeScript — match the existing vanilla-JS style.

```
index.html               Single entry point. Mounts #topbarRoot, #viewRoot, #modalHost,
                         then imports modules/app.js and calls start().
modules/
  app.js                 Bootstrap: lazy-loads sync.js, mounts topbar, wires the
                         render loop (subscribe → refresh topbar + render active view),
                         sets up swipe nav + mobile guards + service worker.
  state.js               Single source of truth. Centralized state object, pub/sub
                         (subscribe/notify), localStorage persistence, idempotent
                         migration, and ALL mutators (add/update/delete/archive items,
                         tags, view, filter, sort, remote-merge).
  helpers.js             Pure date/cycle/urgency math + small utilities + DEFAULT_TAGS.
  topbar.js              Header: brand, view switcher, search, sync/auth/notif controls.
  modal.js               CRUD modal, tag-manager modal, help modal, history section.
  toast.js               Undo toast (5s auto-dismiss).
  ai.js                  AI slot stubs — statistical fallbacks only (no model calls yet).
  views/
    dashboard.js         "대시보드" — default view: today's work + summary stats.
    list.js              "리스트" — dense urgency-sorted list, archive section.
    tagged.js            "태그" — per-tag sections, HTML5 drag to re-tag (desktop).
    timeline.js          "타임라인" — Gantt-style ±35 day window (desktop only).
    calendar.js          "캘린더" — monthly 7×6 grid + side panel (desktop only).
sync.js                  OPTIONAL Firebase layer: Auth (Google), Firestore sync,
                         FCM push. Imports firebase-config.js (gitignored). Loaded
                         lazily — the app runs fully without it (localStorage only).
functions/index.js       Cloud Function: daily 09:00 KST scheduled FCM push for
                         due cycles + manual trigger. Node 20, ES modules.
service-worker.js        PWA offline cache (stale-while-revalidate). CACHE name is
                         stamped with the commit SHA at deploy time.
firebase-messaging-sw.js Background FCM handler (must be at site root, exact name).
styles.css               All styling. Design tokens as CSS custom properties.
DESIGN.md                Design system spec (Linear-inspired dark theme, #5e6ad2 accent).
```

### Data flow / state model

- **`state.js` is the hub.** Views never mutate state directly — they call exported
  mutators (`addItem`, `updateItem`, `refreshItem`, `deleteItem`, `archiveItem`,
  `toggleItemTag`, `setView`, `setFilterQuery`, `setSort`, …). Every mutator
  persists to localStorage, pushes to cloud (if signed in), and calls `notify()`.
- **Render loop:** `notify()` → all `subscribe()` listeners fire → `app.js` re-renders
  the topbar and the active view by calling `mod.render(viewRoot)`. Views are
  **stateless renderers**: each `render()` rebuilds `root.innerHTML` from current
  state and re-wires its own event listeners. There is no virtual DOM or diffing.
- **Reading data in a view:** use `visibleItems()` / `archivedItems()` / `visibleTags()`
  (which filter out `deletedAt` / `archivedAt`) and `filterItems()` (applies the
  search query + active tag filter). Never iterate `state.items` raw for display.

### Item & tag shape

```js
// item
{ id, name, lastDate /* YYYY-MM-DD */, history: [dates...], tags: [tagId...],
  cycleNum?, cycleUnit?: 'day'|'week'|'month', updatedAt /* ISO */,
  deletedAt?, archivedAt? }
// tag
{ id, label, color, order, createdAt, updatedAt, deletedAt? }
```

- **Cycle** is optional. `toCycleDays()` converts to days (month ≈ 30, approximation).
- **Urgency** (`urgency()` in helpers): `3` overdue, `2` ≤3 days, `1` ok, `0` no cycle.
  Map to CSS class via `urgencyClass()` (`is-due`/`is-soon`/`is-ok`).
- **history** is the list of all "refresh" dates; `refreshItem()` appends to it.
  `suggestCycleDays()` / the edit modal compute average interval from it (needs 3+).
- **Soft deletes:** deletes set `deletedAt` (tombstone) and archives set `archivedAt`,
  rather than removing the record — so deletion/archival propagates across devices.

## Key conventions

- **Korean UI, English code.** All user-facing strings are Korean. Keep code,
  comments, commit messages, and identifiers in English.
- **Preserve legacy field/key names.** localStorage uses `myActivities` (items) and
  `sortSettings` (legacy keys, NOT renamed) plus newer `trace.*` keys. Item fields
  `lastDate`, `cycleNum`, `cycleUnit` are depended on by the Cloud Function
  (`functions/index.js`) — do not rename them.
- **Migration is idempotent** and runs once at module load in `state.js` (`migrate()`):
  backfills `id`/`updatedAt`/`tags`/`history`, seeds `DEFAULT_TAGS` once (guarded by
  the `tagsSeeded` flag). Extend it carefully and keep it safe to re-run.
- **Always `escapeHtml()` user content** before interpolating into `innerHTML`
  template strings. Views build markup as template literals — this is the XSS guard.
- **Sync is optional and must stay optional.** `sync.js` imports the gitignored
  `firebase-config.js`; `app.js` wraps the import in try/catch and falls back to
  localStorage-only. Never make core features hard-depend on Firebase.
- **Conflict resolution = last-write-wins** by `updatedAt` (`mergeByIdLWW` in sync.js).
  Tombstones are preserved through merge; the UI filters them out.
- **Dates:** store as `YYYY-MM-DD` strings; parse with `parseDate()` (uses noon to
  dodge DST). Timestamps (`updatedAt` etc.) are full ISO via `nowIso()`.
- **Mobile guard:** `timeline`, `calendar`, and `tagged` are desktop-only. On mobile
  viewports (`isMobileViewport()`, ≤767px) they fall back to `list`. Mobile supports
  swipe between `dashboard` ↔ `list`.
- **New module?** If you add a file under `modules/`, also add it to the `ASSETS`
  list in `service-worker.js` so it is cached for offline use.

## Running locally

Requires an HTTP server (Service Worker + ES module imports do not work over `file://`):

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

To exercise sync/push locally, copy `firebase-config.example.js` to
`firebase-config.js` and fill in real Firebase web-app values + VAPID key.

There is **no test suite, linter, or build command** at the repo root. Verify changes
by loading the app in a browser and exercising the affected view/flow.

### Cloud Functions

Located in `functions/` (separate `package.json`, Node 20, ES modules, deps
`firebase-admin` + `firebase-functions`). `dailyCycleCheck` runs at 09:00
Asia/Seoul; `manualCycleCheck` is a callable for testing (auth required).

```bash
cd functions && npm install
firebase deploy --only functions      # deploys to region asia-northeast3
```

## Deployment

Hosted on **Firebase Hosting** (not GitHub Pages — chosen so the hosting origin
shares the `firebaseapp.com` context with Firebase Auth, avoiding Safari/iOS ITP
sign-in blocking).

- **Automatic:** pushing to `main` triggers `.github/workflows/firebase-deploy.yml`,
  which writes `firebase-config.js` from the `FIREBASE_CONFIG_JS` secret, stamps the
  service-worker `CACHE` name with the commit SHA (cache-busting), and deploys
  `hosting` + `firestore:rules`. **Functions are NOT deployed by CI** — deploy them
  manually when `functions/` changes.
- **Manual:** `firebase deploy --only hosting` (config in `firebase.json` /
  `.firebaserc`, already committed — no `firebase init` needed).
- After deploy the site is live at `*.web.app` and `*.firebaseapp.com`.

## Git workflow for this environment

- Develop on the designated feature branch; create it locally if missing.
- Commit with clear, descriptive English messages. The repo uses Conventional
  Commit prefixes (`feat:`, `fix:`, `ci:`, `feat(mobile):`, …) — follow that style.
- Push with `git push -u origin <branch>`. Do not push to `main` or open a PR
  unless explicitly asked (pushing to `main` triggers a production deploy).

## Where to look first

- Adding/changing how an item behaves → `modules/state.js` (mutators) +
  `modules/helpers.js` (cycle/urgency math).
- Changing what a screen shows → the relevant `modules/views/*.js`.
- Add/edit/delete UI, history, tag manager → `modules/modal.js`.
- Sync / auth / push behavior → `sync.js` (client) + `functions/index.js` (server).
- Visual styling / tokens → `styles.css`, with rationale in `DESIGN.md`.
- User-facing docs / setup → `README.md` (bilingual KR/EN).
</content>
</invoke>
