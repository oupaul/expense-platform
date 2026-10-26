import { Router, type Request } from "express";
import { prisma } from "../db.js";
import { requireAuth, requireSameCompany, requireRole } from "../middleware/auth.js";
import { EXTRA_NOTIFY_EVENTS, extraNotifyRulesSchema, parseRules } from "../services/extraNotifyRules.js";

// mergeParams 讓 :companyId 在執行期確實會被合併進 req.params，但 TypeScript 只會依路由
// 自己的路徑字面量推斷型別，推不出來自父層掛載路徑的參數，所以要手動標型別。
type CompanyScoped = Request<{ companyId: string }>;

// 「核准完成 / 被駁回 / 被退回」時除了申請人之外要額外通知誰(見 services/notifications.ts
// 的 notifyExtraRecipients)——只有這家公司自己的 admin 能看跟改。
export const notificationRulesRouter = Router({ mergeParams: true });
notificationRulesRouter.use(requireAuth, requireSameCompany, requireRole("admin"));

// GET /api/companies/:companyId/notification-rules
// 一併回傳「可以選的角色/使用者」，前端不用另外再打 users/stages 兩支 API 自己拼。
notificationRulesRouter.get("/", async (req: CompanyScoped, res) => {
  const companyId = req.params.companyId;
  const [company, users, stages] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { extraNotifyRules: true } }),
    prisma.user.findMany({
      where: { companyId, active: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    prisma.approvalStage.findMany({ where: { companyId }, select: { roleKey: true, label: true } }),
  ]);
  if (!company) return res.status(404).json({ error: "找不到公司" });

  const rules = parseRules(company.extraNotifyRules);
  const labelByRole = new Map(stages.map((s) => [s.roleKey, s.label]));
  // 已存在於規則裡、但目前沒有任何啟用中使用者擁有的角色也要列出來，不然管理者會看到
  // 一個「憑空消失」卻仍然生效的選項，沒辦法取消勾選。
  const roleKeys = new Set([
    ...users.map((u) => u.role),
    ...EXTRA_NOTIFY_EVENTS.flatMap((e) => rules[e].roles),
  ]);
  res.json({
    rules,
    roles: [...roleKeys].sort().map((roleKey) => ({ roleKey, label: labelByRole.get(roleKey) ?? null })),
    users,
  });
});

// PUT /api/companies/:companyId/notification-rules
notificationRulesRouter.put("/", async (req: CompanyScoped, res) => {
  const parsed = extraNotifyRulesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const companyId = req.params.companyId;

  // userIds 只收這家公司的使用者：不信任前端送來的 id，避免塞進別家公司的使用者 id
  // (到時候查詢本來就會被 companyId 條件擋掉，但不該讓這種髒資料存進去)。
  const companyUsers = await prisma.user.findMany({ where: { companyId }, select: { id: true } });
  const validIds = new Set(companyUsers.map((u) => u.id));
  const clean = Object.fromEntries(
    EXTRA_NOTIFY_EVENTS.map((e) => [
      e,
      {
        roles: [...new Set(parsed.data[e].roles)],
        userIds: [...new Set(parsed.data[e].userIds)].filter((id) => validIds.has(id)),
      },
    ])
  );
  await prisma.company.update({ where: { id: companyId }, data: { extraNotifyRules: clean } });
  res.status(204).end();
});
