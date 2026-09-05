# Expense Platform — 多租戶費用申請系統

比對兩個既有客戶版型後，把「會因公司而異」的部分抽成資料庫設定，同一套前端／後端可以長出不同
公司的表單、選項清單、簽核關卡、匯率、帳號。

## 功能總覽

- 依公司設定動態渲染的費用申請表單(品牌配色、選配欄位、多幣別)
- Email + 密碼登入(JWT)，角色權限：`admin` / `applicant` / 簽核角色(如 `dept_manager`、`finance`、`ceo`)
- 依 `ApprovalStage` 陣列的循序簽核流程(核准/駁回、跳關會被擋)
- 多幣別換算(後台維護匯率，送出申請單時後端即時換算成 TWD)
- 後台管理：部門／費用項目／費用性質／簽核關卡／匯率／使用者帳號
- 修改密碼(自助)、後台重設密碼(管理員)

## 目錄結構

```
server/                       後端(Node.js + Express + Prisma)
  prisma/schema.prisma          資料庫 schema(PostgreSQL)
  prisma/migrations/            版本化的 migration，部署時用 `prisma migrate deploy` 套用
  prisma/seed.ts                種子腳本，讀 seed-examples/*.json 建立示範公司與帳號
  prisma/seed-examples/         兩份範例設定(demo-a / demo-b，示範兩種不同的欄位/簽核組合)
  src/routes/                   各資源的 Express route(auth / companies / applications / users …)
  src/middleware/auth.ts        requireAuth / requireSameCompany / requireRole
  .env                          本機環境變數(不進 git，見下方「環境變數」)
src/                           前端(Vite + React + shadcn/ui)
  components/admin/              後台管理各區塊(部門/類別/性質/簽核關卡/匯率/帳號)
  hooks/useAuth.ts               登入狀態(存 localStorage)
  hooks/useCompanyConfig.ts      抓公司設定的 React Query hook
vite.config.ts                 dev 時 `/api` proxy 到 http://localhost:4000
```

## 環境需求

- Node.js 20 以上(開發機測試於 v26，用 nvm 管理版本)
- PostgreSQL 14 以上
- npm

## 環境變數(`server/.env`，不進 git)

```bash
DATABASE_URL="postgresql://<user>:<password>@<host>:5432/<db>?schema=public"
PORT=4000
JWT_SECRET="用 openssl rand -hex 32 產生，每個環境(dev/prod)都要不一樣，絕對不要沿用範例值"
```

`server/.env.example` 是範本，複製一份改成 `.env` 後再填真實值：

```bash
cp server/.env.example server/.env
# 產生一組隨機 JWT_SECRET
openssl rand -hex 32
```

## 本機開發

```bash
# 1. 安裝依賴(前端、後端分開裝)
npm install
npm --prefix server install

# 2. 設定資料庫(本機一次性)
createdb expense_platform_dev
cp server/.env.example server/.env   # 填入 DATABASE_URL 與 JWT_SECRET

# 3. 建表 + 灌種子資料
npm --prefix server run prisma:migrate
npm --prefix server run seed

# 4. 兩個服務分別啟動(各開一個終端機)
npm --prefix server run dev     # API：http://localhost:4000
npm run dev                     # 前端：http://localhost:8080，/api 會 proxy 到上面的 API
```

種子帳號(見 `server/prisma/seed.ts`)：`admin@<slug>.test`、`applicant@<slug>.test`、以及每個簽核角色
各一組帳號(`dept_manager@…`、`finance@…`、`ceo@…` 或 `gm@…`)，`<slug>` 是 `demo-a` 或 `demo-b`。

**密碼不是寫死的**：每次執行 `npm run seed` 都會隨機產生一組密碼，只印在當次的 console 輸出裡
(格式類似「所有示範帳號…這次的密碼都是：xxxxxxxxxxxx」)，複製那組值來登入即可。這是刻意設計成這樣——
這份 repo 是公開的，不應該有任何寫死、大家都知道的密碼可以登入示範帳號。

---

## 部署(Ubuntu 24.04)

以下假設全新主機，部署到 `/srv/apps/expense-platform/`，用非 root 使用者執行服務。

### 1. 安裝系統套件

```bash
# Node.js（用 nvm 管理版本）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install --lts

# PostgreSQL
sudo apt update
sudo apt install -y postgresql postgresql-contrib nginx

# 建立資料庫與專用帳號（不要用預設的 trust 認證，要設密碼）
sudo -u postgres psql -c "CREATE USER expense_app WITH PASSWORD '<請自行產生高強度密碼>';"
sudo -u postgres psql -c "CREATE DATABASE expense_platform_prod OWNER expense_app;"
```

### 2. 取得程式碼並安裝依賴

```bash
sudo mkdir -p /srv/apps/expense-platform
sudo chown $USER:$USER /srv/apps/expense-platform
git clone <這個 repo 的網址> /srv/apps/expense-platform
cd /srv/apps/expense-platform

npm ci --ignore-scripts
npm --prefix server ci --ignore-scripts
```

### 3. 設定環境變數

```bash
cp server/.env.example server/.env
```

編輯 `server/.env`：

```bash
DATABASE_URL="postgresql://expense_app:<剛剛設的密碼>@localhost:5432/expense_platform_prod?schema=public"
PORT=4000
JWT_SECRET="$(openssl rand -hex 32)"
```

### 4. 建表 + 建置

```bash
# 正式環境用 migrate deploy（非互動、只套用既有 migration 檔，不會嘗試產生新的）
npm --prefix server run prisma:generate
cd server && npx prisma migrate deploy && cd ..

# 第一次上線可選擇要不要灌示範資料，正式客戶通常不需要
# npm --prefix server run seed

# 編譯後端（TypeScript -> dist/）
npm --prefix server run build

# 編譯前端（輸出到 dist/）
npm run build
```

### 5. 設定 systemd service(只跑後端 API，前端交給 nginx serve 靜態檔)

`/etc/systemd/system/expense-platform-api.service`：

```ini
[Unit]
Description=Expense Platform API
After=network.target postgresql.service

[Service]
Type=simple
User=<你的非 root 使用者>
WorkingDirectory=/srv/apps/expense-platform/server
ExecStart=/home/<user>/.nvm/versions/node/<版本>/bin/node --env-file=.env dist/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo cp expense-platform-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable expense-platform-api
sudo systemctl start expense-platform-api
sudo systemctl status expense-platform-api
```

### 6. 設定 nginx(serve 前端靜態檔 + 反向代理 `/api`)

`/etc/nginx/sites-available/expense-platform`：

```nginx
server {
    listen 80;
    server_name <你的網域>;

    root /srv/apps/expense-platform/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # nginx 預設單一請求本文只有 1MB，手機拍照上傳憑證常常好幾 MB，
        # 沒調大的話上傳會在 nginx 這層被擋掉(甚至看起來像卡住，前端收不到明確的錯誤)。
        # 後端 multer 限制單檔 10MB、一次最多 5 個檔案，這裡抓寬一點含 multipart 額外開銷。
        client_max_body_size 60M;
    }

    location / {
        try_files $uri /index.html;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/expense-platform /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

正式上線建議加 HTTPS(例如 `certbot --nginx`)，這裡先略過。

### 7. 防火牆

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

`4000` port 不對外開放，只讓 nginx 在同一台機器上反向代理，資料庫的 `5432` 也不對外開。

---

## 更新(部署新版本)

```bash
cd /srv/apps/expense-platform
git pull

# 依賴有變動才需要重跑
npm ci --ignore-scripts
npm --prefix server ci --ignore-scripts

# 套用新的 migration(沒有新 migration 也可以安全重跑，不會有動作)
npm --prefix server run prisma:generate
cd server && npx prisma migrate deploy && cd ..

# 重新建置
npm --prefix server run build
npm run build

# 重啟後端；前端是靜態檔，nginx 會直接吃新的 dist/，不用重啟 nginx
sudo systemctl restart expense-platform-api
sudo systemctl status expense-platform-api
```

**注意**：`prisma migrate deploy` 只會套用 repo 裡 `server/prisma/migrations/` 已經存在的 migration 檔。
如果你在本機用 `prisma migrate dev` 產生了新的 migration，記得連同 `migrations/` 目錄一起 commit 進 git，
更新時才會被套用到正式環境。

---

## 備份

需要備份的東西有三樣：**資料庫**、**`server/.env`**(裡面的 `JWT_SECRET` 遺失的話，所有人的登入
token 都會失效，需要重新登入；`.env` 本身不在 git 裡，只存在主機上)、**`server/uploads/`**(使用者上傳的
費用憑證附件檔案，只存在磁碟上，不在資料庫也不在 git 裡——只備份資料庫的話這些附件檔案會遺失)。

三樣東西用同一支腳本 [`server/scripts/backup.sh`](server/scripts/backup.sh) 一次備份，
連線資訊直接從 `server/.env` 的 `DATABASE_URL` 解析，不用在別的地方再存一份密碼。

先手動跑一次確認沒問題：

```bash
cd /srv/apps/expense-platform
bash server/scripts/backup.sh
ls /srv/backups/expense-platform/
```

確認沒問題後加進 crontab(`crontab -e`)，每天凌晨 3 點自動備份、保留最近 14 天：

```
0 3 * * * APP_DIR=/srv/apps/expense-platform BACKUP_DIR=/srv/backups/expense-platform KEEP_DAYS=14 bash /srv/apps/expense-platform/server/scripts/backup.sh >> /var/log/expense-platform-backup.log 2>&1
```

三個環境變數都有預設值(跟上面範例一樣)，不帶也能跑；log 導到 `/var/log/expense-platform-backup.log`
是為了 cron 執行失敗時有地方可以查，不然 cron 的輸出預設只會寄 email(如果主機根本沒設定寄信，
失敗了也不會有任何提示)。之後可以定期(例如每週)瞄一下這個 log 檔確認備份持續正常執行。

**手動排 cron 是最基本的做法。** 如果你是平台管理者，登入 `/platform` 後台的「備份」分頁可以：
- 用時間選擇器視覺化設定「每天幾點自動備份」(不用自己寫 cron 表達式，想寫也可以切到進階模式)、保留天數
- 開啟「同步備份到遠端 NAS」，用 SSH/rsync 把備份鏡像一份到你自己的 NAS(私鑰加密後存在資料庫裡，
  API 絕對不會把私鑰內容回傳到瀏覽器)——設定完可以按「測試連線」馬上確認 host/路徑/金鑰有沒有填錯
- 「立即備份一次」不用等排程時間到就能馬上跑一次、確認整個流程真的沒問題
- 「備份清單」可以直接在網頁上看有哪些備份、下載下來

這個 UI 背後就是同一支 `backup.sh`，由 API server 內建的排程器(`node-cron`)在時間到的時候呼叫，
設定改了立刻生效、不用重啟服務。

---

## 還原

**還原是刻意設計成需要人在鍵盤前手動執行的操作，平台後台沒有「一鍵還原」的按鈕。**
原因是還原會直接覆蓋掉整個資料庫、影響全部租戶的資料，一旦選錯備份或誤觸就無法復原；
真的要做的話理論上也該先停掉 API 服務，那代表網頁要有能力控制 systemd，等於要給這個
應用程式 `sudo` 等級的權限，這個風險不划算。

先到 `/platform` 後台的「備份」分頁看你要還原到哪個時間點(或直接 `ls /srv/backups/expense-platform/`)，
記下檔名裡的 timestamp(例如 `db-20260101-030000.sql.gz` 的 timestamp 是 `20260101-030000`)，
然後用 [`server/scripts/restore.sh`](server/scripts/restore.sh)：

```bash
cd /srv/apps/expense-platform
bash server/scripts/restore.sh 20260101-030000
```

腳本會先印出警告、要求你**手動輸入資料庫名稱**確認才會繼續執行，接著自動停止 API 服務、
還原資料庫、詢問要不要一併還原 `.env` 跟憑證附件、還原完再重新啟動服務。

還原 `.env` 的話，如果裡面的 `JWT_SECRET` 跟還原前不一樣，所有使用者現有的登入 token 會失效
(需要重新登入)，但不影響資料本身。

### 完整重建(新主機 disaster recovery)

1. 依「部署」章節的步驟 1–3 重新裝好系統套件、clone 程式碼、建立資料庫帳號(`CREATE USER` / `CREATE DATABASE`，
   帳密要跟備份的 `.env` 對應，或還原 `.env` 後改回一致)
2. 把備份檔案(`db-*.sql.gz`、`env-backup-*`、`uploads-*.tar.gz`)複製到新主機的 `/srv/backups/expense-platform/`
   (例如從 NAS 上拉回來，或從舊主機複製)
3. 跑 `bash server/scripts/restore.sh <timestamp>`，三樣都選擇還原
4. 執行「部署」步驟 4(建置)、5(systemd)、6(nginx)、7(防火牆)
5. 確認 `systemctl status expense-platform-api` 正常、瀏覽器打開網域能看到登入畫面

---

## 疑難排解

- **`systemctl status` 顯示 API 一直重啟**：`journalctl -u expense-platform-api -n 50` 看錯誤訊息，
  最常見是 `.env` 沒設定或 `DATABASE_URL` 連不上資料庫。
- **前端打 `/api` 出現 404 或連不上**：檢查 nginx 設定的 `proxy_pass` 位址跟 API 實際監聽的 `PORT` 是否一致。
- **登入後馬上被登出 / token 失效**：通常是 `JWT_SECRET` 在某次部署被改掉了(例如不小心用 `.env.example`
  覆蓋了 `.env`)，讓所有既有 token 簽章對不上。
- **`prisma migrate deploy` 失敗**：先看錯誤訊息是不是 migration 檔跟資料庫現況不一致(例如有人手動改過
  資料庫結構)，必要時要用 `npx prisma migrate resolve` 手動標記，不要在正式環境用 `migrate reset`(會清空
  資料庫)。

---

## 授權(License)

本專案採用 [GNU Affero General Public License v3.0](LICENSE)(AGPL-3.0)授權。

簡單來說：可以自由使用、修改、部署本專案，但如果修改後的版本透過網路提供服務給他人使用，
必須依 AGPL-3.0 的條款公開該版本的原始碼(包含僅透過網路存取、未實際散布程式的情況)。
完整條款請見 [LICENSE](LICENSE)。
