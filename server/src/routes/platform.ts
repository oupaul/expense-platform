import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { hashPassword } from "../auth/password.js";
import { requireAuth, requirePlatformAdmin } from "../middleware/auth.js";

// 平台管理者建立/檢視租戶(公司)的路由，只有服務供應商自己能用。
export const platformRouter = Router();
platformRouter.use(requireAuth, requirePlatformAdmin);

// GET /api/platform/companies
// 一併帶出 admin 角色的使用者清單(id/name/email)，讓平台管理者能直接在列表上
// 挑對象重設密碼，不用另外開一個公司明細頁。
platformRouter.get("/companies", async (_req, res) => {
  const companies = await prisma.company.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { users: true, applications: true } },
      users: { where: { role: "admin" }, select: { id: true, name: true, email: true } },
    },
  });
  res.json(
    companies.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      nameEn: c.nameEn,
      active: c.active,
      createdAt: c.createdAt,
      userCount: c._count.users,
      applicationCount: c._count.applications,
      admins: c.users,
    }))
  );
});

const createCompanySchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "只能使用小寫英文字母、數字、連字號"),
  name: z.string().min(1),
  nameEn: z.string().optional(),
  adminName: z.string().min(1),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8, "密碼至少需要 8 個字元"),
});

// POST /api/platform/companies
// 建立租戶 + 該租戶的第一個 admin 帳號。部門/費用項目/簽核關卡等設定刻意不預先塞資料，
// 交給新公司的 admin 自己登入後台設定——不同客戶的組織架構、簽核層級都不一樣，
// 平台這邊猜一套預設值意義不大，且後台每個管理頁面本來就有處理「尚未設定」的空狀態。
platformRouter.post("/companies", async (req, res) => {
  const parsed = createCompanySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { slug, name, nameEn, adminName, adminEmail, adminPassword } = parsed.data;

  const existing = await prisma.company.findUnique({ where: { slug } });
  if (existing) return res.status(409).json({ error: "這個租戶代號已經被使用" });

  const passwordHash = await hashPassword(adminPassword);
  const company = await prisma.company.create({
    data: {
      slug,
      name,
      nameEn,
      users: {
        create: { name: adminName, email: adminEmail, passwordHash, role: "admin" },
      },
    },
    include: { users: true },
  });

  res.status(201).json({
    id: company.id,
    slug: company.slug,
    name: company.name,
    nameEn: company.nameEn,
    createdAt: company.createdAt,
    admin: { id: company.users[0].id, name: company.users[0].name, email: company.users[0].email },
  });
});

const updateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  nameEn: z.string().optional(),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "只能使用小寫英文字母、數字、連字號")
    .optional(),
  active: z.boolean().optional(),
});

// PUT /api/platform/companies/:id
// 改基本資料、停用/啟用整個租戶(停用只影響之後的登入，已經登入的 token 8 小時內仍有效)。
platformRouter.put("/companies/:id", async (req, res) => {
  const parsed = updateCompanySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const existing = await prisma.company.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "找不到租戶" });

  if (parsed.data.slug && parsed.data.slug !== existing.slug) {
    const slugTaken = await prisma.company.findUnique({ where: { slug: parsed.data.slug } });
    if (slugTaken) return res.status(409).json({ error: "這個租戶代號已經被使用" });
  }

  const company = await prisma.company.update({ where: { id: req.params.id }, data: parsed.data });
  res.json({ id: company.id, slug: company.slug, name: company.name, nameEn: company.nameEn, active: company.active });
});

const resetAdminPasswordSchema = z.object({ newPassword: z.string().min(8, "密碼至少需要 8 個字元") });

// POST /api/platform/companies/:id/admins/:userId/reset-password
// 刻意限定只能重設「role=admin」的使用者——一般使用者的密碼重設是該租戶自己 admin 的權限，
// 平台管理者的角色是在客戶自己的 admin 都聯絡不上時，幫忙重新拿回控制權，不是取代租戶內部管理。
platformRouter.post("/companies/:id/admins/:userId/reset-password", async (req, res) => {
  const parsed = resetAdminPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const user = await prisma.user.findFirst({ where: { id: req.params.userId, companyId: req.params.id, role: "admin" } });
  if (!user) return res.status(404).json({ error: "找不到這個租戶的管理員帳號" });

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.status(204).end();
});

// GET /api/platform/admins
platformRouter.get("/admins", async (_req, res) => {
  const admins = await prisma.platformAdmin.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, active: true, createdAt: true },
  });
  res.json(admins);
});

const createPlatformAdminSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, "密碼至少需要 8 個字元"),
});

// POST /api/platform/admins
platformRouter.post("/admins", async (req, res) => {
  const parsed = createPlatformAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const existing = await prisma.platformAdmin.findUnique({ where: { email: parsed.data.email } });
  if (existing) return res.status(409).json({ error: "這個 email 已經是平台管理者" });

  const passwordHash = await hashPassword(parsed.data.password);
  const admin = await prisma.platformAdmin.create({
    data: { name: parsed.data.name, email: parsed.data.email, passwordHash },
  });
  res.status(201).json({ id: admin.id, name: admin.name, email: admin.email, active: admin.active, createdAt: admin.createdAt });
});

const updatePlatformAdminSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  active: z.boolean().optional(),
});

// PUT /api/platform/admins/:id
platformRouter.put("/admins/:id", async (req, res) => {
  const parsed = updatePlatformAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  // 不能停用自己：跟租戶 users.ts 的 requireAuth 帳號同一個道理，
  // 不然可能不小心把唯一一個能登入的平台管理者帳號鎖死。
  if (req.params.id === req.auth!.userId && parsed.data.active === false) {
    return res.status(400).json({ error: "不能停用自己的帳號" });
  }
  const existing = await prisma.platformAdmin.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "找不到這個平台管理者" });

  if (parsed.data.email && parsed.data.email !== existing.email) {
    const emailTaken = await prisma.platformAdmin.findUnique({ where: { email: parsed.data.email } });
    if (emailTaken) return res.status(409).json({ error: "這個 email 已經是平台管理者" });
  }

  const admin = await prisma.platformAdmin.update({ where: { id: req.params.id }, data: parsed.data });
  res.json({ id: admin.id, name: admin.name, email: admin.email, active: admin.active, createdAt: admin.createdAt });
});

const resetPlatformAdminPasswordSchema = z.object({ newPassword: z.string().min(8, "密碼至少需要 8 個字元") });

// POST /api/platform/admins/:id/reset-password
platformRouter.post("/admins/:id/reset-password", async (req, res) => {
  const parsed = resetPlatformAdminPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const admin = await prisma.platformAdmin.findUnique({ where: { id: req.params.id } });
  if (!admin) return res.status(404).json({ error: "找不到這個平台管理者" });

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.platformAdmin.update({ where: { id: admin.id }, data: { passwordHash } });
  res.status(204).end();
});
