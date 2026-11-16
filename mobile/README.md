# Ledger for Android

This is a React Native app built with Expo. It connects to your Ledger server over HTTPS. Sign in once while online; tasks and pending changes are stored on the device for offline use. Sync runs on opening, returning to the app, and periodically while it is open.

```bash
cd mobile
npm install
npx expo start
```

For an Android development build, install the Android SDK and run `npm run android`. The app schedules local reminders on the device when a reminder is set there. Android can delay alarms under battery restrictions; reminders created on another device are not yet scheduled locally. This client is an initial implementation and does not yet include the web app's full calendar, list management, repeat, archive, and theme features.
