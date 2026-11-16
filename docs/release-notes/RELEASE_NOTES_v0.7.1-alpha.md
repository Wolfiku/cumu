# cumu v0.7.1-alpha — Hotfix: Android app shows up as a device

A hotfix for v0.7.0-alpha. **Update the Android app** (APK below); the server and the web app are unchanged.

## 🐛 Fixed

- **Android: play on other devices works again.** The app often did not register as a device: when the server answered quickly, the app's sign-in on the live connection got lost. The phone then did not appear in the web app's device list, and the app did not show what plays in the browser ("Wiedergabe auf …"). The app now registers as soon as the connection is open. This also makes listening parties in the app reliable.

## ⬆️ Updating

- **Android:** install `cumu_v0.7.1-alpha.apk` over the old app; your login and downloads stay.
- **Server:** nothing to do (Docker / `cumu-update` pick up the new version as usual).
