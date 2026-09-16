import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole, requireSameCompany } from "../middleware/auth.js";
import { createOptionRouter } from "./optionResource.js";

// mergeParams 讓父層掛載路徑的參數在執行期確實會被合併進 req.params，但 TypeScript
// 只會依路由自己的路徑字面量推斷型別，推不出來自父層掛載路徑的參數，所以要手動標型別。
type CustomFieldOptionScoped = Request<{ companyId: string; customFieldId: string }>;
type CustomFieldOptionScopedWithId = Request<{ companyId: string; customFieldId: string; optionId: string }>;
type CategoryCustomFieldScoped = Request<{ companyId: string; categoryId: string }>;

// 自訂欄位本身(名稱/型態/排序/啟用)沿用既有的 createOptionRouter 工廠——跟
// ExpenseCategory 用 extraFields 擴充 requiresProjectCode 是同一招，fieldType
// 當作額外欄位掛上去，不用整份路由重寫一次。
export const customFieldsRouter = createOptionRouter(() => prisma.customField, {
  fieldType: z.enum(["text", "date", "select"]).optional(),
});

// 自訂欄位底下的選項(只有 fieldType="select" 才會用到)，掛在
// /custom-fields/:customFieldId/options 底下——這裡是「自訂欄位的子資源」，不是
// 直接掛在 companyId 下，所以每個操作都要先確認這個 customFieldId 真的屬於這家
// 公司，不能只靠 requireSameCompany(那個 middleware 只檢查網址上的 companyId，
// 不會知道 customFieldId 是不是被其他公司的人亂猜/亂帶進來)。
export const customFieldOptionsRouter = Router({ mergeParams: true });
customFieldOptionsRouter.use(requireAuth, requireSameCompany, requireRole("admin"));

async function findOwnedCustomField(companyId: string, customFieldId: string) {
  return prisma.customField.findFirst({ where: { id: customFieldId, companyId } });
}

const optionSchema = z.object({
  label: z.string().min(1),
  active: z.boolean().optional(),
});

// GET /api/companies/:companyId/custom-fields/:customFieldId/options
customFieldOptionsRouter.get("/", async (req: CustomFieldOptionScoped, res) => {
  const field = await findOwnedCustomField(req.params.companyId, req.params.customFieldId);
  if (!field) return res.status(404).json({ error: "找不到這個自訂欄位" });
  const options = await prisma.customFieldOption.findMany({
    where: { customFieldId: field.id },
    orderBy: { sortOrder: "asc" },
  });
  res.json(options);
});

// POST /api/companies/:companyId/custom-fields/:customFieldId/options
customFieldOptionsRouter.post("/", async (req: CustomFieldOptionScoped, res) => {
  const field = await findOwnedCustomField(req.params.companyId, req.params.customFieldId);
  if (!field) return res.status(404).json({ error: "找不到這個自訂欄位" });
  const parsed = optionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const count = await prisma.customFieldOption.count({ where: { customFieldId: field.id } });
  const option = await prisma.customFieldOption.create({
    data: { customFieldId: field.id, label: parsed.data.label, sortOrder: count },
  });
  res.status(201).json(option);
});

// PUT /api/companies/:companyId/custom-fields/:customFieldId/options/:optionId
customFieldOptionsRouter.put("/:optionId", async (req: CustomFieldOptionScopedWithId, res) => {
  const field = await findOwnedCustomField(req.params.companyId, req.params.customFieldId);
  if (!field) return res.status(404).json({ error: "找不到這個自訂欄位" });
  const parsed = optionSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const existing = await prisma.customFieldOption.findFirst({
    where: { id: req.params.optionId, customFieldId: field.id },
  });
  if (!existing) return res.status(404).json({ error: "找不到這個選項" });
  const option = await prisma.customFieldOption.update({ where: { id: existing.id }, data: parsed.data });
  res.json(option);
});

// DELETE /api/companies/:companyId/custom-fields/:customFieldId/options/:optionId
// 軟刪除：既有申請單的歷史資料可能參照到這個選項的 label，直接硬刪除會讓舊資料
// 顯示不出對應的選項文字，跟 Department/ExpenseCategory 用同一套模式。
customFieldOptionsRouter.delete("/:optionId", async (req: CustomFieldOptionScopedWithId, res) => {
  const field = await findOwnedCustomField(req.params.companyId, req.params.customFieldId);
  if (!field) return res.status(404).json({ error: "找不到這個自訂欄位" });
  const existing = await prisma.customFieldOption.findFirst({
    where: { id: req.params.optionId, customFieldId: field.id },
  });
  if (!existing) return res.status(404).json({ error: "找不到這個選項" });
  await prisma.customFieldOption.update({ where: { id: existing.id }, data: { active: false } });
  res.status(204).end();
});

customFieldsRouter.use("/:customFieldId/options", customFieldOptionsRouter);

// 費用類別 ↔ 自訂欄位的關聯管理，掛在
// /expense-categories/:categoryId/custom-fields 底下——是 ExpenseCategory.
// requiresProjectCode 的推廣版，選到這個類別時要多顯示/要求哪幾個自訂欄位。
export const expenseCategoryCustomFieldsRouter = Router({ mergeParams: true });
expenseCategoryCustomFieldsRouter.use(requireAuth, requireSameCompany, requireRole("admin"));

async function findOwnedCategory(companyId: string, categoryId: string) {
  return prisma.expenseCategory.findFirst({ where: { id: categoryId, companyId } });
}

// GET /api/companies/:companyId/expense-categories/:categoryId/custom-fields
expenseCategoryCustomFieldsRouter.get("/", async (req: CategoryCustomFieldScoped, res) => {
  const category = await findOwnedCategory(req.params.companyId, req.params.categoryId);
  if (!category) return res.status(404).json({ error: "找不到這個費用類別" });
  const links = await prisma.expenseCategoryCustomField.findMany({
    where: { expenseCategoryId: category.id },
  });
  res.json(links.map((l) => ({ customFieldId: l.customFieldId, required: l.required })));
});

const linksSchema = z.object({
  links: z.array(z.object({ customFieldId: z.string().min(1), required: z.boolean().default(true) })),
});

// PUT /api/companies/:companyId/expense-categories/:categoryId/custom-fields
// { links: [{ customFieldId, required }] }——整批取代這個類別目前關聯的自訂欄位。
expenseCategoryCustomFieldsRouter.put("/", async (req: CategoryCustomFieldScoped, res) => {
  const category = await findOwnedCategory(req.params.companyId, req.params.categoryId);
  if (!category) return res.status(404).json({ error: "找不到這個費用類別" });
  const parsed = linksSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // 確認這些 customFieldId 都真的屬於這家公司，避免亂帶別家公司的 id 進來關聯。
  const fieldIds = parsed.data.links.map((l) => l.customFieldId);
  const uniqueFieldIds = new Set(fieldIds);
  if (uniqueFieldIds.size !== fieldIds.length) {
    return res.status(400).json({ error: "同一個自訂欄位不能重複關聯" });
  }
  const validFields = await prisma.customField.findMany({
    where: { id: { in: fieldIds }, companyId: req.params.companyId },
  });
  if (validFields.length !== uniqueFieldIds.size) {
    return res.status(400).json({ error: "有自訂欄位不存在或不屬於此公司" });
  }

  // 整批取代：先刪光現有關聯，再照傳進來的清單重建——這張關聯表本來就不大
  // (一個類別頂多關聯到公司自己開的自訂欄位)，比對「加了哪些、刪了哪些」
  // 沒有比較簡單，直接整批換掉更不容易漏掉邊界情況。
  await prisma.$transaction([
    prisma.expenseCategoryCustomField.deleteMany({ where: { expenseCategoryId: category.id } }),
    ...(parsed.data.links.length > 0
      ? [
          prisma.expenseCategoryCustomField.createMany({
            data: parsed.data.links.map((l) => ({
              expenseCategoryId: category.id,
              customFieldId: l.customFieldId,
              required: l.required,
            })),
          }),
        ]
      : []),
  ]);
  res.status(204).end();
});
