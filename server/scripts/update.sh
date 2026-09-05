#!/usr/bin/env bash
# 一鍵更新：git pull -> 安裝依賴(前後端) -> prisma generate + migrate deploy ->
# build(前後端) -> 重啟服務，取代掉每次都要手動貼一長串指令的做法。
#
# 用法：bash server/scripts/update.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/apps/expense-platform}"
SERVICE_NAME="${SERVICE_NAME:-expense-platform-api}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

cd "$APP_DIR"

# 之前好幾次更新失敗，根源都是這個：主機上有一筆意外的本機修改(例如 package.json
# 被某個操作動過)卡住 git pull，導致後面全部步驟在「舊程式碼」上執行、卻沒有任何
# 錯誤提示。這裡先擋下來，不自動幫你捨棄或 stash——那可能是有意義的修改，
# 要不要丟掉應該由人決定，不是腳本自己判斷。
if [ -n "$(git status --porcelain)" ]; then
  echo "偵測到未提交的本機修改，為了安全不會自動處理，請先確認以下內容：" >&2
  git status >&2
  echo "" >&2
  echo "確認可以捨棄的話，可以手動執行 git restore <檔案> 或 git stash 後再重跑這支腳本。" >&2
  exit 1
fi

log "更新前先備份一次(可設定 SKIP_PRE_UPDATE_BACKUP=1 跳過)..."
if [ "${SKIP_PRE_UPDATE_BACKUP:-0}" != "1" ]; then
  bash "$APP_DIR/server/scripts/backup.sh"
fi

log "拉取最新程式碼..."
BEFORE_COMMIT="$(git rev-parse HEAD)"
git pull
AFTER_COMMIT="$(git rev-parse HEAD)"

if [ "$BEFORE_COMMIT" = "$AFTER_COMMIT" ]; then
  log "已經是最新版本($AFTER_COMMIT)，不需要更新。"
  exit 0
fi

log "本次更新內容："
git log --oneline "$BEFORE_COMMIT..$AFTER_COMMIT"

log "安裝前端依賴..."
npm ci --ignore-scripts

log "安裝後端依賴..."
npm --prefix server ci --ignore-scripts

log "產生 Prisma Client..."
npm --prefix server run prisma:generate

log "套用資料庫 migration(沒有新 migration 的話這步不會有任何動作)..."
(cd server && npx prisma migrate deploy)

log "建置後端..."
npm --prefix server run build

log "建置前端..."
npm run build

log "重新啟動 $SERVICE_NAME ..."
sudo systemctl restart "$SERVICE_NAME"

# 重啟後稍微等一下再檢查，避免程式還沒完全啟動就被誤判成失敗。
sleep 2
if sudo systemctl is-active --quiet "$SERVICE_NAME"; then
  log "更新完成，服務運作中。"
  sudo systemctl status "$SERVICE_NAME" --no-pager
else
  echo "服務沒有正常啟動，請檢查：sudo journalctl -u $SERVICE_NAME -n 50" >&2
  exit 1
fi
