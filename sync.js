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
  onSnapshot,
  writeBatch,
  enableIndexedDbPersistence,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

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

// Subscribe to cloud changes. Calls onUpdate(remoteActivities) on every snapshot.
export function subscribeToCloud(uid, onUpdate) {
  return onSnapshot(activitiesCol(uid), (snap) => {
    const remote = snap.docs.map((d) => d.data());
    onUpdate(remote);
  });
}

// Push the full local set in one batch. Cheap for this app's scale.
export async function pushToCloud(uid, activities) {
  if (!activities.length) return;
  const batch = writeBatch(db);
  for (const a of activities) {
    batch.set(doc(activitiesCol(uid), a.id), a);
  }
  await batch.commit();
}

// Push a single activity (used after local mutations).
export async function pushActivity(uid, activity) {
  await setDoc(doc(activitiesCol(uid), activity.id), activity);
}

// LWW merge by id. Tombstones (deletedAt) are preserved during merge so they
// can sync to other devices; the UI layer filters them out before rendering.
export function mergeLWW(local, remote) {
  const map = new Map();
  for (const a of local) map.set(a.id, a);
  for (const r of remote) {
    const l = map.get(r.id);
    if (!l || new Date(r.updatedAt) > new Date(l.updatedAt)) {
      map.set(r.id, r);
    }
  }
  return [...map.values()];
}
