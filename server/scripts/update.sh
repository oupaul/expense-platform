#!/usr/bin/env bash
# 一鍵更新：git pull -> 安裝依賴(前後端) -> prisma generate + migrate deploy ->
# build(前後端) -> 重啟服務，取代掉每次都要手動貼一長串指令的做法。
#
# 用法：bash server/scripts/update.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/apps/expense-platform}"
SERVICE_NAME="${SERVICE_NAME:-expense-platform-api}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# 這支腳本常常會被人在已經是 root 的登入階段直接執行(常見於直接用 root SSH 進主機的
# VPS)。git pull、備份、最後的 systemctl restart 這幾步不管用 root 還是服務帳號執行
# 都能動作(root 天生就有權限；服務帳號原本也扛得住，只要有對應的 sudoers 設定)，
# 不用特別處理。但 Node.js/npm 是照 install.sh 的慣例用 nvm 裝在服務執行帳號自己的
# 家目錄底下，root 自己的 shell 環境沒有那條 PATH，會在 npm ci 那步直接卡住(command
# not found)——這裡只把「需要呼叫 npm/npx」的那幾步改成用服務帳號的 login shell(帶
# nvm 相關的 PATH 設定)執行，其餘步驟維持原本用誰執行就用誰的身分，不會動到「用 root
# 執行整支腳本、靠 root 天生的權限重啟服務」這個現有能動的路徑。
SERVICE_USER=""
if [ "$(id -u)" -eq 0 ]; then
  SERVICE_USER="$(stat -c '%U' "$APP_DIR/server/.env" 2>/dev/null || true)"
  if [ -z "$SERVICE_USER" ] || [ "$SERVICE_USER" = "root" ]; then
    echo "偵測到用 root 執行，但抓不到服務執行帳號(找不到 $APP_DIR/server/.env，或擁有者本身就是 root)，無法自動改用該帳號執行 npm 相關步驟，請改成用服務帳號直接執行這支腳本。" >&2
    exit 1
  fi
  log "偵測到用 root 執行，npm/npx 相關步驟會改用服務執行帳號「$SERVICE_USER」執行。"
fi

# 跟 install.sh 的 run_as_service_user 用同一招：不能只靠 login shell(-l)自動載入
# profile 檔案就假設 nvm 的 PATH 設定一定生效——nvm 官方安裝腳本寫進哪個檔案
# (.bashrc/.profile/.bash_profile)因系統而異，不保證 login shell 一定會讀到，
# 明確手動 source 一次 nvm.sh 才穩。用 "$@" 陣列展開(不是字串拼接)呼叫實際指令，
# 引號、特殊字元都不用自己處理逃脫，也不會有指令注入風險。沒有用 root 執行的話
# (SERVICE_USER 是空字串)就直接照原樣執行。
NVM_LOAD='export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"'
run_npm_step() {
  if [ -n "$SERVICE_USER" ]; then
    # 用分號接、不是 &&：nvm.sh 不存在時 [ -s ... ] 本身回傳非 0，用 && 接的話
    # 會連帶讓後面真正要跑的指令整個被跳過、卻不會有任何清楚的錯誤訊息，
    # 跟 install.sh 的 run_as_service_user 一樣用分號，載入 nvm 失敗也還是會
    # 嘗試執行實際指令(PATH 裡如果本來就有 npm，一樣跑得動)。
    sudo -u "$SERVICE_USER" -H -- bash -lc "$NVM_LOAD"'; exec "$@"' _ "$@"
  else
    "$@"
  fi
}

cd "$APP_DIR"

# install.sh 把整個 APP_DIR 的擁有者設成服務執行帳號，不是 root。git pull 這幾步
# 刻意不像上面 npm 那樣切換成服務帳號執行(root 天生就有權限，不需要切換)，但用 root
# 直接對著「擁有者是別人」的目錄跑 git，目前版本的 git 會因為 dubious ownership 保護
# (CVE-2022-24765 之後加的)直接拒絕動作。這裡的擁有權差異是 install.sh 刻意造成的、
# 不是別人動過手腳，對這一個路徑加例外是安全的。
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

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
run_npm_step npm ci --ignore-scripts

log "安裝後端依賴..."
run_npm_step npm --prefix server ci --ignore-scripts

log "產生 Prisma Client..."
run_npm_step npm --prefix server run prisma:generate

log "套用資料庫 migration(沒有新 migration 的話這步不會有任何動作)..."
(cd server && run_npm_step npx prisma migrate deploy)

log "建置後端..."
run_npm_step npm --prefix server run build

log "建置前端..."
run_npm_step npm run build

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
