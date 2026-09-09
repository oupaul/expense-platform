import "express-async-errors";
import path from "node:path";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { pinoHttp } from "pino-http";
import { prisma } from "./db.js";
import { companiesRouter } from "./routes/companies.js";
import { createOptionRouter } from "./routes/optionResource.js";
import { approvalStagesRouter } from "./routes/approvalStages.js";
import { authRouter } from "./routes/auth.js";
import { applicationsRouter } from "./routes/applications.js";
import { exchangeRatesRouter } from "./routes/exchangeRates.js";
import { usersRouter } from "./routes/users.js";
import { reportsRouter } from "./routes/reports.js";
import { notificationsRouter } from "./routes/notifications.js";
import { platformAuthRouter } from "./routes/platformAuth.js";
import { platformRouter } from "./routes/platform.js";
import { customFieldsRouter, expenseCategoryCustomFieldsRouter } from "./routes/customFields.js";
import { rescheduleBackupJob } from "./services/backupScheduler.js";

const app = express();

// 只信任「直接從本機(nginx)連進來」的請求所帶的 X-Forwarded-For——這台主機的
// 拓樸固定是「nginx(監聽 80/443)反向代理到本機的 4000」，nginx 本身也要記得加上
// proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for(見 README/install.sh)。
// 沒有這個設定，req.ip 永遠是 127.0.0.1(nginx 自己)，下面登入 API 的 rate limit
// 會變成全公司共用同一個額度；如果真的有人繞過 nginx 直接打 4000 port，Express
// 只有在直接連線來源是 loopback 時才會採信 header，不會被隨便塞一個假的
// X-Forwarded-For 唬過去。
app.set("trust proxy", "loopback");

// 沒設定 CORS_ORIGIN 就維持原本「全部來源都放行」——前後端在正式環境是透過 nginx
// 用同一個網域(同源)在跑，CORS 實務上不太會被真的用上，這裡放寬預設值是為了不讓
// 既有部署在沒調整任何設定的情況下忽然打不通。想收斂的話設 CORS_ORIGIN(逗號分隔
// 多個網域)，例如 CORS_ORIGIN="https://hzt-expenses.ai4ou.com"。
const corsOrigins = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors(corsOrigins && corsOrigins.length > 0 ? { origin: corsOrigins } : undefined));
// pinoHttp 一定要在 express.json() 之前掛，不然遇到格式錯誤的 JSON body 時，
// express.json() 會直接 next(err) 跳過後面所有一般 middleware(包含 pinoHttp)，
// 導致 req.log 沒被設定，下面錯誤處理 middleware 呼叫 req.log.error() 反而自己噴錯，
// 讓使用者看到 Express 預設、會洩漏 stack trace 的 HTML 錯誤頁，而不是乾淨的 JSON 錯誤。
app.use(pinoHttp());
// 預設 100kb 對簽名圖檔(base64)太小，手寫簽名/上傳的簽名檔都要能塞得下。
app.use(express.json({ limit: "5mb" }));

// 公司 Logo/瀏覽器分頁圖示——唯一不需要登入就能存取的上傳檔案目錄，因為瀏覽器原生載入
// <link rel="icon"> 不會帶我們自訂的 Authorization header。刻意只掛這一個子目錄，
// 不是整個 uploads/(憑證附件必須維持要登入才看得到)。
app.use(
  "/public/company-logos",
  express.static(path.join(process.cwd(), "uploads", "company-logos"))
);

app.use("/api/auth", authRouter);
app.use("/api/platform-auth", platformAuthRouter);
app.use("/api/platform", platformRouter);
app.use("/api/companies", companiesRouter);
app.use("/api/companies/:companyId/departments", createOptionRouter(() => prisma.department));
app.use(
  "/api/companies/:companyId/expense-categories",
  createOptionRouter(() => prisma.expenseCategory, { requiresProjectCode: z.boolean().optional() })
);
app.use(
  "/api/companies/:companyId/expense-categories/:categoryId/custom-fields",
  expenseCategoryCustomFieldsRouter
);
app.use("/api/companies/:companyId/expense-natures", createOptionRouter(() => prisma.expenseNature));
app.use("/api/companies/:companyId/custom-fields", customFieldsRouter);
app.use("/api/companies/:companyId/approval-stages", approvalStagesRouter);
app.use("/api/companies/:companyId/applications", applicationsRouter);
app.use("/api/companies/:companyId/exchange-rates", exchangeRatesRouter);
app.use("/api/companies/:companyId/users", usersRouter);
app.use("/api/companies/:companyId/reports", reportsRouter);
app.use("/api/companies/:companyId/notifications", notificationsRouter);

app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  req.log.error(err);
  // express.json() 對格式錯誤的 body 丟出來的是帶 status:400 的 SyntaxError，
  // 這種情況要回 400(使用者送錯格式)，不是 500(伺服器自己的錯)。
  const status = err && typeof err === "object" && "status" in err && typeof err.status === "number" ? err.status : 500;
  res.status(status).json({ error: status === 400 ? "請求格式不正確" : "伺服器發生錯誤" });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});

rescheduleBackupJob().catch((err) => console.error("套用備份排程失敗", err));
