import "express-async-errors";
import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { prisma } from "./db.js";
import { companiesRouter } from "./routes/companies.js";
import { createOptionRouter } from "./routes/optionResource.js";
import { approvalStagesRouter } from "./routes/approvalStages.js";
import { authRouter } from "./routes/auth.js";
import { applicationsRouter } from "./routes/applications.js";
import { exchangeRatesRouter } from "./routes/exchangeRates.js";
import { usersRouter } from "./routes/users.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(pinoHttp());

app.use("/api/auth", authRouter);
app.use("/api/companies", companiesRouter);
app.use("/api/companies/:companyId/departments", createOptionRouter(() => prisma.department));
app.use("/api/companies/:companyId/expense-categories", createOptionRouter(() => prisma.expenseCategory));
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
