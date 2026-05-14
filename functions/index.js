// Scheduled push notifications for D+Day.
// Runs once a day at 09:00 Asia/Seoul. For each user, scans their activities
// for any item whose next-cycle date has arrived or passed, then sends a
// single bundled FCM notification to every device the user has registered.

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

// ---------- Cycle-due detection ----------

const UNIT_TO_DAYS = { day: 1, week: 7, month: 30 };

// Returns true when `activity` should trigger a push today (Asia/Seoul).
// "Due" means: lastDate + cycle has been reached. We don't fire repeatedly on
// the same day for the same item because the daily cron fires once per day.
function isActivityDue(activity, todayKST) {
  if (activity.deletedAt) return false;
  if (!activity.cycleNum || !activity.cycleUnit) return false;
  if (!activity.lastDate) return false;
  const days = UNIT_TO_DAYS[activity.cycleUnit];
  if (!days) return false;
  const last = new Date(activity.lastDate + 'T00:00:00Z');
  const next = new Date(last);
  next.setUTCDate(next.getUTCDate() + activity.cycleNum * days);
  // todayKST is a YYYY-MM-DD string in Asia/Seoul.
  return next.toISOString().slice(0, 10) <= todayKST;
}

function todayInSeoul() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  // en-CA produces YYYY-MM-DD, which matches our activity.lastDate format.
  return fmt.format(new Date());
}

function buildMessageBody(dueActivities) {
  const names = dueActivities.map((a) => a.name);
  if (names.length === 1) return `${names[0]} — 주기에 도달했어요`;
  return `${names[0]} 외 ${names.length - 1}개 활동이 주기에 도달했어요`;
}

// ---------- Per-user scan & push ----------

async function processUser(userDoc, todayKST) {
  const uid = userDoc.id;
  const activitiesSnap = await db.collection('users').doc(uid).collection('activities').get();
  const due = [];
  activitiesSnap.forEach((d) => {
    const a = d.data();
    if (isActivityDue(a, todayKST)) due.push(a);
  });
  if (due.length === 0) return { uid, sent: 0, due: 0 };

  const devicesSnap = await db.collection('users').doc(uid).collection('devices').get();
  const tokens = devicesSnap.docs.map((d) => d.data().token).filter(Boolean);
  if (tokens.length === 0) return { uid, sent: 0, due: due.length };

  const body = buildMessageBody(due);
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: 'D+Day 알림', body },
    data: { dueCount: String(due.length), date: todayKST },
    webpush: {
      fcmOptions: { link: '/' },
      notification: { icon: '/icon.svg', badge: '/icon.svg' },
    },
  });

  // Clean up invalid tokens so we don't retry them tomorrow.
  const invalidTokens = [];
  response.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code || '';
      if (
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/registration-token-not-registered'
      ) {
        invalidTokens.push(tokens[i]);
      } else {
        logger.warn('send failed', { uid, token: tokens[i].slice(0, 12), code });
      }
    }
  });
  if (invalidTokens.length) {
    await Promise.all(
      invalidTokens.map((t) => db.collection('users').doc(uid).collection('devices').doc(t).delete())
    );
  }

  return { uid, sent: response.successCount, due: due.length, removed: invalidTokens.length };
}

async function runDailyCheck() {
  const todayKST = todayInSeoul();
  logger.info('daily push check starting', { todayKST });

  const usersSnap = await db.collection('users').get();
  if (usersSnap.empty) {
    // No user-doc top-level documents; users/{uid} may only exist as a path
    // prefix. Fall back to listing all device collections via collection group.
    const tokensGroup = await db.collectionGroup('devices').get();
    const uids = new Set();
    tokensGroup.forEach((d) => {
      // d.ref.parent.parent is the users/{uid} doc reference
      const parent = d.ref.parent.parent;
      if (parent) uids.add(parent.id);
    });
    const results = [];
    for (const uid of uids) {
      results.push(await processUser({ id: uid }, todayKST));
    }
    logger.info('daily push check done (via collection group)', { count: results.length, results });
    return;
  }

  const results = [];
  for (const userDoc of usersSnap.docs) {
    results.push(await processUser(userDoc, todayKST));
  }
  logger.info('daily push check done', { count: results.length, results });
}

// ---------- Scheduled trigger: 09:00 every day, Asia/Seoul ----------

export const dailyCycleCheck = onSchedule(
  {
    schedule: 'every day 09:00',
    timeZone: 'Asia/Seoul',
    region: 'asia-northeast3',
  },
  async () => {
    await runDailyCheck();
  }
);

// ---------- Manual trigger for testing ----------
// Call from the browser console:
//   const fn = httpsCallable(getFunctions(app, 'asia-northeast3'), 'manualCycleCheck');
//   await fn();
// Restricted to authenticated callers so anyone-on-the-internet can't trigger.
export const manualCycleCheck = onCall(
  { region: 'asia-northeast3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '로그인 후 호출하세요.');
    }
    await runDailyCheck();
    return { ok: true };
  }
);
