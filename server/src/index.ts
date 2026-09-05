import "express-async-errors";
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
import { platformAuthRouter } from "./routes/platformAuth.js";
import { platformRouter } from "./routes/platform.js";
import { rescheduleBackupJob } from "./services/backupScheduler.js";

const app = express();

app.use(cors());
// pinoHttp 一定要在 express.json() 之前掛，不然遇到格式錯誤的 JSON body 時，
// express.json() 會直接 next(err) 跳過後面所有一般 middleware(包含 pinoHttp)，
// 導致 req.log 沒被設定，下面錯誤處理 middleware 呼叫 req.log.error() 反而自己噴錯，
// 讓使用者看到 Express 預設、會洩漏 stack trace 的 HTML 錯誤頁，而不是乾淨的 JSON 錯誤。
app.use(pinoHttp());
// 預設 100kb 對簽名圖檔(base64)太小，手寫簽名/上傳的簽名檔都要能塞得下。
app.use(express.json({ limit: "5mb" }));

app.use("/api/auth", authRouter);
app.use("/api/platform-auth", platformAuthRouter);
app.use("/api/platform", platformRouter);
app.use("/api/companies", companiesRouter);
app.use("/api/companies/:companyId/departments", createOptionRouter(() => prisma.department));
app.use(
  "/api/companies/:companyId/expense-categories",
  createOptionRouter(() => prisma.expenseCategory, { requiresProjectCode: z.boolean().optional() })
);
app.use("/api/companies/:companyId/expense-natures", createOptionRouter(() => prisma.expenseNature));
app.use("/api/companies/:companyId/approval-stages", approvalStagesRouter);
app.use("/api/companies/:companyId/applications", applicationsRouter);
app.use("/api/companies/:companyId/exchange-rates", exchangeRatesRouter);
app.use("/api/companies/:companyId/users", usersRouter);

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
