#!/usr/bin/env bash
# 一次備份三樣東西：資料庫、server/.env、server/uploads/(憑證附件)，
# 全部存到 BACKUP_DIR，保留最近 KEEP_DAYS 天，其餘自動刪除。
# 冪等、無互動輸入，設計成可以直接放進 cron 每天跑。
#
# 用法： APP_DIR=/srv/apps/expense-platform BACKUP_DIR=/srv/backups/expense-platform ./backup.sh
# 三個環境變數都有預設值，不帶也能跑。
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/apps/expense-platform}"
BACKUP_DIR="${BACKUP_DIR:-/srv/backups/expense-platform}"
KEEP_DAYS="${KEEP_DAYS:-14}"
ENV_FILE="$APP_DIR/server/.env"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

if [ ! -f "$ENV_FILE" ]; then
  echo "找不到 $ENV_FILE，請確認 APP_DIR 設定正確" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# 從 server/.env 的 DATABASE_URL 解析連線資訊，不用在這支腳本裡另外存一份帳密。
# 密碼是專案慣例產生的 hex 字串(openssl rand -hex)，不會有 :／@／/ 這些會弄壞下面
# regex 的字元；如果之後改用別的方式產生密碼、含有特殊字元，這裡要跟著調整。
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

log "備份資料庫 ($DB_NAME)..."
# --clean --if-exists 讓備份檔案本身包含 DROP ... IF EXISTS，還原時才能真的覆蓋掉
# 目標資料庫既有的資料表——沒有這兩個參數的話，restore.sh 對著「還在的」資料庫還原時，
# 每張表都會撞到「already exists」/「duplicate key」，psql 預設不會因為出錯就中止，
# 於是整個還原動作看起來「跑完了」、結束碼還是 0，但實際上一筆資料都沒真的還原進去。
PGPASSWORD="$DB_PASS" pg_dump --clean --if-exists -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" "$DB_NAME" | gzip > "$BACKUP_DIR/db-$TIMESTAMP.sql.gz"

log "備份 .env..."
cp "$ENV_FILE" "$BACKUP_DIR/env-backup-$TIMESTAMP"
chmod 600 "$BACKUP_DIR/env-backup-$TIMESTAMP"

log "備份憑證附件..."
mkdir -p "$APP_DIR/server/uploads"
tar czf "$BACKUP_DIR/uploads-$TIMESTAMP.tar.gz" -C "$APP_DIR/server" uploads

log "清理 $KEEP_DAYS 天前的舊備份..."
find "$BACKUP_DIR" -name "db-*.sql.gz" -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name "env-backup-*" -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name "uploads-*.tar.gz" -mtime +"$KEEP_DAYS" -delete

log "備份完成：$BACKUP_DIR"
