import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireSameCompany, requireRole } from "../middleware/auth.js";

// mergeParams 讓 :companyId 在執行期確實會被合併進 req.params，但 TypeScript 只會依路由
// 自己的路徑字面量推斷型別，推不出來自父層掛載路徑的參數，所以要手動標型別。
type CompanyScoped = Request<{ companyId: string }>;

// 給管理者看「通知的 email 到底有沒有真的寄出去」用的記錄——跟 notifications.ts 那支
// 給一般使用者看自己站內通知(鈴鐺清單)的路由不同，這支是 admin 專用，能看到全公司
// 所有人收到的通知，重點是 emailStatus/emailError 這兩個欄位。
export const notificationLogRouter = Router({ mergeParams: true });
notificationLogRouter.use(requireAuth, requireSameCompany, requireRole("admin"));

const LIST_LIMIT = 100;

const querySchema = z.object({
  emailStatus: z.enum(["sent", "failed", "skipped"]).optional(),
});

// GET /api/companies/:companyId/notification-log?emailStatus=failed
notificationLogRouter.get("/", async (req: CompanyScoped, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const companyId = req.params.companyId;
  const where = { companyId, ...(parsed.data.emailStatus ? { emailStatus: parsed.data.emailStatus } : {}) };

  // statusCounts 不受 emailStatus 篩選影響，永遠是全部狀態的統計——這樣切換篩選器時
  // 上方的統計數字才不會跟著篩選結果一起變動，管理者才看得出「全部裡面失敗的佔多少」。
  const [items, statusCounts] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.notification.groupBy({
      by: ["emailStatus"],
      where: { companyId },
      _count: { _all: true },
    }),
  ]);

  res.json({
    statusCounts: statusCounts.map((row) => ({ status: row.emailStatus, count: row._count._all })),
    items: items.map((n) => ({
      id: n.id,
      recipientName: n.user.name,
      recipientEmail: n.user.email,
      type: n.type,
      title: n.title,
      emailStatus: n.emailStatus,
      emailError: n.emailError,
      createdAt: n.createdAt.toISOString(),
    })),
  });
});
