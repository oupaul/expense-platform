import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { signAuthToken } from "../auth/jwt.js";
import { requireAuth, requirePlatformAdmin } from "../middleware/auth.js";

// 平台管理者(服務供應商)的登入，跟租戶使用者的 /api/auth/login 分開一支路由——
// 平台管理者不屬於任何公司，登入不需要(也不應該要)填 companySlug。
export const platformAuthRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/platform-auth/login
platformAuthRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;

  const admin = await prisma.platformAdmin.findUnique({ where: { email } });
  if (!admin || !admin.active || !(await verifyPassword(password, admin.passwordHash))) {
    return res.status(401).json({ error: "帳號或密碼錯誤" });
  }

  const token = signAuthToken({
    userId: admin.id,
    companyId: null,
    role: "platform_admin",
    departmentId: null,
  });

  res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email } });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "新密碼至少需要 8 個字元"),
});

// POST /api/platform-auth/change-password
platformAuthRouter.post("/change-password", requireAuth, requirePlatformAdmin, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const admin = await prisma.platformAdmin.findUnique({ where: { id: req.auth!.userId } });
  if (!admin || !(await verifyPassword(parsed.data.currentPassword, admin.passwordHash))) {
    return res.status(401).json({ error: "目前密碼不正確" });
  }
  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.platformAdmin.update({ where: { id: admin.id }, data: { passwordHash } });
  res.status(204).end();
});
