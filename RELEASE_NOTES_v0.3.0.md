# cumu v0.3.0 — Auto Song Lookup, Smarter Recognitions & More Designs

This release introduces automatic song metadata lookup, improved audio recognition accuracy, and additional UI designs.

---

## Highlights & New Features

- **Auto Song Lookup:**
  Songs are now automatically matched against an online metadata database. Missing titles, artists, album names, and artwork are filled in automatically without manual input.

- **Smarter Recognitions:**
  Improved audio fingerprinting engine with higher accuracy and faster recognition times for scanned library tracks.

- **More Designs:**
  Additional UI themes and visual styles available in the settings panel for a more personalized listening experience.

---

## Installation Options

### Option 1: One-Line Installer (Recommended for Linux / LXC)
```bash
curl -fsSL https://raw.githubusercontent.com/Wolfiku/cumu/main/scripts/install.sh | bash
```

### Option 2: Docker Compose
```bash
git clone https://github.com/Wolfiku/cumu.git
cd cumu
docker compose up -d
```

### Option 3: Debian / Ubuntu Package (.deb)
```bash
dpkg -i cumu_0.3.0_amd64.deb
```

---

## Full Documentation
See [INSTALL.md](https://github.com/Wolfiku/cumu/blob/main/INSTALL.md) for full deployment instructions.
