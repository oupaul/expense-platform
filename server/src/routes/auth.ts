import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { signAuthToken } from "../auth/jwt.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

const loginSchema = z.object({
  companySlug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/login
authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { companySlug, email, password } = parsed.data;

  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) {
    return res.status(401).json({ error: "帳號或密碼錯誤" });
  }

  const user = await prisma.user.findUnique({
    where: { companyId_email: { companyId: company.id, email } },
  });
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ error: "帳號或密碼錯誤" });
  }

  const token = signAuthToken({
    userId: user.id,
    companyId: company.id,
    role: user.role,
    departmentId: user.departmentId,
  });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
      companyId: company.id,
      companySlug: company.slug,
    },
  });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "新密碼至少需要 8 個字元"),
});

// POST /api/auth/change-password
authRouter.post("/change-password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return res.status(401).json({ error: "目前密碼不正確" });
  }
  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.status(204).end();
});
