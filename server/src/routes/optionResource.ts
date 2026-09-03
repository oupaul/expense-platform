import { Router, type Request } from "express";
import { z } from "zod";
import { requireAuth, requireRole, requireSameCompany } from "../middleware/auth.js";

// Department / ExpenseCategory / ExpenseNature 三張表結構完全相同(name + sortOrder + active，
// 都掛在某個 companyId 下)，後台的新增/編輯/刪除/排序邏輯用同一份工廠函式產生，
// 避免三份幾乎一樣的路由程式碼。

// mergeParams 讓 :companyId 在執行期確實會被合併進 req.params，但 TypeScript 只會依路由
// 自己的路徑字面量推斷型別，推不出來自父層掛載路徑的參數，所以要手動標型別。
type CompanyScoped = Request<{ companyId: string }>;

const upsertSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

interface OptionDelegate {
  findMany(args: any): Promise<any>;
  create(args: any): Promise<any>;
  update(args: any): Promise<any>;
  delete(args: any): Promise<any>;
}

export function createOptionRouter(getDelegate: () => OptionDelegate) {
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

  // PUT /api/companies/:companyId/<resource>/:id
  router.put("/:id", async (req, res) => {
    const parsed = upsertSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const item = await getDelegate().update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    res.json(item);
  });

  // DELETE /api/companies/:companyId/<resource>/:id
  // 用 active=false 軟刪除：既有申請單的歷史資料會參照到這些選項，直接硬刪除會破壞歷史紀錄的顯示。
  router.delete("/:id", async (req, res) => {
    await getDelegate().update({
      where: { id: req.params.id },
      data: { active: false },
    });
    res.status(204).end();
  });

  return router;
}
