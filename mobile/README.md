# Cumu Mobile (Capacitor)

Mobile App für [Cumu](https://github.com/Wolfiku/cumu) – gebaut mit [Capacitor](https://capacitorjs.com).

## Features
- **Login-Screen** beim ersten Start: Server-URL, Benutzername & Passwort
- **Bibliothek** – alle Lieder vom eigenen Cumu-Server laden & abspielen
- **Offline-Download** – Lieder herunterladen und ohne Internet hören
- **Player Bar** mit Steuerung (Vor/Zurück/Play/Pause)
- **Mobile-optimiertes UI** (Dark Mode, Safe Areas, Touch-freundlich)

## Setup

### 1. Dependencies installieren
```bash
cd mobile
npm install
```

### 2. Web-Build erzeugen
```bash
npm run build
```

### 3. Android-Plattform hinzufügen
```bash
npm run cap:add:android
npm run cap:sync
```

### 4. Android Studio öffnen
```bash
npm run cap:open:android
```

> In Android Studio dann auf **Run** klicken oder ein APK bauen über **Build → Build Bundle(s)/APK(s)**.

### iOS (nur auf macOS mit Xcode)
```bash
npm run cap:add:ios
npm run cap:sync
npm run cap:open:ios
```

## Entwicklung (Live-Reload)
```bash
npm run dev
```
Dann in `capacitor.config.json` temporär ergänzen:
```json
"server": { "url": "http://DEINE-IP:5173", "cleartext": true }
```
und `npx cap run android` ausführen.

## Wichtig: CORS auf dem Server

Dein cumu-Server muss Requests von der App zulassen. In `src/server.js` sollte `cors` schon aktiviert sein. Für die App ggf. die Origin `capacitor://localhost` oder `http://localhost` erlauben.
