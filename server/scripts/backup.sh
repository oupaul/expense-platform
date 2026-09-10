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

# 自動備份是應用程式自己內建的排程(server/src/services/backupScheduler.ts，node-cron)，
# 平常都是以 API 服務本身的帳號(install.sh 設定的服務帳號，不是 root)執行這支腳本；
# 但管理者有時候會手動用 sudo/root 直接跑這支腳本(例如剛才這樣手動測試、或系統管理
# 習慣用 root 操作)，如果那次是 BACKUP_DIR 第一次被建立，目錄擁有者就會變成 root，
# 之後應用程式自己排程要寫入新的備份檔案時就會撞 Permission denied——只有這裡是用
# root 身分執行時才做得到 chown，用服務帳號執行時想 chown 也一定會失敗，索性只在
# 真的是 root 的時候校正，跟 uploads/ 目錄同一個修法。
if [ "$(id -u)" -eq 0 ]; then
  chown --reference="$ENV_FILE" "$BACKUP_DIR"
fi

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
# 這支腳本有時候會被用 root 手動執行(見上面 BACKUP_DIR 那段的說明)。如果 uploads/
# 在這裡是第一次被建立(例如還沒有人上傳過附件、備份就先跑了一次)，資料夾擁有者
# 會是 root，之後 API 服務(以 install.sh 設定的服務帳號執行)要在裡面建立子資料夾
# 就會撞 EACCES。用 server/.env 的擁有者(install.sh 一定會 chown 給服務帳號)校正
# 回來，不管 uploads/ 是不是這裡才新建的、用哪個身分跑幾次都安全(這行從加進來就
# 一直是不分身分執行，實測服務帳號對自己已經擁有的目錄重新 chown 成同一個擁有者
# 不會出錯)。BACKUP_DIR 那段刻意多判斷一次是不是 root，是因為那個情境需要「把
# 擁有者從 root 校正回服務帳號」，不是校正回自己，服務帳號沒有權限做這件事。
mkdir -p "$APP_DIR/server/uploads"
chown --reference="$ENV_FILE" "$APP_DIR/server/uploads"
tar czf "$BACKUP_DIR/uploads-$TIMESTAMP.tar.gz" -C "$APP_DIR/server" uploads

log "清理 $KEEP_DAYS 天前的舊備份..."
find "$BACKUP_DIR" -name "db-*.sql.gz" -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name "env-backup-*" -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name "uploads-*.tar.gz" -mtime +"$KEEP_DAYS" -delete

log "備份完成：$BACKUP_DIR"
