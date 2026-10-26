import { Router, type Request } from "express";
import { z } from "zod";
import { requireAuth, requireRole, requireSameCompany } from "../middleware/auth.js";

// Department / ExpenseCategory / ExpenseNature 三張表結構幾乎相同(name + sortOrder + active，
// 都掛在某個 companyId 下)，後台的新增/編輯/刪除/排序邏輯用同一份工廠函式產生，
// 避免三份幾乎一樣的路由程式碼。ExpenseCategory 多一個 requiresProjectCode 欄位，
// 用 extraFields 讓呼叫端自行擴充 schema，不用整份路由重寫一次。

// mergeParams 讓 :companyId 在執行期確實會被合併進 req.params，但 TypeScript 只會依路由
// 自己的路徑字面量推斷型別，推不出來自父層掛載路徑的參數，所以要手動標型別。
type CompanyScoped = Request<{ companyId: string }>;
type CompanyScopedWithId = Request<{ companyId: string; id: string }>;

// Postgres Int(4 bytes)的範圍，超過會在寫入時丟資料庫錯誤，在驗證階段就擋下來回 400。
const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

interface OptionDelegate {
  findMany(args: any): Promise<any>;
  create(args: any): Promise<any>;
  update(args: any): Promise<any>;
  delete(args: any): Promise<any>;
}

export function createOptionRouter(
  getDelegate: () => OptionDelegate,
  extraFields: Record<string, z.ZodTypeAny> = {}
) {
  const upsertSchema = z.object({
    name: z.string().min(1),
    sortOrder: z.number().int().min(INT32_MIN).max(INT32_MAX).optional(),
    active: z.boolean().optional(),
    ...extraFields,
  });

  const router = Router({ mergeParams: true });
  // 這整組路由只給後台管理用，一律要求登入 + admin 角色 + 只能動自己公司的資料。
  router.use(requireAuth, requireSameCompany, requireRole("admin"));

  // GET /api/companies/:companyId/<resource>
  router.get("/", async (req: CompanyScoped, res) => {
    const items = await getDelegate().findMany({
      where: { companyId: req.params.companyId },
      orderBy: { sortOrder: "asc" },
    });
    res.json(items);
  });

  // POST /api/companies/:companyId/<resource>
  router.post("/", async (req: CompanyScoped, res) => {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const item = await getDelegate().create({
      data: { ...parsed.data, companyId: req.params.companyId },
    });
    res.status(201).json(item);
  });

  // PUT /api/companies/:companyId/<resource>/reorder  { orderedIds: string[] }
  // 注意：這條路由要放在 "/:id" 之前，否則 "reorder" 會被 Express 當成 :id 吃掉。
  // 這三張表的 sortOrder 沒有唯一約束(不像 ApprovalStage)，直接照順序寫入即可，
  // 不需要先挪到暫存區間再改。
  router.put("/reorder", async (req: CompanyScoped, res) => {
    const parsed = z.object({ orderedIds: z.array(z.string()) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const delegate = getDelegate();
    const { companyId } = req.params;
    // 排序的 id 必須全部屬於這家公司：requireSameCompany 只檢查網址上的 companyId 是不是自己的
    // 公司，並不會檢查 body 裡帶的 id 屬於誰，沒擋的話就能用別家公司的 id 去改它的排序。
    const ids = parsed.data.orderedIds;
    const owned = await delegate.findMany({ where: { companyId, id: { in: ids } }, select: { id: true } });
    if (owned.length !== new Set(ids).size) {
      return res.status(404).json({ error: "清單中有不存在或不屬於此公司的項目" });
    }
    await Promise.all(ids.map((id, index) => delegate.update({ where: { id, companyId }, data: { sortOrder: index } })));
    res.status(204).end();
  });

  // PUT /api/companies/:companyId/<resource>/:id
  router.put("/:id", async (req: CompanyScopedWithId, res) => {
    const parsed = upsertSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    // where 一定要帶 companyId：只用 id 的話，A 公司的 admin 拿到 B 公司的 id 就能改到 B 的資料。
    // 找不到(不存在，或屬於別家公司)時 Prisma 丟 P2025，統一由全域錯誤處理轉成 404。
    const item = await getDelegate().update({
      where: { id: req.params.id, companyId: req.params.companyId },
      data: parsed.data,
    });
    res.json(item);
  });

  // DELETE /api/companies/:companyId/<resource>/:id
  // 用 active=false 軟刪除：既有申請單的歷史資料會參照到這些選項，直接硬刪除會破壞歷史紀錄的顯示。
  router.delete("/:id", async (req: CompanyScopedWithId, res) => {
    await getDelegate().update({
      where: { id: req.params.id, companyId: req.params.companyId },
      data: { active: false },
    });
    res.status(204).end();
  });

  return router;
}
