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

const app = express();

app.use(cors());
// 預設 100kb 對簽名圖檔(base64)太小，手寫簽名/上傳的簽名檔都要能塞得下。
app.use(express.json({ limit: "5mb" }));
app.use(pinoHttp());

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

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  req.log.error(err);
  res.status(500).json({ error: "伺服器發生錯誤" });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
