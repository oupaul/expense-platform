import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole, requireSameCompany } from "../middleware/auth.js";
import { FOREIGN_CURRENCIES } from "../constants.js";

// mergeParams 讓 :companyId 在執行期確實會被合併進 req.params，但 TypeScript 只會依路由
// 自己的路徑字面量推斷型別，推不出來自父層掛載路徑的參數，所以要手動標型別。
type CompanyScoped = Request<{ companyId: string }>;
type CompanyScopedWithCurrency = Request<{ companyId: string; currency: string }>;

export const exchangeRatesRouter = Router({ mergeParams: true });
exchangeRatesRouter.use(requireAuth, requireSameCompany, requireRole("admin"));

const upsertSchema = z.object({
  currency: z.enum(FOREIGN_CURRENCIES),
  rateToTWD: z.number().positive(),
});

// GET /api/companies/:companyId/exchange-rates
exchangeRatesRouter.get("/", async (req: CompanyScoped, res) => {
  const rates = await prisma.exchangeRate.findMany({ where: { companyId: req.params.companyId } });
  res.json(rates);
});

// PUT /api/companies/:companyId/exchange-rates/:currency  （用幣別當 key，沒有就新建、有就更新）
exchangeRatesRouter.put("/:currency", async (req: CompanyScopedWithCurrency, res) => {
  const parsed = upsertSchema.safeParse({ currency: req.params.currency, rateToTWD: req.body.rateToTWD });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const rate = await prisma.exchangeRate.upsert({
    where: { companyId_currency: { companyId: req.params.companyId, currency: parsed.data.currency } },
    update: { rateToTWD: parsed.data.rateToTWD },
    create: { companyId: req.params.companyId, currency: parsed.data.currency, rateToTWD: parsed.data.rateToTWD },
  });
  res.json(rate);
});

// DELETE /api/companies/:companyId/exchange-rates/:currency
exchangeRatesRouter.delete("/:currency", async (req: CompanyScopedWithCurrency, res) => {
  await prisma.exchangeRate.deleteMany({
    where: { companyId: req.params.companyId, currency: req.params.currency },
  });
  res.status(204).end();
});
