#!/usr/bin/env bash
# 全新 Ubuntu 主機的一鍵安裝：系統套件 -> Node(nvm) -> PostgreSQL -> .env ->
# migrate + build -> systemd -> nginx -> (選配)HTTPS/防火牆/示範資料/平台管理者帳號。
# 把 README「部署」那一整節手動操作收斂成一支腳本 + 互動問答，取代逐段手貼指令。
#
# 用法(在一台全新的 Ubuntu 24.04 主機上，用有 sudo 權限的一般使用者執行)：
#   git clone <這個 repo 的網址> /srv/apps/expense-platform
#   cd /srv/apps/expense-platform && sudo bash server/scripts/install.sh
#
# 這支腳本假設主機是全新的(沒有跑過的 systemd service、沒有衝突的 nginx site)，
# 不是拿來對「已經在跑」的環境做增量升級——那是 update.sh 的工作，兩支腳本分工不同。
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/apps/expense-platform}"
SERVICE_NAME="${SERVICE_NAME:-expense-platform-api}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die() { echo "錯誤：$*" >&2; exit 1; }

# ── 前置檢查 ──────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  die "請用 sudo 執行：sudo bash server/scripts/install.sh"
fi

# 服務跟 npm/node 都不該用 root 跑(README 的一貫原則)。優先抓「執行 sudo 的那個人」，
# 因為多半就是要用來跑這個服務的一般使用者；如果是直接用 root 登入執行(沒有 SUDO_USER)，
# 就一定要問清楚要用哪個既有帳號，不能自己亂猜或直接退回用 root。
if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
  SERVICE_USER_DEFAULT="$SUDO_USER"
else
  SERVICE_USER_DEFAULT=""
fi

if [ "$(basename "$(pwd)")" != "$(basename "$APP_DIR")" ] && [ ! -d "$APP_DIR/.git" ]; then
  log "提醒：目前所在目錄跟預設的 APP_DIR($APP_DIR) 對不起來。"
  log "如果你是照 README 的步驟把 repo clone 到 $APP_DIR，可以忽略這則訊息；"
  log "如果 clone 到別的路徑，請用 APP_DIR=<你的路徑> sudo -E bash server/scripts/install.sh 重跑。"
fi

# ── 互動問答：收集這次安裝需要的設定 ──────────────────────
ask() {
  local prompt="$1" default="$2" __resultvar="$3" input
  read -r -p "$prompt [$default]: " input </dev/tty
  printf -v "$__resultvar" '%s' "${input:-$default}"
}

confirm() {
  local prompt="$1" default="${2:-N}" input
  local hint="y/N"
  [ "$default" = "Y" ] && hint="Y/n"
  read -r -p "$prompt [$hint]: " input </dev/tty
  input="${input:-$default}"
  [[ "$input" =~ ^[Yy]$ ]]
}

echo "=================================================================="
echo " Expense Platform 一鍵安裝設定"
echo "=================================================================="

SERVICE_USER=""
while [ -z "$SERVICE_USER" ]; do
  ask "要用哪個既有的非 root 使用者執行這個服務？" "$SERVICE_USER_DEFAULT" SERVICE_USER
  if ! id "$SERVICE_USER" >/dev/null 2>&1; then
    echo "找不到使用者「$SERVICE_USER」，請確認帳號存在(用 adduser 建立過)後再輸入一次。" >&2
    SERVICE_USER=""
  fi
done

ask "網域名稱(還沒設定 DNS 的話留空，之後再手動改 nginx 設定)" "" DOMAIN
DB_NAME_DEFAULT="expense_platform_prod"
ask "PostgreSQL 資料庫名稱" "$DB_NAME_DEFAULT" DB_NAME
DB_USER_DEFAULT="expense_app"
ask "PostgreSQL 使用者名稱" "$DB_USER_DEFAULT" DB_USER

DB_PASS="$(openssl rand -hex 24)"
if confirm "要自己指定資料庫密碼嗎？(不指定就用剛剛自動產生的高強度亂數密碼)" "N"; then
  while true; do
    read -r -s -p "請輸入資料庫密碼(不能包含單引號 ')： " DB_PASS </dev/tty
    echo
    [[ "$DB_PASS" != *"'"* ]] && break
    echo "密碼裡不能有單引號，這個字元會弄壞下面建立資料庫使用者用的 SQL 指令，請重新輸入。" >&2
  done
fi

SEED_DEMO="N"
confirm "要灌示範公司/帳號資料嗎？(正式客戶的主機通常不需要，測試/展示環境可以選要)" "N" && SEED_DEMO="Y"

CREATE_PLATFORM_ADMIN="N"
confirm "要現在建立平台管理者帳號嗎？(服務供應商自己登入 /platform 用的帳號)" "Y" && CREATE_PLATFORM_ADMIN="Y"
if [ "$CREATE_PLATFORM_ADMIN" = "Y" ]; then
  ask "平台管理者 Email" "" PLATFORM_ADMIN_EMAIL
  ask "平台管理者姓名" "平台管理者" PLATFORM_ADMIN_NAME
  [ -z "$PLATFORM_ADMIN_EMAIL" ] && { echo "沒有輸入 Email，跳過建立平台管理者帳號。"; CREATE_PLATFORM_ADMIN="N"; }
fi

SETUP_HTTPS="N"
if [ -n "$DOMAIN" ]; then
  confirm "要用 certbot 自動設定 HTTPS 嗎？(網域要先把 DNS 指到這台主機的 IP)" "Y" && SETUP_HTTPS="Y"
  if [ "$SETUP_HTTPS" = "Y" ]; then
    ask "certbot 用的聯絡 Email(憑證到期/安全通知用)" "" CERTBOT_EMAIL
    [ -z "$CERTBOT_EMAIL" ] && { echo "沒有輸入 Email，跳過 HTTPS 設定。"; SETUP_HTTPS="N"; }
  fi
else
  log "沒有輸入網域名稱，跳過 HTTPS 設定(之後有網域了可以自己補跑 certbot --nginx)。"
fi

SETUP_FIREWALL="N"
confirm "要設定防火牆(ufw)嗎？只會開放 22(SSH)/80/443，其餘一律擋掉" "Y" && SETUP_FIREWALL="Y"

echo ""
echo "=================================================================="
echo " 設定確認"
echo "=================================================================="
echo " 安裝目錄　　　：$APP_DIR"
echo " 服務執行帳號　：$SERVICE_USER"
echo " 網域名稱　　　：${DOMAIN:-(未設定，先用主機 IP 存取)}"
echo " 資料庫　　　　：$DB_USER@$DB_NAME(密碼稍後會寫進 server/.env)"
echo " 灌示範資料　　：$SEED_DEMO"
echo " 建立平台管理者：$CREATE_PLATFORM_ADMIN${PLATFORM_ADMIN_EMAIL:+ ($PLATFORM_ADMIN_EMAIL)}"
echo " 設定 HTTPS　　：$SETUP_HTTPS"
echo " 設定防火牆　　：$SETUP_FIREWALL"
echo "=================================================================="
confirm "確認以上設定，開始安裝？" "Y" || die "已取消，沒有做任何變更。"

# 之後的步驟大多要以 SERVICE_USER 的身分執行(npm/node/nvm 都裝在那個使用者底下)。
# 不能只靠 bash -l(login shell)自動載入 nvm：Ubuntu 預設的 .bashrc 開頭就有一段
# 「非互動式就直接 return」的判斷(nvm 安裝時把載入 nvm.sh 的那幾行加在檔案最後面)，
# 這裡的 bash -lc 是非互動式的，會在還沒跑到 nvm 那幾行之前就被那段判斷擋掉、直接
# return，導致 node/npm 根本不在 PATH 上。改成每次都自己手動 export NVM_DIR、
# source nvm.sh，不依賴 .bashrc 有沒有被正常執行到那段——nvm 還沒裝之前這段會是
# no-op(nvm.sh 不存在，[ -s ... ] 判斷失敗)，不影響一開始偵測有沒有裝過 node。
# shellcheck disable=SC2016 # 故意用單引號：$HOME/$NVM_DIR 要留到內層(SERVICE_USER 的) shell 才展開，不是這裡。
NVM_LOAD='export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"'
run_as_service_user() {
  sudo -u "$SERVICE_USER" -H bash -lc "$NVM_LOAD; $1"
}

# 平台管理者姓名/Email 是使用者自己打字輸入的自由文字，可能含有單引號(例如 O'Brien)，
# 直接用字串組出 VAR='$value' 塞進上面那個會被再解析一次的指令字串裡會被引號斷開、壞掉。
# 改用 env 指令把每個變數當獨立參數傳進去，不會被殼層重新斷詞，含什麼字元都安全。
run_as_service_user_env() {
  local email="$1" name="$2"; shift 2
  sudo -u "$SERVICE_USER" -H env "PLATFORM_ADMIN_EMAIL=$email" "PLATFORM_ADMIN_NAME=$name" bash -lc "$NVM_LOAD; $1"
}

# ── 1. 系統套件 ───────────────────────────────────────────
log "更新套件列表、安裝 nginx / PostgreSQL..."
apt-get update -y
apt-get install -y curl nginx postgresql postgresql-contrib
if [ "$SETUP_HTTPS" = "Y" ]; then
  apt-get install -y certbot python3-certbot-nginx
fi

# ── 2. Node.js(用 SERVICE_USER 的 nvm，不要用 root 裝) ──
if run_as_service_user "command -v node" >/dev/null 2>&1; then
  log "偵測到 $SERVICE_USER 已經有 Node.js($(run_as_service_user 'node -v'))，跳過安裝。"
else
  log "用 nvm 幫 $SERVICE_USER 安裝 Node.js LTS..."
  run_as_service_user "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
  run_as_service_user "nvm install --lts"
fi
NODE_BIN="$(run_as_service_user "command -v node")"
[ -n "$NODE_BIN" ] || die "找不到 $SERVICE_USER 的 node 執行檔，Node.js 安裝可能失敗了。"
log "使用的 node：$NODE_BIN"

# ── 3. PostgreSQL 資料庫/使用者(冪等，已存在就跳過) ──────
log "設定 PostgreSQL 資料庫與使用者..."
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
  log "使用者 $DB_USER 已存在，跳過建立(不會更動密碼，如需改密碼請自行處理)。"
else
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
fi
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  log "資料庫 $DB_NAME 已存在，跳過建立。"
else
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
fi

# ── 4. server/.env ────────────────────────────────────────
ENV_FILE="$APP_DIR/server/.env"
if [ -f "$ENV_FILE" ]; then
  confirm "$ENV_FILE 已經存在，要覆蓋嗎？(選否則沿用現有內容、跳過這步)" "N" && WRITE_ENV="Y" || WRITE_ENV="N"
else
  WRITE_ENV="Y"
fi
if [ "$WRITE_ENV" = "Y" ]; then
  log "寫入 server/.env..."
  JWT_SECRET="$(openssl rand -hex 32)"
  cat > "$ENV_FILE" <<EOF
DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME?schema=public"
PORT=4000
JWT_SECRET="$JWT_SECRET"
EOF
  chown "$SERVICE_USER":"$SERVICE_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

# ── 5. 安裝依賴、建表、編譯(全部以 SERVICE_USER 身分執行) ─
chown -R "$SERVICE_USER":"$SERVICE_USER" "$APP_DIR"

log "安裝前後端依賴..."
run_as_service_user "cd '$APP_DIR' && npm ci --ignore-scripts"
run_as_service_user "cd '$APP_DIR' && npm --prefix server ci --ignore-scripts"

log "產生 Prisma Client、套用資料庫 migration..."
run_as_service_user "cd '$APP_DIR' && npm --prefix server run prisma:generate"
run_as_service_user "cd '$APP_DIR/server' && npx prisma migrate deploy"

if [ "$SEED_DEMO" = "Y" ]; then
  log "灌示範資料(帳號密碼會直接印在下面，只有這次看得到，請自行記下來)..."
  run_as_service_user "cd '$APP_DIR' && npm --prefix server run seed"
fi

if [ "$CREATE_PLATFORM_ADMIN" = "Y" ]; then
  log "建立平台管理者帳號(密碼只會印在下面這次，請自行記下來)..."
  run_as_service_user_env "$PLATFORM_ADMIN_EMAIL" "$PLATFORM_ADMIN_NAME" "cd '$APP_DIR' && npm --prefix server run seed:platform-admin"
fi

log "編譯後端、前端..."
run_as_service_user "cd '$APP_DIR' && npm --prefix server run build"
run_as_service_user "cd '$APP_DIR' && npm run build"

# ── 6. systemd service ────────────────────────────────────
log "設定 systemd service..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Expense Platform API
After=network.target postgresql.service

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$APP_DIR/server
ExecStart=$NODE_BIN --env-file=.env dist/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"
sleep 2
if ! systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "服務沒有正常啟動，請檢查：sudo journalctl -u $SERVICE_NAME -n 50" >&2
  exit 1
fi
log "$SERVICE_NAME 運作中。"

# ── 7. nginx ───────────────────────────────────────────────
log "設定 nginx..."

# Ubuntu 的 nginx 套件裝好預設就會啟用一個 sites-enabled/default，裡面是
# `listen 80 default_server;`——不管我們自己的 site 有沒有裝好、有沒有連進
# sites-enabled/，這個預設站台的 default_server 優先權都比較高，導致瀏覽器
# 打開網址看到的是 nginx 內建的「Welcome to nginx!」，不是我們的前端。
# 一定要把它拿掉，不能只是加自己的設定進去就以為完成了。
if [ -e /etc/nginx/sites-enabled/default ]; then
  log "移除 nginx 預設站台(sites-enabled/default)，不然它的 default_server 會蓋過我們的設定..."
  rm -f /etc/nginx/sites-enabled/default
fi

SERVER_NAME="${DOMAIN:-_}"
cat > "/etc/nginx/sites-available/expense-platform" <<EOF
server {
    listen 80 default_server;
    server_name $SERVER_NAME;

    root $APP_DIR/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        client_max_body_size 60M;
    }

    location /public/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host \$host;
    }

    location / {
        try_files \$uri /index.html;
    }

    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
EOF
ln -sf /etc/nginx/sites-available/expense-platform /etc/nginx/sites-enabled/expense-platform
nginx -t
systemctl reload nginx

# ── 8. 防火牆(選配) ────────────────────────────────────────
# 排在 HTTPS 前面：如果等一下要跑 certbot，它的驗證需要外部連得到 port 80，
# 防火牆要先開好，不要等 HTTPS 弄完才開。
if [ "$SETUP_FIREWALL" = "Y" ]; then
  log "設定防火牆(ufw)..."
  apt-get install -y ufw
  # 一定要先開 22 再啟用，不然 SSH 連線會直接被鎖在門外——這台主機多半就是透過 SSH 連進來裝的。
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  if ! ufw status | grep -q "Status: active"; then
    echo "即將啟用防火牆，請確認上面已經看到 22/tcp 被放行，不然這個 SSH 連線接下來可能會斷線！"
    confirm "確定要啟用 ufw 嗎？" "Y" && ufw --force enable
  fi
  ufw status
fi

# ── 9. HTTPS(選配) ────────────────────────────────────────
# 這一步失敗(常見原因：DNS 還沒生效、certbot 連不到這台主機)不應該讓前面已經裝好、
# 能跑的服務被當成整個安裝失敗——所以特別放行讓它失敗也不中止腳本，只印警告，
# 網站還是能用 http 存取，之後 DNS 生效了再自己補跑 certbot --nginx 即可。
HTTPS_OK="N"
if [ "$SETUP_HTTPS" = "Y" ]; then
  log "用 certbot 設定 HTTPS..."
  if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect; then
    HTTPS_OK="Y"
  else
    echo "certbot 設定失敗(常見原因：DNS 還沒生效)，網站目前還是能用 http:// 存取。" >&2
    echo "確認 $DOMAIN 的 DNS 已經指到這台主機後，可以自己重跑：sudo certbot --nginx -d $DOMAIN" >&2
  fi
fi

# ── 完成 ───────────────────────────────────────────────────
echo ""
echo "=================================================================="
echo " 安裝完成"
echo "=================================================================="
echo " 服務：sudo systemctl status $SERVICE_NAME"
echo " 網址：http://${DOMAIN:-<這台主機的 IP>}$( [ "$HTTPS_OK" = "Y" ] && echo "(已設定 HTTPS，會自動導到 https://)" )"
[ "$CREATE_PLATFORM_ADMIN" = "Y" ] && echo " 平台管理者登入路徑：/platform (帳密如上面印出的內容，請自行記下)"
echo " 備份排程：登入平台管理者後台的「備份」分頁可以視覺化設定，不需要另外設定 cron。"
echo " Email 通知(選填)：登入平台管理者後台的「通知」分頁設定 SMTP，不設定的話站內通知"
echo "                   照常運作，只是不會額外寄信。"
echo " 之後要更新版本，跑：cd $APP_DIR && sudo bash server/scripts/update.sh"
echo "=================================================================="
