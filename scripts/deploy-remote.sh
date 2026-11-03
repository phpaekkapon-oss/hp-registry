#!/usr/bin/env bash
# Runs on the server (uploaded and started by deploy.bat). Usage: deploy-remote.sh <app-dir> <pm2-name>
set -euo pipefail

APP_DIR="$1"
APP_NAME="$2"
ARCHIVE="/tmp/${APP_NAME}-deploy.tar.gz"

if [ ! -f "$APP_DIR/backend/.env" ]; then
  echo "[ERROR] ไม่พบ $APP_DIR/backend/.env บนเซิร์ฟเวอร์"
  echo "        สร้างไฟล์นี้ก่อน (คัดลอกจาก backend/.env.example แล้วกรอกค่าจริง) แล้วรัน deploy.bat ใหม่"
  exit 10
fi

echo "[remote] แตกไฟล์ลง $APP_DIR"
tar -xzf "$ARCHIVE" -C "$APP_DIR"
rm -f "$ARCHIVE"

cd "$APP_DIR"
echo "[remote] ติดตั้ง dependencies ของ backend"
npm ci -w backend --no-audit --no-fund

echo "[remote] รีสตาร์ท pm2 ($APP_NAME)"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
else
  pm2 start npm --name "$APP_NAME" --cwd "$APP_DIR" -- start
fi
pm2 save
pm2 status "$APP_NAME"
