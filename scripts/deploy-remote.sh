#!/usr/bin/env bash
# Runs on the server (uploaded and started by deploy.bat). Usage: deploy-remote.sh <app-dir> <pm2-name>
set -euo pipefail

APP_DIR="$1"
APP_NAME="$2"
ARCHIVE="/tmp/${APP_NAME}-deploy.tar.gz"

# sudo password arrives on stdin from deploy.cjs (never on the command line); empty if none was sent
SUDO_PW=""
IFS= read -r -t 5 SUDO_PW || true

if [ ! -f "$APP_DIR/backend/.env" ]; then
  echo "[remote] missing $APP_DIR/backend/.env"
  exit 10
fi

echo "[remote] extracting to $APP_DIR"
tar -xzf "$ARCHIVE" -C "$APP_DIR"
rm -f "$ARCHIVE"

cd "$APP_DIR"
echo "[remote] installing backend dependencies"
npm ci -w backend --no-audit --no-fund

# This app gets its OWN pm2 (daemon, process list, logs, boot service) inside the app folder,
# so nothing here touches other apps managed by the user's default pm2 (~/.pm2).
USER_PM2_HOME="$HOME/.pm2"
export PM2_HOME="$APP_DIR/.pm2"
mkdir -p "$PM2_HOME"

# One-time migration: an earlier deploy ran this app under the default pm2. Remove only this app from it
# so it can't start twice (and clash on the port) after a reboot. Other apps there are left running.
if [ -d "$USER_PM2_HOME" ] && env PM2_HOME="$USER_PM2_HOME" pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  echo "[remote] moving $APP_NAME out of the shared pm2 (~/.pm2)"
  env PM2_HOME="$USER_PM2_HOME" pm2 delete "$APP_NAME" >/dev/null
  env PM2_HOME="$USER_PM2_HOME" pm2 save >/dev/null
fi

echo "[remote] restarting pm2 ($APP_NAME) with PM2_HOME=$PM2_HOME"
# delete + start (not restart) so the process always runs from APP_DIR, even if it was started elsewhere before
pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
# --kill-timeout: give the app time to save signed-in sessions before it stops (people stay signed in across a deploy)
pm2 start npm --name "$APP_NAME" --cwd "$APP_DIR" --kill-timeout 5000 -- start
pm2 save
pm2 status "$APP_NAME"

# Auto-start after a server reboot: a dedicated systemd service for this app only (needs sudo once)
SERVICE="pm2-$APP_NAME"
if ! systemctl is-enabled "$SERVICE" >/dev/null 2>&1; then
  echo "[remote] setting up auto-start service ($SERVICE)"
  PM2_BIN="$(command -v pm2)"
  NODE_DIR="$(dirname "$(command -v node)")"
  if printf '%s\n' "$SUDO_PW" | sudo -S -p '' env PATH="$PATH:$NODE_DIR" PM2_HOME="$PM2_HOME" "$PM2_BIN" startup systemd -u "$(id -un)" --hp "$HOME" --service-name "$SERVICE" >/dev/null; then
    pm2 save
  else
    echo "[remote] could not set up auto-start (sudo failed). Run on the server:"
    echo "[remote]   PM2_HOME=$PM2_HOME pm2 startup systemd --service-name $SERVICE   (then the sudo command it prints)  and  PM2_HOME=$PM2_HOME pm2 save"
  fi
fi
if systemctl is-enabled "$SERVICE" >/dev/null 2>&1; then
  echo "[remote] auto-start after reboot: ENABLED ($SERVICE)"
else
  echo "[remote] auto-start after reboot: NOT SET UP"
fi
