import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { hashPassword } from "../auth/password.js";
import { requireAuth, requireRole, requireSameCompany } from "../middleware/auth.js";

// mergeParams 讓 :companyId 在執行期確實會被合併進 req.params，但 TypeScript 只會依路由
// 自己的路徑字面量推斷型別，推不出來自父層掛載路徑的參數，所以要手動標型別。
type CompanyScoped = Request<{ companyId: string }>;
type CompanyScopedWithId = Request<{ companyId: string; id: string }>;

export const usersRouter = Router({ mergeParams: true });
usersRouter.use(requireAuth, requireSameCompany, requireRole("admin"));

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  departmentId: true,
  active: true,
  createdAt: true,
} as const;

// GET /api/companies/:companyId/users
usersRouter.get("/", async (req: CompanyScoped, res) => {
  const users = await prisma.user.findMany({
    where: { companyId: req.params.companyId },
    select: userSelect,
    orderBy: { createdAt: "asc" },
  });
  res.json(users);
});

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.string().min(1),
  departmentId: z.string().optional(),
  password: z.string().min(8, "密碼至少需要 8 個字元"),
});

// POST /api/companies/:companyId/users
usersRouter.post("/", async (req: CompanyScoped, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { password, ...rest } = parsed.data;

  if (rest.departmentId) {
    const dept = await prisma.department.findFirst({
      where: { id: rest.departmentId, companyId: req.params.companyId },
    });
    if (!dept) return res.status(400).json({ error: "部門不存在或不屬於此公司" });
  }

  const existing = await prisma.user.findUnique({
    where: { companyId_email: { companyId: req.params.companyId, email: rest.email } },
  });
  if (existing) return res.status(409).json({ error: "此 email 已被使用" });

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { ...rest, companyId: req.params.companyId, passwordHash },
    select: userSelect,
  });
  res.status(201).json(user);
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.string().min(1).optional(),
  departmentId: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

// PUT /api/companies/:companyId/users/:id
usersRouter.put("/:id", async (req: CompanyScopedWithId, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  if (req.params.id === req.auth!.userId && parsed.data.active === false) {
    return res.status(400).json({ error: "不能停用自己的帳號" });
  }
  if (parsed.data.departmentId) {
    const dept = await prisma.department.findFirst({
      where: { id: parsed.data.departmentId, companyId: req.params.companyId },
    });
    if (!dept) return res.status(400).json({ error: "部門不存在或不屬於此公司" });
  }
  // email 有 (companyId, email) 唯一約束，改成別人已經在用的 email 要擋掉，
  // 不能等資料庫丟唯一約束錯誤才處理(那樣訊息對使用者不友善)。
  if (parsed.data.email) {
    const existing = await prisma.user.findUnique({
      where: { companyId_email: { companyId: req.params.companyId, email: parsed.data.email } },
    });
    if (existing && existing.id !== req.params.id) {
      return res.status(409).json({ error: "此 email 已被使用" });
    }
  }
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: parsed.data,
    select: userSelect,
  });
  res.json(user);
});

const resetPasswordSchema = z.object({ newPassword: z.string().min(8, "密碼至少需要 8 個字元") });

// POST /api/companies/:companyId/users/:id/reset-password
usersRouter.post("/:id/reset-password", async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash } });
  res.status(204).end();
});
