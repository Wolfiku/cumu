#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# cumu — One-line installer
# Installs Node.js (if missing) + cumu as a systemd service
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Wolfiku/cumu-music/main/scripts/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/Wolfiku/cumu-music/main/scripts/install.sh | bash -s -- --port 8080 --music-path /srv/music
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"
BOLD="\033[1m"

INSTALL_DIR="/opt/cumu"
DATA_DIR="/var/lib/cumu"
MUSIC_DIR="/var/lib/cumu/music"
SERVICE_USER="cumu"
PORT="3000"
REPO="https://github.com/Wolfiku/cumu-music"
ARCHIVE_URL="${REPO}/archive/refs/heads/main.tar.gz"

log()   { echo -e "${GREEN}[cumu]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
error() { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# ── Parse arguments ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)        PORT="$2";        shift 2 ;;
    --music-path)  MUSIC_DIR="$2";   shift 2 ;;
    --install-dir) INSTALL_DIR="$2"; shift 2 ;;
    *) warn "Unknown argument: $1"; shift ;;
  esac
done

# ── Root check ───────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "This installer must run as root. Try: sudo bash"

# ── Detect OS ────────────────────────────────────────────────────────────────
if [[ -f /etc/os-release ]]; then
  . /etc/os-release
  OS_ID="$ID"
else
  error "Cannot detect OS. Please install manually."
fi

log "Detected OS: ${OS_ID}"

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

# Install git + curl if missing
case "$OS_ID" in
  ubuntu|debian|linuxmint|pop)
    apt-get install -y --no-install-recommends git curl wget
    ;;
  fedora|rhel|centos|rocky|almalinux)
    dnf install -y git curl wget || yum install -y git curl wget
    ;;
  arch|manjaro)
    pacman -Sy --noconfirm git curl wget
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

rsync -a --delete \
  --exclude='data/' \
  --exclude='.env' \
  --exclude='node_modules/' \
  "${TMP_DIR}/" "${INSTALL_DIR}/"

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

# ── Fix permissions ───────────────────────────────────────────────────────────
chown -R "${SERVICE_USER}:${SERVICE_USER}" "$INSTALL_DIR" "$DATA_DIR" "$MUSIC_DIR"

# ── Install systemd service ───────────────────────────────────────────────────
log "Installing systemd service..."
cat > /etc/systemd/system/cumu.service << SERVICEEOF
[Unit]
Description=cumu music streaming server
Documentation=https://github.com/Wolfiku/cumu-music
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

# ── Install update script ─────────────────────────────────────────────────────
cp "${INSTALL_DIR}/scripts/update.sh" /usr/local/bin/cumu-update
chmod +x /usr/local/bin/cumu-update

# ── Done ─────────────────────────────────────────────────────────────────────
IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  cumu installed successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Open in browser:   ${BOLD}http://${IP}:${PORT}${NC}"
echo -e "  Service status:    ${BOLD}systemctl status cumu${NC}"
echo -e "  View logs:         ${BOLD}journalctl -u cumu -f${NC}"
echo -e "  Music folder:      ${BOLD}${MUSIC_DIR}${NC}"
echo -e "  Update cumu:       ${BOLD}sudo cumu-update${NC}"
echo ""
echo -e "  Complete the first-time setup wizard in your browser."
echo ""
