// FCM dedicated service worker — wakes the browser when a push arrives,
// even with all tabs closed. This file must live at the site root with this
// exact filename so the Firebase Messaging SDK can find it.

// Use the compat builds because service workers don't support ES modules in
// all browsers yet, and FCM officially documents this path.
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAdFwHuQwpyJFVZDbXSpwm9n3eXAqzA61g',
  authDomain: 'd-plus-day.firebaseapp.com',
  projectId: 'd-plus-day',
  storageBucket: 'd-plus-day.firebasestorage.app',
  messagingSenderId: '96550314066',
  appId: '1:96550314066:web:7462d6f135e89ae8d07f8b',
});

const messaging = firebase.messaging();

// Background-message handler: only fires when the page isn't focused.
// Foreground messages are handled in sync.js so they can be deduplicated.
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || 'D+Day';
  const options = {
    body: (payload.notification && payload.notification.body) || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: payload.data || {},
    tag: 'dday-cycle', // collapse repeated notifications instead of stacking
  };
  return self.registration.showNotification(title, options);
});

// Open (or focus) the app when the user taps the notification.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
