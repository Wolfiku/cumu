#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# cumu — One-line installer
# Installs Node.js (if missing) + cumu as a systemd service
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Wolfiku/cumu/main/scripts/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/Wolfiku/cumu/main/scripts/install.sh | bash -s -- --port 8080 --music-path /srv/music
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"
BOLD="\033[1m"
WHITE="\033[1;37m"

INSTALL_DIR="/opt/cumu"
DATA_DIR="/var/lib/cumu"
MUSIC_DIR="/var/lib/cumu/music"
SERVICE_USER="cumu"
PORT="3000"
REPO="https://github.com/Wolfiku/cumu"
ARCHIVE_URL="${REPO}/archive/refs/heads/main.tar.gz"

log()   { echo -e "${GREEN}[cumu]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
error() { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# ── Print ASCII Logo ─────────────────────────────────────────────────────────
echo -e "${BOLD}${WHITE}"
echo "  ██████╗██╗   ██╗███╗   ███╗██╗   ██╗"
echo " ██╔════╝██║   ██║████╗ ████║██║   ██║"
echo " ██║     ██║   ██║██╔████╔██║██║   ██║"
echo " ██║     ██║   ██║██║╚██╔╝██║██║   ██║"
echo " ╚██████╗╚██████╔╝██║ ╚═╝ ██║╚██████╔╝"
echo "  ╚═════╝ ╚═════╝ ╚═╝     ╚═╝ ╚═════╝"
echo -e "${NC}"
echo -e "${BOLD}  cumu — Self-hosted music & podcast streaming server${NC}\n"

# ── Parse arguments ──────────────────────────────────────────────────────────
PORT_SET_VIA_ARG=false
MUSIC_SET_VIA_ARG=false
FORCE_DOCKER=false
DOCKER_BASE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)        PORT="$2"; PORT_SET_VIA_ARG=true; shift 2 ;;
    --music-path)  MUSIC_DIR="$2"; MUSIC_SET_VIA_ARG=true; shift 2 ;;
    --install-dir) INSTALL_DIR="$2";                 shift 2 ;;
    --docker)      FORCE_DOCKER=true;                shift ;;
    --data-dir)    DOCKER_BASE="$2";                 shift 2 ;;
    --update)      ACTION="update";                  shift ;;
    --reinstall)   ACTION="reinstall";               shift ;;
    *) warn "Unknown argument: $1"; shift ;;
  esac
done
ACTION="${ACTION:-}"
CHOSEN_IN_MENU=false

# True when we can talk to the user (also works with curl ... | bash)
has_tty() { { : </dev/tty; } 2>/dev/null; }

ask_port() {
  if [[ "$PORT_SET_VIA_ARG" == false ]] && has_tty; then
    echo -e "${BOLD}[+] Server-Konfiguration:${NC}"
    echo -ne "    Welcher Port soll für cumu verwendet werden? [Standard: ${PORT}]: "
    read -r USER_PORT </dev/tty || USER_PORT=""
    if [[ -n "${USER_PORT// /}" ]]; then
      PORT="${USER_PORT// /}"
    fi
  fi
  log "Verwende Server-Port: ${PORT}"
}

# ── Root check ───────────────────────────────────────────────────────────────
# Use `id -u` instead of relying only on $EUID, and say who we actually run as.
# Common pitfall: `sudo curl ... | bash` runs only curl as root, NOT bash.
CURRENT_UID="$(id -u 2>/dev/null || echo "${EUID:-unknown}")"
if [[ "$CURRENT_UID" != "0" ]]; then
  error "Der Installer muss als root laufen, läuft aber als '$(id -un 2>/dev/null || whoami)' (UID ${CURRENT_UID}).
        Richtig:  curl -fsSL https://raw.githubusercontent.com/Wolfiku/cumu/main/scripts/install.sh | sudo bash
        Falsch:   sudo curl -fsSL ... | bash   (dabei läuft nur curl als root, nicht bash)"
fi

# ── Detect NAS platform ──────────────────────────────────────────────────────
# NAS systems (Synology, QNAP, Unraid, TrueNAS SCALE, Asustor) have no usable
# package manager / systemd setup, so cumu is installed there as a Docker
# container instead. `--docker` forces this mode on any system.
PLATFORM="linux"
if   [[ "$(uname -s 2>/dev/null)" == "FreeBSD" ]]; then PLATFORM="freebsd"
elif [[ -f /etc/synoinfo.conf || -f /etc.defaults/VERSION ]]; then PLATFORM="synology"
elif [[ -f /etc/config/uLinux.conf ]] || command -v getcfg &>/dev/null; then PLATFORM="qnap"
elif [[ -f /etc/unraid-version ]]; then PLATFORM="unraid"
elif command -v midclt &>/dev/null; then PLATFORM="truenas"
elif [[ -f /etc/nas.conf || -d /usr/local/AppCentral ]]; then PLATFORM="asustor"
fi

[[ "$PLATFORM" == "freebsd" ]] && error "FreeBSD / TrueNAS CORE wird nicht unterstützt (kein Docker).
        Nutze eine Linux-VM oder TrueNAS SCALE."

find_docker() {
  local c
  if command -v docker &>/dev/null; then command -v docker; return 0; fi
  for c in /usr/local/bin/docker /usr/bin/docker \
           /share/*/.qpkg/container-station/bin/docker \
           /usr/local/AppCentral/docker-ce/bin/docker; do
    [[ -x "$c" ]] && { echo "$c"; return 0; }
  done
  return 1
}

# 16 chars in groups of 4, same alphabet as src/adminCode.js
gen_admin_code() {
  local a='ABCDEFGHJKMNPQRSTUVWXYZ23456789' c='' n
  for n in $(od -An -N16 -tu1 /dev/urandom); do
    (( ${#c} % 5 == 4 )) && c+='-'
    c+="${a:n%31:1}"
  done
  echo "$c"
}

ask() { # ask "<question>" "<default>" → prints answer (default without a tty)
  local answer=""
  if has_tty; then
    echo -ne "    $1 [Standard: $2]: " >/dev/tty
    read -r answer </dev/tty || answer=""
  fi
  answer="${answer#"${answer%%[![:space:]]*}"}"; answer="${answer%"${answer##*[![:space:]]}"}"
  echo "${answer:-$2}"
}

install_docker_mode() {
  local DOCKER BASE DEF_MUSIC ARCH pool
  DOCKER="$(find_docker)" || error "Docker wurde nicht gefunden. Installiere zuerst das Docker-Paket deines NAS:
        Synology: Container Manager · QNAP: Container Station · Unraid: Docker aktivieren
        TrueNAS SCALE: Apps einrichten · Asustor: Docker-CE (App Central)"
  "$DOCKER" info &>/dev/null || error "Docker ist installiert, läuft aber nicht. Bitte das Docker-Paket im NAS starten."

  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64|amd64|aarch64|arm64) ;;
    *) error "CPU-Architektur '${ARCH}' wird vom cumu-Image nicht unterstützt (nur x86_64 und arm64)." ;;
  esac

  case "$PLATFORM" in
    synology) BASE="/volume1/docker/cumu";     DEF_MUSIC="/volume1/music" ;;
    qnap)     if [[ -d /share/Container ]]; then BASE="/share/Container/cumu"; else BASE="/share/CACHEDEV1_DATA/Container/cumu"; fi
              if [[ -d /share/Music ]]; then DEF_MUSIC="/share/Music"; else DEF_MUSIC="/share/Multimedia"; fi ;;
    unraid)   BASE="/mnt/user/appdata/cumu";   DEF_MUSIC="/mnt/user/music" ;;
    truenas)  pool="$(find /mnt -mindepth 1 -maxdepth 1 -type d ! -name '.*' 2>/dev/null | head -n1)"
              BASE="${pool:-/mnt/pool}/apps/cumu"; DEF_MUSIC="${pool:-/mnt/pool}/music" ;;
    asustor)  BASE="/volume1/Docker/cumu";     DEF_MUSIC="/volume1/Music" ;;
    *)        BASE="/opt/cumu-docker";         DEF_MUSIC="/opt/cumu-docker/music" ;;
  esac

  echo -e "${BOLD}[+] Docker-Installation (${PLATFORM}):${NC}"
  [[ -n "$DOCKER_BASE" ]] && BASE="$DOCKER_BASE" || BASE="$(ask "Ordner für cumu-Daten" "$BASE")"
  [[ "$MUSIC_SET_VIA_ARG" == true ]] || MUSIC_DIR="$(ask "Musik-Ordner" "$DEF_MUSIC")"

  mkdir -p "${BASE}/data" "$MUSIC_DIR" || error "Ordner konnten nicht angelegt werden: ${BASE}/data, ${MUSIC_DIR}
        Gibt es das Volume / den Pool? Pfad mit --data-dir bzw. --music-path angeben."

  # Config file: keep secrets across re-installs
  local ENV_FILE="${BASE}/cumu.env" SECRET CODE
  SECRET="$(grep -E '^SESSION_SECRET=.+' "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
  CODE="$(grep -E '^ADMIN_LOGIN_CODE=.+' "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
  [[ -n "$SECRET" ]] || SECRET="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
  [[ -n "$CODE" ]]   || CODE="$(gen_admin_code)"
  # NAS drives are shared with the container under the SAME path, so any NAS
  # path (e.g. /volume1/music) can be entered in cumu as it is.
  local -a SHARES=() MOUNTS=()
  local d
  case "$PLATFORM" in
    synology|asustor) for d in /volume[0-9]*; do [[ -d "$d" ]] && SHARES+=("$d"); done ;;
    qnap)             [[ -d /share ]] && SHARES+=("/share") ;;
    unraid|truenas)   [[ -d /mnt ]] && SHARES+=("/mnt") ;;
  esac
  local inside=false
  for d in "${SHARES[@]}"; do [[ "$MUSIC_DIR" == "$d" || "$MUSIC_DIR" == "$d"/* ]] && inside=true; done
  [[ "$inside" == true ]] || SHARES+=("$MUSIC_DIR")
  for d in "${SHARES[@]}"; do MOUNTS+=(-v "${d}:${d}"); done
  log "Für cumu freigegeben: ${SHARES[*]}"

  cat > "$ENV_FILE" << ENVEOF
NODE_ENV=production
PORT=3000
MUSIC_PATH=${MUSIC_DIR}
SESSION_SECRET=${SECRET}
ADMIN_LOGIN_CODE=${CODE}
WATCHTOWER_URL=http://cumu_watchtower:8080
WATCHTOWER_HTTP_API_TOKEN=cumu-watchtower-internal
ENVEOF
  chmod 600 "$ENV_FILE"

  log "Lade das cumu-Image..."
  "$DOCKER" pull ghcr.io/wolfiku/cumu:latest
  "$DOCKER" pull containrrr/watchtower:latest

  "$DOCKER" network inspect cumu-net &>/dev/null || "$DOCKER" network create cumu-net >/dev/null
  "$DOCKER" rm -f cumu cumu_watchtower &>/dev/null || true

  log "Starte cumu..."
  "$DOCKER" run -d --name cumu --restart unless-stopped --network cumu-net \
    -p "${PORT}:3000" --env-file "$ENV_FILE" \
    -v "${BASE}/data:/app/data" "${MOUNTS[@]}" \
    --label com.centurylinklabs.watchtower.enable=true \
    ghcr.io/wolfiku/cumu:latest >/dev/null

  "$DOCKER" run -d --name cumu_watchtower --restart unless-stopped --network cumu-net \
    -e WATCHTOWER_CLEANUP=true -e WATCHTOWER_POLL_INTERVAL=300 -e WATCHTOWER_LABEL_ENABLE=true \
    -e WATCHTOWER_HTTP_API_UPDATE=true -e WATCHTOWER_HTTP_API_PERIODIC_POLLS=true \
    -e WATCHTOWER_HTTP_API_TOKEN=cumu-watchtower-internal \
    -v /var/run/docker.sock:/var/run/docker.sock \
    containrrr/watchtower:latest >/dev/null

  local IP
  IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
  [[ -n "$IP" ]] || IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<NF;i++) if($i=="src") print $(i+1)}' || true)
  [[ -n "$IP" ]] || IP="<NAS-IP>"

  echo ""
  echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}  cumu läuft jetzt als Docker-Container!${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "  [+] ${BOLD}Erreichbar unter:${NC}  ${BOLD}${GREEN}http://${IP}:${PORT}${NC}"
  echo ""
  echo -e "  [+] ${BOLD}Admin-Code (bei jedem Admin-Login erforderlich):${NC}"
  echo -e "      ${BOLD}${GREEN}${CODE}${NC}"
  echo -e "      Gespeichert in ${ENV_FILE}"
  echo ""
  echo -e "  [+] ${BOLD}Ordner:${NC}"
  echo -e "      Daten:  ${BASE}/data"
  echo -e "      Musik:  ${MUSIC_DIR}  (in cumu jederzeit änderbar, freigegeben: ${SHARES[*]})"
  echo ""
  echo -e "  [+] ${BOLD}Verwaltung:${NC}"
  echo -e "      Logs:          ${BOLD}docker logs -f cumu${NC}"
  echo -e "      Neu starten:   ${BOLD}docker restart cumu${NC}"
  echo -e "      Updates:       automatisch (Watchtower) oder Admin-Bereich"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

# ── Existing installation: update or fresh install? ─────────────────────────
# Update keeps database, users, settings and the admin code. A fresh install
# deletes them. Music files are never deleted.
EXISTING=""
DOCKER_BIN="$(find_docker 2>/dev/null || true)"
if [[ -n "$DOCKER_BIN" ]] && "$DOCKER_BIN" inspect cumu &>/dev/null; then
  EXISTING="docker"
elif [[ -f /etc/systemd/system/cumu.service || -f "${INSTALL_DIR}/src/server.js" ]]; then
  EXISTING="native"
fi

if [[ -n "$EXISTING" ]]; then
  if [[ -z "$ACTION" ]]; then
    ACTION="update"
    if has_tty; then
      CHOSEN_IN_MENU=true
      echo ""
      echo -e "${BOLD}[+] cumu ist bereits installiert ($([[ "$EXISTING" == docker ]] && echo "Docker-Container" || echo "${INSTALL_DIR}")).${NC}"
      echo "    1) Aktualisieren        — Benutzer, Einstellungen, Bibliothek und Admin-Code bleiben"
      echo "    2) Komplett neu installieren — Datenbank, Benutzer und Einstellungen werden gelöscht"
      echo "                               (deine Musikdateien bleiben erhalten)"
      echo "    3) Abbrechen"
      echo -ne "    Auswahl [Standard: 1]: "
      read -r choice </dev/tty || choice=""
      case "${choice// /}" in
        2) ACTION="reinstall" ;;
        3) log "Abgebrochen."; exit 0 ;;
        *) ACTION="update" ;;
      esac
    fi
  fi

  if [[ "$ACTION" == "reinstall" && "$CHOSEN_IN_MENU" == true ]]; then
    echo -ne "    ${RED}Wirklich alles außer den Musikdateien löschen?${NC} Zum Bestätigen 'ja' eingeben: "
    read -r confirm </dev/tty || confirm=""
    [[ "$confirm" == "ja" ]] || { log "Abgebrochen, nichts wurde gelöscht."; exit 0; }
  fi

  if [[ "$EXISTING" == "docker" ]]; then
    OLD_DATA="$("$DOCKER_BIN" inspect -f '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Source}}{{end}}{{end}}' cumu 2>/dev/null || true)"
    OLD_BASE="${OLD_DATA%/data}"
    OLD_PORT="$("$DOCKER_BIN" port cumu 3000/tcp 2>/dev/null | head -n1 | awk -F: '{print $NF}' || true)"
    if [[ "$ACTION" == "update" ]]; then
      [[ -n "$OLD_BASE" && -z "$DOCKER_BASE" ]] && DOCKER_BASE="$OLD_BASE"
      OLD_MUSIC="$(grep -E '^MUSIC_PATH=.+' "${DOCKER_BASE}/cumu.env" 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
      [[ -n "$OLD_MUSIC" && "$MUSIC_SET_VIA_ARG" == false ]] && { MUSIC_DIR="$OLD_MUSIC"; MUSIC_SET_VIA_ARG=true; }
      [[ -n "$OLD_PORT" && "$PORT_SET_VIA_ARG" == false ]] && { PORT="$OLD_PORT"; PORT_SET_VIA_ARG=true; }
      FORCE_DOCKER=true
      log "Aktualisiere cumu (Daten in ${DOCKER_BASE:-?})..."
    else
      log "Entferne die bisherige Installation..."
      "$DOCKER_BIN" rm -f cumu cumu_watchtower &>/dev/null || true
      if [[ -n "$OLD_DATA" && -d "$OLD_DATA" ]]; then rm -rf "$OLD_DATA"; fi
      [[ -n "$OLD_BASE" ]] && rm -f "${OLD_BASE}/cumu.env"
      [[ -n "$OLD_BASE" && -z "$DOCKER_BASE" ]] && DOCKER_BASE="$OLD_BASE"
    fi
  else
    if [[ "$ACTION" == "update" ]]; then
      OLD_PORT="$(grep -E '^PORT=.+' "${INSTALL_DIR}/.env" 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
      [[ -n "$OLD_PORT" && "$PORT_SET_VIA_ARG" == false ]] && { PORT="$OLD_PORT"; PORT_SET_VIA_ARG=true; }
      log "Aktualisiere cumu in ${INSTALL_DIR} ..."
    else
      log "Entferne die bisherige Installation..."
      systemctl stop cumu &>/dev/null || true
      # Only delete a folder that really is a cumu installation (contains
      # database and .env); the music folder lives elsewhere and is kept
      # (a "music" folder inside the installation is kept as well)
      if [[ -f "${INSTALL_DIR}/src/server.js" ]]; then
        find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 ! -name music -exec rm -rf {} +
      fi
    fi
  fi
fi

ask_port

if [[ "$FORCE_DOCKER" == true || "$PLATFORM" != "linux" ]]; then
  log "Plattform: ${PLATFORM} — installiere cumu als Docker-Container"
  install_docker_mode
  exit 0
fi

# ── Detect OS ────────────────────────────────────────────────────────────────
# Detect the distro name, then reduce it to a family the install steps know:
# debian (apt), fedora (dnf/yum) or arch (pacman). Falls back to release files
# and finally to whichever package manager exists.
OS_NAME=""
OS_FAMILY=""
for f in /etc/os-release /usr/lib/os-release; do
  if [[ -r "$f" ]]; then
    OS_NAME="$(. "$f" && echo "${ID:-}")"
    OS_LIKE="$(. "$f" && echo "${ID_LIKE:-}")"
    for id in $OS_NAME $OS_LIKE; do
      case "$id" in
        ubuntu|debian|linuxmint|pop|raspbian|elementary|zorin|kali|devuan) OS_FAMILY="debian"; break ;;
        fedora|rhel|centos|rocky|almalinux|ol|amzn) OS_FAMILY="fedora"; break ;;
        arch|manjaro|endeavouros|garuda) OS_FAMILY="arch"; break ;;
      esac
    done
    break
  fi
done

if [[ -z "$OS_FAMILY" ]]; then
  if   [[ -f /etc/debian_version ]]; then OS_FAMILY="debian"
  elif [[ -f /etc/redhat-release || -f /etc/fedora-release ]]; then OS_FAMILY="fedora"
  elif [[ -f /etc/arch-release ]]; then OS_FAMILY="arch"
  elif command -v apt-get &>/dev/null; then OS_FAMILY="debian"
  elif command -v dnf &>/dev/null || command -v yum &>/dev/null; then OS_FAMILY="fedora"
  elif command -v pacman &>/dev/null; then OS_FAMILY="arch"
  fi
fi

# Unknown system without a supported package manager, but Docker exists
# (e.g. TerraMaster, UGREEN or other NAS) → use the container install.
if [[ -z "$OS_FAMILY" ]] && find_docker &>/dev/null; then
  log "Kein unterstützter Paketmanager, aber Docker gefunden — installiere als Container"
  install_docker_mode
  exit 0
fi

if [[ -z "$OS_FAMILY" ]]; then
  error "Betriebssystem nicht unterstützt oder nicht erkannt ($(uname -s 2>/dev/null) $(uname -r 2>/dev/null), ID='${OS_NAME:-?}').
        Unterstützt: Debian/Ubuntu, Fedora/RHEL, Arch. Alternativ: Docker (docker-compose.yml)."
fi

OS_ID="$OS_FAMILY"
log "Detected OS: ${OS_NAME:-unknown} (${OS_FAMILY})"

# ── Install dependencies ──────────────────────────────────────────────────────
install_node() {
  if command -v node &>/dev/null; then
    NODE_VER=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ $NODE_VER -ge 18 ]]; then
      log "Node.js $(node --version) already installed"
      return
    fi
    warn "Node.js version too old ($(node --version)), upgrading..."
  fi

  log "Installing Node.js 20.x..."
  case "$OS_ID" in
    ubuntu|debian|linuxmint|pop)
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      apt-get install -y nodejs
      ;;
    fedora|rhel|centos|rocky|almalinux)
      curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
      dnf install -y nodejs || yum install -y nodejs
      ;;
    arch|manjaro)
      pacman -Sy --noconfirm nodejs npm
      ;;
    *)
      error "Unsupported OS: ${OS_ID}. Install Node.js 18+ manually then re-run."
      ;;
  esac
}

install_node

# Install git, curl, wget, rsync
case "$OS_ID" in
  ubuntu|debian|linuxmint|pop)
    apt-get install -y --no-install-recommends git curl wget rsync
    ;;
  fedora|rhel|centos|rocky|almalinux)
    dnf install -y git curl wget rsync || yum install -y git curl wget rsync
    ;;
  arch|manjaro)
    pacman -Sy --noconfirm git curl wget rsync
    ;;
esac

# ── Create system user ────────────────────────────────────────────────────────
if ! id "$SERVICE_USER" &>/dev/null; then
  log "Creating system user '${SERVICE_USER}'..."
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

# ── Download cumu ─────────────────────────────────────────────────────────────
log "Downloading cumu from GitHub..."
mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$MUSIC_DIR"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

wget -qO "${TMP_DIR}/cumu.tar.gz" "${ARCHIVE_URL}"
tar -xzf "${TMP_DIR}/cumu.tar.gz" -C "$TMP_DIR" --strip-components=1

if command -v rsync &>/dev/null; then
  rsync -a --delete \
    --exclude='data/' \
    --exclude='.env' \
    --exclude='node_modules/' \
    "${TMP_DIR}/" "${INSTALL_DIR}/"
else
  mkdir -p "${INSTALL_DIR}"
  cp -rf "${TMP_DIR}"/* "${INSTALL_DIR}/"
fi

# ── Install npm dependencies ──────────────────────────────────────────────────
log "Installing npm dependencies..."
cd "$INSTALL_DIR"
npm ci --omit=dev --silent

# ── Write environment file ────────────────────────────────────────────────────
ENV_FILE="${INSTALL_DIR}/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  SESSION_SECRET=$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 48)
  cat > "$ENV_FILE" << ENVEOF
PORT=${PORT}
HOST=0.0.0.0
MUSIC_PATH=${MUSIC_DIR}
DATA_PATH=${DATA_DIR}
SESSION_SECRET=${SESSION_SECRET}
ENVEOF
  log "Created .env at ${ENV_FILE}"
fi

# Admin login code — required for every admin login
if ! grep -qE '^\s*ADMIN_LOGIN_CODE=.+' "$ENV_FILE"; then
  ADMIN_LOGIN_CODE=$(node -e "const a='ABCDEFGHJKMNPQRSTUVWXYZ23456789';const b=require('crypto').randomBytes(16);let c='';for(let i=0;i<16;i++){if(i&&i%4===0)c+='-';c+=a[b[i]%a.length]}console.log(c)")
  sed -i '/^\s*ADMIN_LOGIN_CODE\s*=/d' "$ENV_FILE"
  echo "ADMIN_LOGIN_CODE=${ADMIN_LOGIN_CODE}" >> "$ENV_FILE"
  log "Generated ADMIN_LOGIN_CODE in ${ENV_FILE}"
fi
chmod 600 "$ENV_FILE"
ADMIN_LOGIN_CODE=$(grep -E '^\s*ADMIN_LOGIN_CODE=' "$ENV_FILE" | tail -n1 | cut -d= -f2-)

# ── Fix permissions ───────────────────────────────────────────────────────────
chown -R "${SERVICE_USER}:${SERVICE_USER}" "$INSTALL_DIR" "$DATA_DIR" "$MUSIC_DIR"

# ── Install systemd service ───────────────────────────────────────────────────
log "Installing systemd service..."
cat > /etc/systemd/system/cumu.service << SERVICEEOF
[Unit]
Description=cumu music streaming server
Documentation=https://github.com/Wolfiku/cumu
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=$(which node) src/server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=cumu

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=${INSTALL_DIR} ${DATA_DIR} ${MUSIC_DIR}
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
SERVICEEOF

systemctl daemon-reload
systemctl enable cumu
systemctl restart cumu

# ── Install update script & daily cronjob ─────────────────────────────────────
cp "${INSTALL_DIR}/scripts/update.sh" /usr/local/bin/cumu-update
chmod +x /usr/local/bin/cumu-update

if [[ -d /etc/cron.daily ]]; then
  log "Installing daily auto-update cronjob in /etc/cron.daily/cumu-update..."
  cat > /etc/cron.daily/cumu-update << 'CRONEOF'
#!/bin/sh
/usr/local/bin/cumu-update --silent >/dev/null 2>&1
CRONEOF
  chmod +x /etc/cron.daily/cumu-update
fi

# ── Done ─────────────────────────────────────────────────────────────────────
IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
[[ -n "$IP" ]] || IP="<server-ip>"

echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  cumu wurde erfolgreich installiert!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  [+] ${BOLD}Der Server ist erreichbar unter:${NC}"
echo -e "      ${BOLD}${GREEN}http://${IP}:${PORT}${NC}"
echo -e "      ${BOLD}${GREEN}http://localhost:${PORT}${NC}"
echo ""
echo -e "  [+] ${BOLD}Ersteinrichtung:${NC}"
echo -e "      Öffne eine der obigen URLs im Browser, um den First-Time Setup Wizard zu starten."
echo ""
echo -e "  [+] ${BOLD}Admin-Code (bei jedem Admin-Login erforderlich):${NC}"
echo -e "      ${BOLD}${GREEN}${ADMIN_LOGIN_CODE}${NC}"
echo -e "      Gespeichert als ADMIN_LOGIN_CODE in ${ENV_FILE}"
echo ""
echo -e "  [+] ${BOLD}Befehle zur Verwaltung:${NC}"
echo -e "      Status prüfen:  ${BOLD}systemctl status cumu${NC}"
echo -e "      Logs anzeigen:  ${BOLD}journalctl -u cumu -f${NC}"
echo -e "      Musik-Ordner:   ${BOLD}${MUSIC_DIR}${NC}"
echo -e "      Aktualisieren:  ${BOLD}cumu-update${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
