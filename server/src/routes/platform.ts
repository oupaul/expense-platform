import path from "node:path";
import fs from "node:fs";
import { Router } from "express";
import { z } from "zod";
import cron from "node-cron";
import { prisma } from "../db.js";
import { hashPassword } from "../auth/password.js";
import { encryptSecret } from "../auth/nasSecret.js";
import { requireAuth, requirePlatformAdmin } from "../middleware/auth.js";
import { BACKUP_DIR, rescheduleBackupJob, runBackupNow, testNasConnection } from "../services/backupScheduler.js";

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

// GET /api/platform/backup-config
// 絕對不回傳解密後的私鑰內容，只回「有沒有設定」，前端沒有理由需要看到私鑰本身。
platformRouter.get("/backup-config", async (_req, res) => {
  const config = await prisma.backupConfig.findUnique({ where: { id: "singleton" } });
  res.json({
    enabled: config?.enabled ?? false,
    cronExpression: config?.cronExpression ?? "0 3 * * *",
    retentionDays: config?.retentionDays ?? 14,
    nasEnabled: config?.nasEnabled ?? false,
    nasHost: config?.nasHost ?? "",
    nasPort: config?.nasPort ?? 22,
    nasUsername: config?.nasUsername ?? "",
    nasRemotePath: config?.nasRemotePath ?? "",
    hasNasPrivateKey: !!config?.nasPrivateKeyEnc,
    lastRunAt: config?.lastRunAt ?? null,
    lastRunStatus: config?.lastRunStatus ?? null,
    lastRunMessage: config?.lastRunMessage ?? null,
  });
});

const backupConfigSchema = z.object({
  enabled: z.boolean().optional(),
  cronExpression: z.string().optional(),
  retentionDays: z.number().int().min(1).max(365).optional(),
  nasEnabled: z.boolean().optional(),
  nasHost: z.string().optional(),
  nasPort: z.number().int().min(1).max(65535).optional(),
  nasUsername: z.string().optional(),
  nasRemotePath: z.string().optional(),
  // 沒帶這個欄位代表沿用現有的私鑰(例如只是改排程時間，不想每次都要重貼一次私鑰)。
  nasPrivateKey: z.string().optional(),
});

// PUT /api/platform/backup-config
platformRouter.put("/backup-config", async (req, res) => {
  const parsed = backupConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  if (parsed.data.cronExpression && !cron.validate(parsed.data.cronExpression)) {
    return res.status(400).json({ error: "cron 表達式格式不正確" });
  }

  const { nasPrivateKey, ...rest } = parsed.data;
  await prisma.backupConfig.upsert({
    where: { id: "singleton" },
    update: {
      ...rest,
      ...(nasPrivateKey ? { nasPrivateKeyEnc: encryptSecret(nasPrivateKey) } : {}),
    },
    create: {
      id: "singleton",
      ...rest,
      ...(nasPrivateKey ? { nasPrivateKeyEnc: encryptSecret(nasPrivateKey) } : {}),
    },
  });

  await rescheduleBackupJob();
  res.status(204).end();
});

// POST /api/platform/backup-config/run-now
// 手動立刻跑一次，不用等排程時間到——設定完 NAS 想馬上確認整個流程真的沒問題時很有用。
platformRouter.post("/backup-config/run-now", async (_req, res) => {
  const result = await runBackupNow();
  res.json(result);
});

const testNasSchema = z.object({
  nasHost: z.string().min(1),
  nasPort: z.number().int().min(1).max(65535).default(22),
  nasUsername: z.string().min(1),
  nasRemotePath: z.string().min(1),
  // 測試連線時如果沒帶新私鑰，就用資料庫裡已經存的那把(方便只改路徑之類的設定就重測)。
  nasPrivateKey: z.string().optional(),
});

// POST /api/platform/backup-config/test-nas
platformRouter.post("/backup-config/test-nas", async (req, res) => {
  const parsed = testNasSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  let nasPrivateKeyEnc: string | undefined;
  if (parsed.data.nasPrivateKey) {
    nasPrivateKeyEnc = encryptSecret(parsed.data.nasPrivateKey);
  } else {
    const existing = await prisma.backupConfig.findUnique({ where: { id: "singleton" } });
    nasPrivateKeyEnc = existing?.nasPrivateKeyEnc ?? undefined;
  }
  if (!nasPrivateKeyEnc) {
    return res.status(400).json({ error: "尚未設定 SSH 私鑰" });
  }

  const result = await testNasConnection({ ...parsed.data, nasPrivateKeyEnc });
  res.json(result);
});

// GET /api/platform/backups
// 列出本機備份目錄的檔案(名稱/大小/時間)。NAS 是用 --delete 鏡像同步，內容跟本機一致，
// 不用另外開一支 SSH 進 NAS 列檔案的邏輯。
platformRouter.get("/backups", async (_req, res) => {
  if (!fs.existsSync(BACKUP_DIR)) return res.json([]);
  const files = fs
    .readdirSync(BACKUP_DIR)
    .map((filename) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, filename));
      return { filename, size: stat.size, createdAt: stat.mtime };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  res.json(files);
});

// 檔名只能是 backup.sh 實際會產生的那三種格式，避免任何路徑穿越或讀取備份目錄以外的檔案。
const SAFE_BACKUP_FILENAME = /^(db-[\d-]+\.sql\.gz|env-backup-[\d-]+|uploads-[\d-]+\.tar\.gz)$/;

// GET /api/platform/backups/:filename
platformRouter.get("/backups/:filename", (req, res) => {
  if (!SAFE_BACKUP_FILENAME.test(req.params.filename)) {
    return res.status(400).json({ error: "檔名格式不正確" });
  }
  const filePath = path.join(BACKUP_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "找不到備份檔案" });
  res.download(filePath);
});
