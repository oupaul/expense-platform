import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole, requireSameCompany } from "../middleware/auth.js";

export const companiesRouter = Router();

// GET /api/companies/:slug/config
// 前端 useCompanyConfig 打的就是這支，取代掉原本 vite.config.ts 裡的假 API。
companiesRouter.get("/:slug/config", async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { slug: req.params.slug },
    include: {
      departments: { where: { active: true }, orderBy: { sortOrder: "asc" } },
      expenseCategories: { where: { active: true }, orderBy: { sortOrder: "asc" } },
      expenseNatures: { where: { active: true }, orderBy: { sortOrder: "asc" } },
      approvalStages: { orderBy: { stageOrder: "asc" } },
      exchangeRates: true,
    },
  });

  if (!company) {
    return res.status(404).json({ error: `找不到公司：${req.params.slug}` });
  }

  res.json({
    companyId: company.id,
    branding: {
      name: company.name,
      nameEn: company.nameEn ?? undefined,
      logoUrl: company.logoUrl ?? undefined,
      primaryColor: company.primaryColor,
      headerBgColor: company.headerBgColor,
      gradientFrom: company.gradientFrom,
      gradientTo: company.gradientTo,
    },
    multiCurrencyEnabled: company.multiCurrencyEnabled,
    optionalFields: company.optionalFields,
    departments: company.departments.map((d) => ({ id: d.id, name: d.name })),
    expenseNatures: company.expenseNatures.map((n) => ({ id: n.id, name: n.name })),
    expenseCategories: company.expenseCategories.map((c) => ({ id: c.id, name: c.name })),
    approvalStages: company.approvalStages.map((s) => ({
      id: s.id,
      stageOrder: s.stageOrder,
      roleKey: s.roleKey,
      label: s.label,
    })),
    exchangeRates: company.exchangeRates.map((r) => ({ currency: r.currency, rateToTWD: r.rateToTWD })),
  });
});

const optionalFieldsSchema = z.object({
  projectCode: z.boolean().optional(),
  invoiceDate: z.boolean().optional(),
  payeeInfo: z.boolean().optional(),
  requestedPaymentDate: z.boolean().optional(),
});

const settingsSchema = z.object({
  multiCurrencyEnabled: z.boolean().optional(),
  optionalFields: optionalFieldsSchema.optional(),
});

// PUT /api/companies/:companyId/settings  （用 companyId 而非 slug，跟其他後台管理路由一致）
companiesRouter.put(
  "/:companyId/settings",
  requireAuth,
  requireSameCompany,
  requireRole("admin"),
  async (req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const existing = await prisma.company.findUnique({ where: { id: req.params.companyId } });
    if (!existing) return res.status(404).json({ error: "找不到公司" });

    // optionalFields 存在 Company 上的單一 JSON 欄位裡，這裡只更新有帶到的欄位，
    // 沒帶到的維持原樣，不能直接整包覆蓋掉沒動到的開關。
    const { optionalFields, ...rest } = parsed.data;
    const mergedOptionalFields = optionalFields
      ? { ...(existing.optionalFields as Record<string, boolean>), ...optionalFields }
      : undefined;

    const company = await prisma.company.update({
      where: { id: req.params.companyId },
      data: {
        ...rest,
        ...(mergedOptionalFields ? { optionalFields: mergedOptionalFields } : {}),
      },
    });
    res.json({ multiCurrencyEnabled: company.multiCurrencyEnabled, optionalFields: company.optionalFields });
  }
);
