import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { signAuthToken } from "../auth/jwt.js";
import { verifyM365IdToken } from "../auth/m365.js";
import { requireAuth } from "../middleware/auth.js";
import { loginRateLimiter } from "../middleware/rateLimit.js";
import type { Company, User } from "@prisma/client";

export const authRouter = Router();

// 密碼登入、M365 SSO 登入最後核發的 JWT/回應形狀完全一樣——使用者是透過哪種方式
// 登入的，對後面所有 API 呼叫、req.auth 的內容都沒有差異，共用同一個建構函式。
function buildLoginResponse(company: Company, user: User) {
  const token = signAuthToken({
    userId: user.id,
    companyId: company.id,
    role: user.role,
    departmentId: user.departmentId,
    canViewAllReports: user.canViewAllReports,
  });
  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
      companyId: company.id,
      companySlug: company.slug,
      canViewAllReports: user.canViewAllReports,
    },
  };
}

const loginSchema = z.object({
  companySlug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/login
authRouter.post("/login", loginRateLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { companySlug, email, password } = parsed.data;

  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) {
    return res.status(401).json({ error: "帳號或密碼錯誤" });
  }
  if (!company.active) {
    return res.status(403).json({ error: "此租戶已被停用，請聯絡服務供應商" });
  }

  const user = await prisma.user.findUnique({
    where: { companyId_email: { companyId: company.id, email } },
  });
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ error: "帳號或密碼錯誤" });
  }

  res.json(buildLoginResponse(company, user));
});

const m365CallbackSchema = z.object({
  companySlug: z.string().min(1),
  // MSAL.js(前端)登入完拿到的 Microsoft ID token，後端驗證簽章/發行者/受眾後
  // 用裡面的 email 比對系統既有的使用者帳號——SPA 型態的 Azure App 註冊搭配
  // PKCE 不需要 Client Secret，所以這裡完全沒有密鑰要處理。
  idToken: z.string().min(1),
});

// POST /api/auth/m365/callback
// 跟密碼登入共用同一個 rate limiter：這支路由的失敗嘗試(偽造/過期的 token、
// email 對不到帳號)一樣要被限速，理由跟密碼登入一樣是防止暴力嘗試。
authRouter.post("/m365/callback", loginRateLimiter, async (req, res) => {
  const parsed = m365CallbackSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { companySlug, idToken } = parsed.data;

  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) {
    return res.status(401).json({ error: "登入失敗" });
  }
  if (!company.active) {
    return res.status(403).json({ error: "此租戶已被停用，請聯絡服務供應商" });
  }
  if (!company.m365Enabled || !company.m365TenantId || !company.m365ClientId) {
    return res.status(400).json({ error: "此租戶尚未啟用 Microsoft 365 登入" });
  }

  let email: string;
  try {
    email = (await verifyM365IdToken(idToken, company.m365TenantId, company.m365ClientId)).email;
  } catch {
    return res.status(401).json({ error: "Microsoft 登入驗證失敗，請重新嘗試" });
  }

  // 刻意不自動建立新帳號：SSO 只是多一種登入方式，「這個 email 能不能用這個系統」
  // 還是由管理員在後台「使用者帳號」手動決定，不能因為對方在自己公司 Azure AD
  // 裡有帳號，就自動拿到這個系統的存取權限。
  const user = await prisma.user.findUnique({
    where: { companyId_email: { companyId: company.id, email } },
  });
  if (!user || !user.active) {
    return res.status(403).json({ error: "此 Microsoft 帳號尚未對應到系統帳號，請聯繫貴公司管理員建立帳號" });
  }

  res.json(buildLoginResponse(company, user));
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
