// D+Day cross-device sync — Firebase Auth (Google) + Firestore.
// Per-activity docs at users/{uid}/activities/{id}. Last-write-wins via updatedAt.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  enableIndexedDbPersistence,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported as isMessagingSupported,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js';
import { firebaseConfig, vapidKey } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Best-effort offline persistence; ignored if multiple tabs or unsupported.
enableIndexedDbPersistence(db).catch(() => {});

const provider = new GoogleAuthProvider();

// Errors that mean "popup didn't work, try redirect instead" rather than a
// real auth failure. Mobile Safari blocks popups aggressively.
const POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/operation-not-supported-in-this-environment',
]);

export async function loginWithGoogle() {
  try {
    return await signInWithPopup(auth, provider);
  } catch (err) {
    if (POPUP_FALLBACK_CODES.has(err.code)) {
      // Page will reload at Google then back here; onAuthStateChanged will fire.
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw err;
  }
}

// Call once on app boot to surface any error from a completed redirect login.
// onAuthStateChanged fires automatically on redirect return, so this is purely
// for error reporting — never throws on the happy path.
export function consumeRedirectResult() {
  return getRedirectResult(auth).catch((err) => {
    console.warn('redirect sign-in error', err);
    return null;
  });
}

export function logout() {
  return signOut(auth);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

function activitiesCol(uid) {
  return collection(db, 'users', uid, 'activities');
}

function tagsCol(uid) {
  return collection(db, 'users', uid, 'tags');
}

// Subscribe to cloud changes. Calls onUpdate(remoteActivities) on every snapshot.
export function subscribeToCloud(uid, onUpdate, onError) {
  return onSnapshot(activitiesCol(uid), (snap) => {
    const remote = snap.docs.map((d) => d.data());
    onUpdate(remote);
  }, onError);
}

// Alias for new API used by modules/app.js — same as subscribeToCloud.
export const subscribeItems = subscribeToCloud;

export function subscribeTags(uid, onUpdate, onError) {
  return onSnapshot(tagsCol(uid), (snap) => {
    const remote = snap.docs.map((d) => d.data());
    onUpdate(remote);
  }, onError);
}

// Firestore caps a WriteBatch at 500 operations — stay under it.
const BATCH_LIMIT = 450;

async function pushDocs(col, records) {
  for (let i = 0; i < records.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const rec of records.slice(i, i + BATCH_LIMIT)) {
      batch.set(doc(col, rec.id), rec);
    }
    await batch.commit();
  }
}

// Push the full local set in batches. Cheap for this app's scale.
export async function pushToCloud(uid, activities) {
  if (!activities.length) return;
  await pushDocs(activitiesCol(uid), activities);
}

export const pushItems = pushToCloud;

export async function pushTags(uid, tags) {
  if (!tags || !tags.length) return;
  await pushDocs(tagsCol(uid), tags);
}

// Debounced push helpers — coalesce rapid local edits into one batch.
const DEBOUNCE_MS = 300;
// Takes (uid, getRecords) — records are read at flush time, not call time, so
// a remote merge that lands during the debounce window can't be overwritten by
// a stale snapshot of local state.
function makeDebouncedPush(pushFn) {
  let timer = null;
  let pendingResolvers = [];
  let lastUid = null;
  let lastGetRecords = null;
  return function debouncedPush(uid, getRecords) {
    lastUid = uid;
    lastGetRecords = getRecords;
    return new Promise((resolve, reject) => {
      pendingResolvers.push({ resolve, reject });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const resolvers = pendingResolvers;
        pendingResolvers = [];
        timer = null;
        pushFn(lastUid, lastGetRecords())
          .then(() => resolvers.forEach(r => r.resolve()))
          .catch((err) => resolvers.forEach(r => r.reject(err)));
      }, DEBOUNCE_MS);
    });
  };
}

export const pushItemsDebounced = makeDebouncedPush(pushToCloud);
export const pushTagsDebounced = makeDebouncedPush(pushTags);

// Push a single activity (used after local mutations).
export async function pushActivity(uid, activity) {
  await setDoc(doc(activitiesCol(uid), activity.id), activity);
}

// Missing/invalid updatedAt sorts as epoch 0 so a timestamped record always wins.
function toMillis(iso) {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// LWW merge by id. Tombstones (deletedAt) are preserved during merge so they
// can sync to other devices; the UI layer filters them out before rendering.
function mergeByIdLWW(local, remote) {
  const map = new Map();
  for (const a of local) map.set(a.id, a);
  for (const r of remote) {
    const l = map.get(r.id);
    if (!l || toMillis(r.updatedAt) > toMillis(l.updatedAt)) {
      map.set(r.id, r);
    }
  }
  return [...map.values()];
}

export const mergeLWW = mergeByIdLWW;
export const mergeTagsLWW = mergeByIdLWW;

// Local records missing from remote or strictly newer than the remote copy —
// the set that must be pushed back so the cloud converges to the LWW winner.
// Echo-safe: after the push-back, the echoed snapshot carries equal
// timestamps, so the next diff is empty and no loop forms.
export function diffLocalNewer(local, remote) {
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  return local.filter((l) => {
    const r = remoteById.get(l.id);
    return !r || toMillis(l.updatedAt) > toMillis(r.updatedAt);
  });
}

// ---------------------------------------------------------------------------
// Push notifications (FCM)
// ---------------------------------------------------------------------------

let messaging = null;
let messagingReady = null;

// Lazily resolve a Messaging instance. Returns null when the browser doesn't
// support push at all (e.g. iOS Safari without "Add to Home Screen").
async function getMessagingInstance() {
  if (messagingReady) return messagingReady;
  messagingReady = (async () => {
    try {
      if (!(await isMessagingSupported())) return null;
      messaging = getMessaging(app);
      return messaging;
    } catch (e) {
      console.warn('Messaging init failed', e);
      return null;
    }
  })();
  return messagingReady;
}

// Returns one of: 'granted' | 'denied' | 'default' | 'unsupported'
export async function notificationPermissionState() {
  if (!('Notification' in window)) return 'unsupported';
  const m = await getMessagingInstance();
  if (!m) return 'unsupported';
  return Notification.permission;
}

// Request OS-level notification permission, register the FCM token, and
// store it under users/{uid}/devices/{token} so Cloud Functions can target
// this device. Returns the token string, or null on failure/denial.
export async function enableNotifications(uid) {
  const m = await getMessagingInstance();
  if (!m) throw new Error('이 브라우저는 푸시 알림을 지원하지 않습니다.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('알림 권한이 거부되었습니다. 브라우저 설정에서 허용해주세요.');
  }

  // The FCM SDK looks for /firebase-messaging-sw.js by default — must be at
  // site root with that exact name. We register it explicitly so we can also
  // share it with the main app SW lifecycle.
  const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

  const token = await getToken(m, {
    vapidKey,
    serviceWorkerRegistration: swRegistration,
  });
  if (!token) throw new Error('FCM 토큰을 받지 못했습니다.');

  await setDoc(doc(db, 'users', uid, 'devices', token), {
    token,
    userAgent: navigator.userAgent,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return token;
}

// Remove the current device's token from Firestore — call this on logout or
// when the user explicitly disables notifications.
export async function disableNotifications(uid) {
  const m = await getMessagingInstance();
  if (!m) return;
  try {
    const token = await getToken(m, { vapidKey });
    if (token) await deleteDoc(doc(db, 'users', uid, 'devices', token));
  } catch (e) {
    console.warn('Failed to delete device token', e);
  }
}

// Foreground message handler — fires while a tab is focused. The background
// SW won't fire in that case, so we surface the notification ourselves.
export function onForegroundMessage(callback) {
  getMessagingInstance().then((m) => {
    if (!m) return;
    onMessage(m, (payload) => callback(payload));
  });
}
