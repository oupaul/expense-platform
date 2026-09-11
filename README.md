# Expense Platform — 多租戶費用申請系統

比對兩個既有客戶版型後，把「會因公司而異」的部分抽成資料庫設定，同一套前端／後端可以長出不同
公司的表單、選項清單、簽核關卡、匯率、帳號。

## 功能總覽

- 依公司設定動態渲染的費用申請表單(品牌配色、選配欄位、多幣別)
- 填寫中自動存成草稿(伺服器端，非瀏覽器本機)，可在「我的申請」列表繼續編輯或刪除
- Email + 密碼登入(JWT)，角色權限：`admin` / `applicant` / 簽核角色(如 `dept_manager`、`finance`、`ceo`)
- 依 `ApprovalStage` 陣列的循序簽核流程(核准/駁回、跳關會被擋)
- 多幣別換算(後台維護匯率，送出申請單時後端即時換算成 TWD)
- 報表：部門/類別支出、簽核狀態分佈、月度趨勢(管理員，或被指定「查閱全公司報表」的人)
- 後台管理：部門／費用項目／費用性質／簽核關卡／匯率／使用者帳號
- 修改密碼(自助)、後台重設密碼(管理員)
- 通知：申請單送出/簽核/核准/駁回/退回時，站內鈴鐺清單 + email 提醒相關人員(見下方「通知」章節)
- Microsoft 365 單一登入(選填，每家租戶各自設定，見下方「Microsoft 365 單一登入」章節)

### 「查閱全公司報表」權限

除了 `role` 之外，`User` 另外有一個獨立的 `canViewAllReports` 布林旗標，管理員可以在「後台管理 →
使用者帳號」畫面針對任何一個人單獨開關。開了之後這個人可以看「報表」分頁、以及「我的申請」的
「全部申請」(不限自己送出的)，但不會因此拿到簽核或後台管理的權限——這個旗標跟 `role` 刻意分開，
因為 `role` 同時也是簽核關卡比對用的 `roleKey`，混在一起做容易不小心讓某人多出簽核權限。
跟租戶停用旗標一樣，這個權限只在登入時寫進 JWT，撤銷後要等對方的 token 自然過期(最長 8 小時)
或重新登入才會生效。

### 申請單草稿

`ExpenseApplication.status` 多一個 `draft` 值，`departmentId`/`expenseNatureId`/`applicationDate`
在草稿狀態下可以是 `null`(表單還沒填完)，正式送出時才會強制檢查這幾個欄位。填寫中的表單打字
會 debounce 後自動打 `POST/PUT .../applications/draft` 存檔，草稿建立後會拿到一個真正的申請單
id，之後憑證附件就能直接上傳(不用再等「送出」才補傳)。「送出申請」對草稿呼叫的是
`.../submit-draft`，套用跟直接建立申請單一樣嚴格的驗證(部門/費用性質/簽名都變成必填)、
也才會真的建立簽核關卡紀錄。

草稿是使用者自己還沒寫完的內容，`scope=all`(全部申請)、報表的「簽核狀態分佈」都刻意排除掉，
查看單筆草稿明細也只有申請人本人或 admin 能看，不套用「同公司都能看」這個既有的寬鬆權限。

### Microsoft 365 單一登入

每家租戶各自在自己的 Azure AD 建立一個 App 註冊、各自的 Tenant ID/Client ID，在「後台管理 →
公司設定」裡開啟並填入即可，不是平台層級的全域設定。

- **App 註冊類型一定要選「單頁應用程式(SPA)」**，Redirect URI 填後台設定頁上顯示的那個網址
  (就是這個系統本身的網址)。SPA 型態的 App 註冊搭配 Authorization Code + PKCE 不需要、也不會
  產生 Client Secret——這個系統完全沒有存放、加密任何 M365 相關的密鑰，Tenant ID/Client ID
  也不是密鑰，前端登入頁本來就要用它們組 Microsoft 登入網址，`GET /:slug/config` 這個公開端點
  會直接回傳。
- 前端用 `@azure/msal-browser` 的 `loginRedirect`(不是 `loginPopup`)——原本用彈跳視窗
  (`loginPopup`)實測在某些透過 Cloudflare Tunnel 之類代理對外的部署環境下，主視窗會偵測不到
  彈跳視窗登入完成，卡在「登入中」動不了(Microsoft 那邊登入其實成功，只是主視窗收不到結果)，
  換成 `loginRedirect` 直接整頁導去 Microsoft、登入完再導回同一個分頁，完全不需要任何跨視窗
  溝通，從根本上避開這類環境相依的問題。代價是要自己處理「回來之後怎麼知道剛才是哪家公司在
  登入」——登入前先把 companySlug/tenantId/clientId 存進 `sessionStorage`，應用程式重新啟動時
  檢查這把旗標、呼叫 `handleRedirectPromise()` 接手完成登入(見 `useAuth.ts`)。
- 後端收到前端拿到的 ID token 後，用 `jwks-rsa` 抓 Microsoft 的公開金鑰驗證簽章，並嚴格檢查
  `issuer`(必須是這家公司設定的 tenantId)、`audience`(必須是這家公司設定的 clientId)——
  Microsoft 的簽章金鑰是全域共用、不分租戶的，這兩個檢查才是真正擋住「A 公司的人拿自己 Azure
  租戶核發的合法 token 冒充成 B 公司使用者」的安全邊界，不能只驗證「這是不是一個合法的
  Microsoft token」就放行。
- **不會自動建立新帳號**：SSO 登入時如果 email 在這家公司底下找不到對應的 `User`，會直接被拒絕
  (`此 Microsoft 帳號尚未對應到系統帳號，請聯繫貴公司管理員建立帳號`)，管理員要先在「使用者
  帳號」用同一個 email 手動建好帳號，才能用 Microsoft 帳號登入——避免任何在客戶 Azure AD 裡
  有帳號的人都能自動拿到這個系統的存取權限。
- 啟用 SSO 不會關閉原本的密碼登入，兩種方式並存；某個使用者的 Microsoft 帳號如果暫時無法使用，
  一樣可以用密碼登入。

### 通知

申請單生命週期(送出/每一關核准/駁回/退回)會同時觸發兩種通知，各自獨立、其中一個失敗不影響
另一個：

- **站內通知**：畫面右上角的鈴鐺圖示，未讀數字紅點、點開是最近 30 筆清單，點一筆會標記已讀
  並自動跳到相關分頁(待簽核通知跳「待簽核」，核准/駁回/退回通知跳「我的申請」)。
- **Email**：寄給同一批收件人，純文字信件。SMTP 帳號**全平台共用一組**(不是每個租戶各自
  設定)，在平台管理頁面(`/platform` → 「通知」分頁)設定，密碼用跟 `JWT_SECRET` 同源衍生的
  金鑰加密存進資料庫，API 不會把明碼密碼回傳給前端；設定完可以直接在畫面上「測試連線」，
  選填收件信箱的話還會真的寄一封測試信。**沒有啟用/沒有設定完整的話 email 會靜默略過**
  (只在伺服器 log 印一次警告)，站內通知照常運作，不會因為公司還沒準備好郵件伺服器就整個
  功能掛掉。如果用的是公司自己架設的內部郵件伺服器，測試連線出現
  `unable to get local issuer certificate` / `self-signed certificate` 之類的錯誤，
  是因為那台伺服器的憑證是自我簽署或內部 CA 簽發的，不在 Node.js 內建的信任清單裡——
  勾選「信任自我簽署/內部憑證」即可(**只建議用在公司內部、可信任的郵件主機**，Gmail/
  Outlook 等公開服務不需要也不應該勾選)。

會收到通知的對象：

| 事件 | 收件人 |
|------|--------|
| 申請單送出(直接建立/草稿送出/退回後重新送出) | 第一關簽核者(依 `roleKey` 找同公司、啟用中的使用者) |
| 某一關核准，且還不是最後一關 | 下一關的簽核者 |
| 最後一關核准 | 申請人本人 |
| 任一關駁回 | 申請人本人 |
| 任一關退回 | 申請人本人 |

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

# 選填：限制 CORS 只接受這些來源(逗號分隔多個網域)。不設定就維持全部來源都放行——
# 正式環境前後端透過 nginx 同源，通常不需要特別設定這個。
# CORS_ORIGIN="https://your-domain.com"
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

全新主機建議直接用 [`server/scripts/install.sh`](server/scripts/install.sh)，兩行指令 + 互動問答
就能把下面「手動安裝步驟」整段做完(系統套件、Node、PostgreSQL、`.env`、建表、編譯、systemd、
nginx，選配 HTTPS/防火牆/示範資料/平台管理者帳號)：

```bash
git clone <這個 repo 的網址> /srv/apps/expense-platform
cd /srv/apps/expense-platform && sudo bash server/scripts/install.sh
```

腳本會先列出一份設定摘要（安裝目錄、服務執行帳號、網域、資料庫、要不要灌示範資料/建立平台
管理者/設定 HTTPS/防火牆）讓你確認過一次才會真的開始動作，不會什麼都沒問就先動手。密碼類的
輸出(資料庫密碼、平台管理者初始密碼)只會印在當次的終端機畫面上，不會存進任何檔案，請自行
記下來。

幾點限制，遇到就用下面的「手動安裝步驟」自己處理對應那幾步：
- 假設是全新主機(沒有跑過的 `expense-platform-api` service、沒有衝突的 nginx site)，不是用
  來對「已經在跑」的環境做增量升級——那是 [`update.sh`](#更新部署新版本) 的工作。
- 服務執行帳號必須是「已經存在」的一般使用者(自己先用 `adduser` 建過)，腳本不會自動建帳號。
- HTTPS 用 `certbot --nginx`，網域要先把 DNS 指到這台主機才會成功；DNS 還沒生效的話這步
  失敗不會中止其他步驟，之後 DNS 生效了可以自己補跑 `sudo certbot --nginx -d <網域>`。

### 手動安裝步驟(進階/除錯用；`install.sh` 內部做的就是把下面這幾步接起來)

以下假設全新主機，部署到 `/srv/apps/expense-platform/`，用非 root 使用者執行服務。

#### 1. 安裝系統套件

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

#### 2. 取得程式碼並安裝依賴

```bash
sudo mkdir -p /srv/apps/expense-platform
sudo chown $USER:$USER /srv/apps/expense-platform
git clone <這個 repo 的網址> /srv/apps/expense-platform
cd /srv/apps/expense-platform

npm ci --ignore-scripts
npm --prefix server ci --ignore-scripts
```

#### 3. 設定環境變數

```bash
cp server/.env.example server/.env
```

編輯 `server/.env`：

```bash
DATABASE_URL="postgresql://expense_app:<剛剛設的密碼>@localhost:5432/expense_platform_prod?schema=public"
PORT=4000
JWT_SECRET="$(openssl rand -hex 32)"
```

#### 4. 建表 + 建置

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

#### 5. 設定 systemd service(只跑後端 API，前端交給 nginx serve 靜態檔)

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

#### 6. 設定 nginx(serve 前端靜態檔 + 反向代理 `/api`)

`/etc/nginx/sites-available/expense-platform`：

```nginx
server {
    listen 80 default_server;
    server_name <你的網域>;

    root /srv/apps/expense-platform/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # 後端(index.ts 有設 app.set("trust proxy", "loopback"))靠這個標頭才能拿到
        # 使用者的真實 IP，登入 API 的 rate limit 是照 IP 分開計算的——沒有這個標頭，
        # Express 看到的來源永遠是 127.0.0.1(nginx 自己)，會變成全公司共用同一個
        # 額度，任何人多打幾次登入就會連累其他人一起被鎖。
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        # nginx 預設單一請求本文只有 1MB，手機拍照上傳憑證常常好幾 MB，
        # 沒調大的話上傳會在 nginx 這層被擋掉(甚至看起來像卡住，前端收不到明確的錯誤)。
        # 後端 multer 限制單檔 10MB、一次最多 5 個檔案，這裡抓寬一點含 multipart 額外開銷。
        client_max_body_size 60M;
    }

    # 公司 Logo/瀏覽器分頁圖示的公開靜態路徑(見 server/src/index.ts)，一樣要轉給後端，
    # 不需要登入就能存取——瀏覽器原生載入 <link rel="icon"> 不會帶 Authorization header。
    location /public/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri /index.html;
    }

    # index.html 檔名不會變，每次部署完內容卻會變(裡面引用的 JS/CSS 檔名帶內容雜湊，
    # 每次 build 都不一樣)。沒有明確設定的話，瀏覽器或前面的 CDN(例如 Cloudflare)可能會
    # 用預設的啟發式規則快取 index.html，之後部署新版本，使用者拿到的還是快取住的舊
    # index.html，裡面指到的 JS 檔案在新的 dist/ 裡早就不存在了——看起來就像「更新了
    # 但功能沒出現」。強制每次都跟伺服器確認新鮮度，檔案本身很小，這樣做幾乎沒有成本。
    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    # assets/ 底下的檔名帶內容雜湊(例如 index-Df6863Lu.js)，內容一變檔名就會跟著變，
    # URL 不變就代表內容沒變過，這種檔案快取多久都安全，讓重複造訪的使用者不用每次
    # 都重新下載整包前端。
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

```bash
# nginx 裝好預設會啟用 sites-enabled/default，裡面是 listen 80 default_server;——
# 不移除的話它的優先權比我們自己的設定高，瀏覽器打開會看到 nginx 內建的
# 「Welcome to nginx!」，不是我們的前端(這是實際踩過的坑，不是理論上的可能性)。
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -s /etc/nginx/sites-available/expense-platform /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**如果網域前面還有 Cloudflare 之類的 CDN**：CDN 自己也可能有一套獨立於上面 nginx 設定的
快取規則，尤其如果曾經手動開過「Cache Everything」之類的規則，會直接忽略 origin 送出的
`Cache-Control`。設定完上面的 nginx 規則後，建議到 Cloudflare 後台把 `index.html` 這個
網址(或乾脆整個網域)的快取清一次，之後有這組 nginx 規則兜底，之後部署新版本才不會再卡在
CDN 快取住的舊版本上。

正式上線建議加 HTTPS(例如 `certbot --nginx`)，這裡先略過。

#### 7. 防火牆

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
bash server/scripts/update.sh
```

[`server/scripts/update.sh`](server/scripts/update.sh) 會依序做完：更新前備份一次、
`git pull`、前後端 `npm ci`、`prisma generate` + `migrate deploy`、前後端 `build`、
重啟 `expense-platform-api`，最後確認服務真的正常啟動。這支腳本是把過去部署時
反覆手貼、也反覆漏步驟(尤其是漏掉 `prisma:generate`)的那串指令收斂成一個檔案，
每次更新只要跑這一行。

幾個行為說明：
- 如果偵測到主機上有還沒 commit 的本機修改(常見情況是 `package.json` 之類的檔案不知道
  被什麼動過)，腳本會直接中止、印出 `git status` 給你看，**不會**自動幫你捨棄或 stash——
  那可能是有意義的修改，要不要丟由你自己確認後手動處理(`git restore` 或 `git stash`)，
  確認乾淨後再重跑一次。
- 如果 `git pull` 下來發現已經是最新版本，會直接結束，不會做多餘的 build/restart。
- 更新前預設會先跑一次 [`backup.sh`](server/scripts/backup.sh)，這樣萬一新版本的
  migration 有問題，手邊隨時有一份「更新前」的還原點；不想每次更新都多等這幾秒，
  可以用 `SKIP_PRE_UPDATE_BACKUP=1 bash server/scripts/update.sh` 跳過。
- 最後會確認 `expense-platform-api` 真的是 `active (running)`，不是只看指令有沒有噴錯——
  如果服務沒有正常啟動，腳本會用非 0 狀態碼結束，並提示去看 `journalctl` 的錯誤訊息。

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
- **部署完打開網址只看到 nginx 內建的「Welcome to nginx!」**：`sites-enabled/default` 沒有被移除——
  它裡面是 `listen 80 default_server;`，優先權比我們自己的 site 設定高。`sudo rm -f
  /etc/nginx/sites-enabled/default && sudo nginx -t && sudo systemctl reload nginx` 就會改回正常。
- **上傳憑證附件一律失敗、`journalctl` 看到 `EACCES: permission denied, mkdir '.../uploads/...'`**：
  `server/uploads/` 目錄的擁有者不是實際跑 API 服務的帳號(常見情境是 `backup.sh`/`restore.sh`
  用 root 執行、在真的有人上傳過附件之前就先把這個目錄以 root 身分建立/還原出來了)。用
  `sudo chown -R <服務帳號>:<服務帳號> /srv/apps/expense-platform/server/uploads` 校正回來即可，
  不用重啟服務。`backup.sh`/`restore.sh` 已經修正成每次都會自動校正這個目錄的擁有者，正常
  不會再發生，除非有人手動用 root 在 `server/uploads/` 底下操作過。
- **明明沒打幾次密碼，登入卻顯示「登入嘗試次數過多」**：登入 API 有加 rate limit(15 分鐘
  內同一個來源最多 20 次失敗嘗試)，是照「使用者的真實 IP」分開計算的——這需要 nginx 設定
  `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`(新安裝的話 `install.sh`
  已經會加上；**在這個功能上線前就裝好的主機要自己手動補上這行、`sudo nginx -t &&
  sudo systemctl reload nginx`**)。沒有這個設定的話，後端看到的來源永遠是 nginx 自己
  (127.0.0.1)，會變成全公司共用同一個額度，隨便幾個人手滑多打幾次密碼，其他人也會一起
  被鎖住、看起來像整個登入功能忽然壞掉。
- **平台管理者後台顯示「上次備份：失敗」，訊息是 `Permission denied` 寫入
  `/srv/backups/expense-platform/db-....sql.gz`**：自動備份是應用程式自己內建的排程
  (以 API 服務帳號執行)，但 `/srv/backups/expense-platform` 這個目錄如果曾經被人用
  `sudo`/root 手動執行 `backup.sh` 建立過(常見於手動測試備份)，擁有者會變成 root，
  服務帳號自己排程時就無法寫入。用 `sudo chown -R <服務帳號>:<服務帳號>
  /srv/backups/expense-platform` 校正一次即可；`backup.sh` 已經修正成之後只要偵測到
  自己是用 root 執行，就會自動把這個目錄的擁有者校正回服務帳號，正常不會再發生。

---

## 授權(License)

本專案採用 [GNU Affero General Public License v3.0](LICENSE)(AGPL-3.0)授權。

簡單來說：可以自由使用、修改、部署本專案，但如果修改後的版本透過網路提供服務給他人使用，
必須依 AGPL-3.0 的條款公開該版本的原始碼(包含僅透過網路存取、未實際散布程式的情況)。
完整條款請見 [LICENSE](LICENSE)。
