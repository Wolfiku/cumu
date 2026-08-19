#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# cumu — Update script
# Updates cumu to the latest version while preserving data and config
#
# Usage:
#   cumu-update
#   cumu-update --restart         # restart even if already up-to-date
#   cumu-update --silent          # silent mode for background cronjobs
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"
BOLD="\033[1m"

INSTALL_DIR="/opt/cumu"
REPO="https://github.com/Wolfiku/cumu"
ARCHIVE_URL="${REPO}/archive/refs/heads/main.tar.gz"
FORCE_RESTART=false
SILENT_MODE=false

log()   { [[ "$SILENT_MODE" == false ]] && echo -e "${GREEN}[cumu-update]${NC} $*" || true; }
warn()  { [[ "$SILENT_MODE" == false ]] && echo -e "${YELLOW}[warn]${NC} $*" || true; }
error() { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

[[ $EUID -ne 0 ]] && error "Update script must run as root. Try running without sudo if already root."

while [[ $# -gt 0 ]]; do
  case "$1" in
    --restart) FORCE_RESTART=true; shift ;;
    --silent)  SILENT_MODE=true;  shift ;;
    *) warn "Unknown argument: $1"; shift ;;
  esac
done

# ── Check current version ─────────────────────────────────────────────────────
CURRENT_SHA="unknown"
if [[ -f "${INSTALL_DIR}/.installed_sha" ]]; then
  CURRENT_SHA=$(cat "${INSTALL_DIR}/.installed_sha")
fi

LATEST_SHA=$(curl -fsSL "https://api.github.com/repos/Wolfiku/cumu/commits/main" \
  | grep '"sha"' | head -1 | cut -d'"' -f4 | cut -c1-12 || echo "unknown")

log "Current: ${CURRENT_SHA}"
log "Latest:  ${LATEST_SHA}"

if [[ "$CURRENT_SHA" == "$LATEST_SHA" ]] && [[ "$FORCE_RESTART" == false ]]; then
  log "Already up-to-date. Use --restart to restart the service anyway."
  exit 0
fi

# ── Stop service ──────────────────────────────────────────────────────────────
log "Stopping cumu service..."
systemctl stop cumu 2>/dev/null || true

# ── Backup current install ────────────────────────────────────────────────────
BACKUP_DIR="/tmp/cumu-backup-$(date +%Y%m%d-%H%M%S)"
log "Creating backup at ${BACKUP_DIR}..."
mkdir -p "$BACKUP_DIR"

if command -v rsync &>/dev/null; then
  rsync -a --exclude='node_modules/' --exclude='data/' "${INSTALL_DIR}/" "${BACKUP_DIR}/"
else
  cp -rf "${INSTALL_DIR}"/* "${BACKUP_DIR}/" 2>/dev/null || true
fi

# ── Download latest ───────────────────────────────────────────────────────────
log "Downloading latest cumu..."
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

wget -qO "${TMP_DIR}/cumu.tar.gz" "${ARCHIVE_URL}"
tar -xzf "${TMP_DIR}/cumu.tar.gz" -C "$TMP_DIR" --strip-components=1

# ── Apply update (preserve .env and data) ────────────────────────────────────
if command -v rsync &>/dev/null; then
  rsync -a --delete \
    --exclude='data/' \
    --exclude='.env' \
    --exclude='.installed_sha' \
    --exclude='node_modules/' \
    "${TMP_DIR}/" "${INSTALL_DIR}/"
else
  cp -rf "${TMP_DIR}"/* "${INSTALL_DIR}/"
fi

# ── Reinstall dependencies ────────────────────────────────────────────────────
log "Updating npm dependencies..."
cd "$INSTALL_DIR"
npm ci --omit=dev --silent

# ── Fix permissions ───────────────────────────────────────────────────────────
SERVICE_USER="cumu"
DATA_DIR=$(grep DATA_PATH "${INSTALL_DIR}/.env" 2>/dev/null | cut -d= -f2 || echo "/var/lib/cumu")
MUSIC_DIR=$(grep MUSIC_PATH "${INSTALL_DIR}/.env" 2>/dev/null | cut -d= -f2 || echo "/var/lib/cumu/music")

chown -R "${SERVICE_USER}:${SERVICE_USER}" "$INSTALL_DIR" "$DATA_DIR" "$MUSIC_DIR" 2>/dev/null || true

# ── Save new SHA ──────────────────────────────────────────────────────────────
echo "$LATEST_SHA" > "${INSTALL_DIR}/.installed_sha"

# ── Restart service ───────────────────────────────────────────────────────────
log "Restarting cumu service..."
systemctl daemon-reload
systemctl restart cumu

sleep 2

if systemctl is-active --quiet cumu; then
  log "${BOLD}Update successful! cumu ${LATEST_SHA} is running.${NC}"
  log "Backup kept at: ${BACKUP_DIR}"
else
  warn "Service failed to start after update. Rolling back..."
  if command -v rsync &>/dev/null; then
    rsync -a --delete \
      --exclude='data/' \
      --exclude='.env' \
      "${BACKUP_DIR}/" "${INSTALL_DIR}/"
  else
    cp -rf "${BACKUP_DIR}"/* "${INSTALL_DIR}/"
  fi
  cd "$INSTALL_DIR"
  npm ci --omit=dev --silent
  chown -R "${SERVICE_USER}:${SERVICE_USER}" "$INSTALL_DIR" 2>/dev/null || true
  systemctl restart cumu
  error "Rollback complete. Check logs with: journalctl -u cumu -f"
fi
