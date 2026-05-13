// Copy this file to firebase-config.js and replace the values with your own.
// firebase-config.js is gitignored — each user/device has its own.
//
// Where to get these values:
//   Firebase Console → Project settings → Your apps → Web app → SDK setup
//
// All fields below are *public* by design (Firebase client config is meant to
// ship to the browser). Security comes from Firestore rules + Auth, not from
// hiding these strings. See firestore.rules.

export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};
