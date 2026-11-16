#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# cumu — Update script
# Updates cumu to the latest release while preserving data and config.
# Only published releases are installed (not every push to main), and only
# when the release is newer than the installed version.
#
# Usage:
#   cumu-update
#   cumu-update --restart         # restart the service even if already up-to-date
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
FORCE_RESTART=false
SILENT_MODE=false

log()   { [[ "$SILENT_MODE" == false ]] && echo -e "${GREEN}[cumu-update]${NC} $*" || true; }
warn()  { [[ "$SILENT_MODE" == false ]] && echo -e "${YELLOW}[warn]${NC} $*" || true; }
error() { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

CURRENT_UID="$(id -u 2>/dev/null || echo "${EUID:-unknown}")"
if [[ "$CURRENT_UID" != "0" ]]; then
  error "Das Update-Skript muss als root laufen, läuft aber als '$(id -un 2>/dev/null || whoami)' (UID ${CURRENT_UID}). Versuche: sudo cumu-update"
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --restart) FORCE_RESTART=true; shift ;;
    --silent)  SILENT_MODE=true;  shift ;;
    *) warn "Unknown argument: $1"; shift ;;
  esac
done

# ── Check current version ─────────────────────────────────────────────────────
CURRENT_VERSION=$(node -p "require('${INSTALL_DIR}/package.json').version" 2>/dev/null || echo "0.0.0")

# The latest release: github.com/<repo>/releases/latest redirects to its tag
# (no API call, so no API rate limit)
LATEST_URL=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "${REPO}/releases/latest" || true)
LATEST_TAG="${LATEST_URL##*/tag/}"
if [[ -z "$LATEST_URL" || "$LATEST_TAG" == "$LATEST_URL" || -z "$LATEST_TAG" ]]; then
  error "Keine Release gefunden (GitHub nicht erreichbar?). Es wurde nichts geändert."
fi
LATEST_VERSION="${LATEST_TAG#v}"
ARCHIVE_URL="${REPO}/archive/refs/tags/${LATEST_TAG}.tar.gz"
LATEST_SHA="$LATEST_TAG"

log "Installed: ${CURRENT_VERSION}"
log "Latest release: ${LATEST_VERSION}"

# Semver comparison: is $1 newer than $2? (0.7.0 > 0.7.0-alpha > 0.6.1)
version_newer() {
  node -e '
    const parse = v => { const [core, pre] = v.replace(/^v/, "").split("-"); return { core: core.split(".").map(Number), pre }; };
    const a = parse(process.argv[1]), b = parse(process.argv[2]);
    for (let i = 0; i < 3; i++) {
      const x = a.core[i] || 0, y = b.core[i] || 0;
      if (x !== y) process.exit(x > y ? 0 : 1);
    }
    if (a.pre === b.pre) process.exit(1);
    if (!a.pre) process.exit(0);
    if (!b.pre) process.exit(1);
    process.exit(a.pre.localeCompare(b.pre, undefined, { numeric: true }) > 0 ? 0 : 1);
  ' "$1" "$2"
}

# Never install an older release over a newer installation
if ! version_newer "$LATEST_VERSION" "$CURRENT_VERSION"; then
  if [[ "$FORCE_RESTART" == true ]]; then
    log "Already up-to-date (${CURRENT_VERSION}). Restarting the service..."
    systemctl restart cumu
  else
    log "Already up-to-date (${CURRENT_VERSION}). Use --restart to restart the service anyway."
  fi
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

# ── Save the installed release ────────────────────────────────────────────────
echo "$LATEST_SHA" > "${INSTALL_DIR}/.installed_sha"

# This script updates itself with the one of the installed release, unless
# that one is from before updates followed releases (it would pull main again)
if [[ -f "${INSTALL_DIR}/scripts/update.sh" ]] && grep -q 'releases/latest' "${INSTALL_DIR}/scripts/update.sh"; then
  install -m 755 "${INSTALL_DIR}/scripts/update.sh" /usr/local/bin/cumu-update 2>/dev/null || true
fi

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
