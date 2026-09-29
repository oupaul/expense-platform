import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { encryptSecret } from "../auth/nasSecret.js";
import { requireAuth, requireSameCompany, requireRole } from "../middleware/auth.js";
import { testSmtpConnection, testM365Connection } from "../services/mailer.js";

// mergeParams 讓 :companyId 在執行期確實會被合併進 req.params，但 TypeScript 只會依路由
// 自己的路徑字面量推斷型別，推不出來自父層掛載路徑的參數，所以要手動標型別。
type CompanyScoped = Request<{ companyId: string }>;

// 租戶自己的寄信設定——跟 platform.ts 的 /platform/notification-config 是同一套模式
// (同樣的欄位形狀、同樣不回傳明碼密碼)，差別是這裡存在 Company.notify* 欄位上，
// 只有這家公司自己的 admin 能看/改，不是平台管理者專用。留空(不設定)代表沿用
// 平台層級的預設寄信設定，這是多數客戶一開始的狀態，只有想用自己公司郵件伺服器
// 寄信的客戶才需要另外設定，詳細的「有效設定」判斷邏輯在 services/mailer.ts。
export const companyNotificationConfigRouter = Router({ mergeParams: true });
companyNotificationConfigRouter.use(requireAuth, requireSameCompany, requireRole("admin"));

// GET /api/companies/:companyId/notification-config
companyNotificationConfigRouter.get("/", async (req: CompanyScoped, res) => {
  const company = await prisma.company.findUnique({
    where: { id: req.params.companyId },
    select: {
      notifyAuthMethod: true,
      notifySmtpHost: true,
      notifySmtpPort: true,
      notifySmtpSecure: true,
      notifySmtpUser: true,
      notifySmtpPassEnc: true,
      notifySmtpFrom: true,
      notifySmtpAllowSelfSigned: true,
      notifyM365TenantId: true,
      notifyM365ClientId: true,
      notifyM365ClientSecretEnc: true,
      notifyM365FromAddress: true,
    },
  });
  if (!company) return res.status(404).json({ error: "找不到公司" });

  // 目前有沒有真的在用自己的設定(而不是退回平台預設)，判斷邏輯要跟 mailer.ts 的
  // resolveMailConfig 保持一致——只有畫面上知道「現在到底是誰的帳號在寄信」，
  // 使用者才不會誤以為自己填了設定就一定生效。
  const usingOwnSmtp = company.notifyAuthMethod === "smtp" && !!company.notifySmtpHost && !!company.notifySmtpUser && !!company.notifySmtpPassEnc;
  const usingOwnM365 =
    company.notifyAuthMethod === "m365_oauth2" &&
    !!company.notifyM365TenantId &&
    !!company.notifyM365ClientId &&
    !!company.notifyM365ClientSecretEnc &&
    !!company.notifyM365FromAddress;

  res.json({
    authMethod: company.notifyAuthMethod ?? "smtp",
    smtpHost: company.notifySmtpHost ?? "",
    smtpPort: company.notifySmtpPort ?? 587,
    smtpSecure: company.notifySmtpSecure ?? false,
    smtpUser: company.notifySmtpUser ?? "",
    smtpFrom: company.notifySmtpFrom ?? "",
    smtpAllowSelfSigned: company.notifySmtpAllowSelfSigned ?? false,
    hasSmtpPass: !!company.notifySmtpPassEnc,
    m365TenantId: company.notifyM365TenantId ?? "",
    m365ClientId: company.notifyM365ClientId ?? "",
    m365FromAddress: company.notifyM365FromAddress ?? "",
    hasM365ClientSecret: !!company.notifyM365ClientSecretEnc,
    usingPlatformDefault: !usingOwnSmtp && !usingOwnM365,
  });
});

const notificationConfigSchema = z.object({
  authMethod: z.enum(["smtp", "m365_oauth2"]).optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().optional(),
  smtpFrom: z.string().optional(),
  smtpAllowSelfSigned: z.boolean().optional(),
  // 沒帶這個欄位代表沿用現有密碼(例如只是改寄件人顯示名稱，不想每次都要重打一次密碼)。
  smtpPass: z.string().optional(),
  m365TenantId: z.string().optional(),
  m365ClientId: z.string().optional(),
  m365FromAddress: z.string().optional(),
  // 同 smtpPass：沒帶代表沿用現有 client secret。
  m365ClientSecret: z.string().optional(),
});

// PUT /api/companies/:companyId/notification-config
companyNotificationConfigRouter.put("/", async (req: CompanyScoped, res) => {
  const parsed = notificationConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { smtpPass, m365ClientSecret, smtpHost, smtpPort, smtpSecure, smtpUser, smtpFrom, smtpAllowSelfSigned, m365TenantId, m365ClientId, m365FromAddress, authMethod } =
    parsed.data;
  await prisma.company.update({
    where: { id: req.params.companyId },
    data: {
      notifyAuthMethod: authMethod,
      notifySmtpHost: smtpHost,
      notifySmtpPort: smtpPort,
      notifySmtpSecure: smtpSecure,
      notifySmtpUser: smtpUser,
      notifySmtpFrom: smtpFrom,
      notifySmtpAllowSelfSigned: smtpAllowSelfSigned,
      notifyM365TenantId: m365TenantId,
      notifyM365ClientId: m365ClientId,
      notifyM365FromAddress: m365FromAddress,
      ...(smtpPass ? { notifySmtpPassEnc: encryptSecret(smtpPass) } : {}),
      ...(m365ClientSecret ? { notifyM365ClientSecretEnc: encryptSecret(m365ClientSecret) } : {}),
    },
  });
  res.status(204).end();
});

// DELETE /api/companies/:companyId/notification-config
// 清掉這家公司自己的設定，改回沿用平台預設——不用一個一個欄位清空，直接整組設回 null。
companyNotificationConfigRouter.delete("/", async (req: CompanyScoped, res) => {
  await prisma.company.update({
    where: { id: req.params.companyId },
    data: {
      notifyAuthMethod: null,
      notifySmtpHost: null,
      notifySmtpPort: null,
      notifySmtpSecure: null,
      notifySmtpUser: null,
      notifySmtpPassEnc: null,
      notifySmtpFrom: null,
      notifySmtpAllowSelfSigned: null,
      notifyM365TenantId: null,
      notifyM365ClientId: null,
      notifyM365ClientSecretEnc: null,
      notifyM365FromAddress: null,
    },
  });
  res.status(204).end();
});

const testSmtpSchema = z.object({
  authMethod: z.enum(["smtp", "m365_oauth2"]).default("smtp"),
  smtpHost: z.string().optional(),
  smtpPort: z.number().int().min(1).max(65535).default(587),
  smtpSecure: z.boolean().default(false),
  smtpUser: z.string().optional(),
  smtpAllowSelfSigned: z.boolean().optional(),
  // 測試連線時如果沒帶新密碼/client secret，就用資料庫裡已經存的那組(方便只改
  // 主機/port/tenantId 之類的設定就重測，不用每次都重打一次機密資料)。
  smtpPass: z.string().optional(),
  m365TenantId: z.string().optional(),
  m365ClientId: z.string().optional(),
  m365FromAddress: z.string().optional(),
  m365ClientSecret: z.string().optional(),
  testRecipient: z.string().email().optional(),
});

// POST /api/companies/:companyId/notification-config/test
companyNotificationConfigRouter.post("/test", async (req: CompanyScoped, res) => {
  const parsed = testSmtpSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const existing = await prisma.company.findUnique({
    where: { id: req.params.companyId },
    select: { notifySmtpPassEnc: true, notifyM365ClientSecretEnc: true },
  });

  if (parsed.data.authMethod === "m365_oauth2") {
    const clientSecretEnc = parsed.data.m365ClientSecret ? encryptSecret(parsed.data.m365ClientSecret) : existing?.notifyM365ClientSecretEnc;
    if (!clientSecretEnc) {
      return res.status(400).json({ error: "尚未設定 M365 Client Secret" });
    }
    if (!parsed.data.m365TenantId || !parsed.data.m365ClientId || !parsed.data.m365FromAddress) {
      return res.status(400).json({ error: "請填寫 Tenant ID、Client ID、寄件人信箱" });
    }
    const result = await testM365Connection({
      tenantId: parsed.data.m365TenantId,
      clientId: parsed.data.m365ClientId,
      clientSecretEnc,
      fromAddress: parsed.data.m365FromAddress,
      testRecipient: parsed.data.testRecipient,
    });
    return res.json(result);
  }

  const passEnc = parsed.data.smtpPass ? encryptSecret(parsed.data.smtpPass) : existing?.notifySmtpPassEnc;
  if (!passEnc) {
    return res.status(400).json({ error: "尚未設定 SMTP 密碼" });
  }
  if (!parsed.data.smtpHost || !parsed.data.smtpUser) {
    return res.status(400).json({ error: "請填寫 SMTP 主機、使用者帳號" });
  }

  const result = await testSmtpConnection({
    host: parsed.data.smtpHost,
    port: parsed.data.smtpPort,
    secure: parsed.data.smtpSecure,
    user: parsed.data.smtpUser,
    passEnc,
    allowSelfSigned: parsed.data.smtpAllowSelfSigned,
    testRecipient: parsed.data.testRecipient,
  });
  res.json(result);
});
