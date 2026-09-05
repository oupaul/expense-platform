#!/usr/bin/env bash
# 從備份還原資料庫(+ 選擇性還原 .env、server/uploads/)。
#
# 故意設計成一定要有人在鍵盤前主動打字確認才會執行——這個動作會直接覆蓋掉現有資料庫，
# 不可逆，不應該被串進任何自動化流程。這是刻意保留的一道摩擦力，不是偷懶沒做成按鈕。
#
# 用法：bash restore.sh <timestamp>
#   <timestamp> 是備份檔名裡的那一段，例如 db-20260101-030000.sql.gz 的 timestamp
#   就是 20260101-030000。不帶參數執行會列出目前有哪些可用的備份時間點。
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/apps/expense-platform}"
BACKUP_DIR="${BACKUP_DIR:-/srv/backups/expense-platform}"
ENV_FILE="$APP_DIR/server/.env"
SERVICE_NAME="${SERVICE_NAME:-expense-platform-api}"

TIMESTAMP="${1:-}"
if [ -z "$TIMESTAMP" ]; then
  echo "用法：bash restore.sh <timestamp>" >&2
  echo "" >&2
  echo "目前可用的備份時間點：" >&2
  find "$BACKUP_DIR" -maxdepth 1 -name "db-*.sql.gz" 2>/dev/null \
    | sed -E 's#.*/db-([0-9-]+)\.sql\.gz#\1#' | sort -r >&2
  exit 1
fi

DB_DUMP="$BACKUP_DIR/db-$TIMESTAMP.sql.gz"
ENV_BACKUP="$BACKUP_DIR/env-backup-$TIMESTAMP"
UPLOADS_BACKUP="$BACKUP_DIR/uploads-$TIMESTAMP.tar.gz"

if [ ! -f "$DB_DUMP" ]; then
  echo "找不到 $DB_DUMP" >&2
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "找不到 $ENV_FILE，請確認 APP_DIR 設定正確" >&2
  exit 1
fi

# 解析方式跟 backup.sh 一樣，直接從 server/.env 的 DATABASE_URL 拿連線資訊。
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | sed -E 's/^DATABASE_URL=//; s/^"(.*)"$/\1/')"
if [[ "$DATABASE_URL" =~ ^postgresql://([^:]+):([^@]+)@([^:/]+):([0-9]+)/([^?]+) ]]; then
  DB_USER="${BASH_REMATCH[1]}"
  DB_PASS="${BASH_REMATCH[2]}"
  DB_HOST="${BASH_REMATCH[3]}"
  DB_PORT="${BASH_REMATCH[4]}"
  DB_NAME="${BASH_REMATCH[5]}"
else
  echo "無法解析 $ENV_FILE 裡的 DATABASE_URL，請確認格式是 postgresql://user:pass@host:port/dbname" >&2
  exit 1
fi

echo "=================================================================="
echo "即將把資料庫「$DB_NAME」的內容整個覆蓋成備份檔案：$DB_DUMP"
echo "這個動作無法復原！目前資料庫裡的資料會被取代掉。"
echo "=================================================================="
read -r -p "請輸入資料庫名稱「$DB_NAME」以確認執行還原： " CONFIRM
if [ "$CONFIRM" != "$DB_NAME" ]; then
  echo "輸入不符，中止還原。"
  exit 1
fi

if [ "${SKIP_SERVICE_CONTROL:-0}" != "1" ]; then
  echo "停止 $SERVICE_NAME(避免還原過程中還有請求在寫入資料庫)..."
  sudo systemctl stop "$SERVICE_NAME"
fi

echo "還原資料庫..."
# ON_ERROR_STOP=1：psql 預設遇到 SQL 錯誤會印出來但繼續跑下一行，那樣即使還原中途
# 大量失敗，腳本最後還是會回傳成功——一定要讓它一遇到錯誤就整個中止，好知道還原真的失敗了。
gunzip -c "$DB_DUMP" | PGPASSWORD="$DB_PASS" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" "$DB_NAME"
echo "資料庫還原完成。"

if [ -f "$ENV_BACKUP" ]; then
  read -r -p "找到同時間點的 .env 備份，要一併還原嗎？(y/N) " RESTORE_ENV
  if [ "$RESTORE_ENV" = "y" ] || [ "$RESTORE_ENV" = "Y" ]; then
    cp "$ENV_BACKUP" "$ENV_FILE"
    echo ".env 已還原。"
  fi
fi

if [ -f "$UPLOADS_BACKUP" ]; then
  read -r -p "找到同時間點的憑證附件備份，要一併還原嗎？(會覆蓋掉現有的 server/uploads/) (y/N) " RESTORE_UPLOADS
  if [ "$RESTORE_UPLOADS" = "y" ] || [ "$RESTORE_UPLOADS" = "Y" ]; then
    rm -rf "$APP_DIR/server/uploads"
    tar xzf "$UPLOADS_BACKUP" -C "$APP_DIR/server"
    echo "憑證附件已還原。"
  fi
fi

if [ "${SKIP_SERVICE_CONTROL:-0}" != "1" ]; then
  echo "重新啟動 $SERVICE_NAME ..."
  sudo systemctl start "$SERVICE_NAME"
  sudo systemctl status "$SERVICE_NAME" --no-pager
fi

echo "還原完成。"
