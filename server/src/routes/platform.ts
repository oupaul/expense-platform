import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { hashPassword } from "../auth/password.js";
import { requireAuth, requirePlatformAdmin } from "../middleware/auth.js";

// 平台管理者建立/檢視租戶(公司)的路由，只有服務供應商自己能用。
export const platformRouter = Router();
platformRouter.use(requireAuth, requirePlatformAdmin);

// GET /api/platform/companies
platformRouter.get("/companies", async (_req, res) => {
  const companies = await prisma.company.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { users: true, applications: true } } },
  });
  res.json(
    companies.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      nameEn: c.nameEn,
      createdAt: c.createdAt,
      userCount: c._count.users,
      applicationCount: c._count.applications,
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
