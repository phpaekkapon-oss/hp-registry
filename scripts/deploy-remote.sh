#!/usr/bin/env bash
# Runs on the server (uploaded and started by deploy.bat). Usage: deploy-remote.sh <app-dir> <pm2-name>
set -euo pipefail

APP_DIR="$1"
APP_NAME="$2"
ARCHIVE="/tmp/${APP_NAME}-deploy.tar.gz"

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

echo "[remote] restarting pm2 ($APP_NAME)"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
else
  pm2 start npm --name "$APP_NAME" --cwd "$APP_DIR" -- start
fi
pm2 save
pm2 status "$APP_NAME"
