import { Router, type Request } from "express";
import { prisma } from "../db.js";
import { requireAuth, requireSameCompany } from "../middleware/auth.js";

// mergeParams 讓 :companyId 在執行期確實會被合併進 req.params，但 TypeScript 只會依路由
// 自己的路徑字面量推斷型別，推不出來自父層掛載路徑的參數，所以要手動標型別。
type CompanyScoped = Request<{ companyId: string }>;
type CompanyScopedWithId = Request<{ companyId: string; id: string }>;

export const notificationsRouter = Router({ mergeParams: true });
notificationsRouter.use(requireAuth, requireSameCompany);

// 只給「最近一段」，不做分頁——通知本來就是拿來看「最近有沒有新的」，不是拿來當
// 完整歷史紀錄查詢用，30 筆對這個情境綽綽有餘，也不用另外處理分頁狀態。
const LIST_LIMIT = 30;

// GET /api/companies/:companyId/notifications
notificationsRouter.get("/", async (req: CompanyScoped, res) => {
  const auth = req.auth!;
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { companyId: req.params.companyId, userId: auth.userId },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
    }),
    prisma.notification.count({
      where: { companyId: req.params.companyId, userId: auth.userId, read: false },
    }),
  ]);
  res.json({ items, unreadCount });
});

// POST /api/companies/:companyId/notifications/:id/read
notificationsRouter.post("/:id/read", async (req: CompanyScopedWithId, res) => {
  const auth = req.auth!;
  // updateMany 而不是 update：找不到(不是這張、不屬於這個使用者)時安靜地 0 筆生效，
  // 不用先查一次再判斷 403/404——通知已讀本來就是低風險操作，沒必要做到那麼嚴格。
  await prisma.notification.updateMany({
    where: { id: req.params.id, companyId: req.params.companyId, userId: auth.userId },
    data: { read: true },
  });
  res.status(204).end();
});

// POST /api/companies/:companyId/notifications/read-all
notificationsRouter.post("/read-all", async (req: CompanyScoped, res) => {
  const auth = req.auth!;
  await prisma.notification.updateMany({
    where: { companyId: req.params.companyId, userId: auth.userId, read: false },
    data: { read: true },
  });
  res.status(204).end();
});
