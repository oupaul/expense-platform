import path from "node:path";
import fs from "node:fs";
import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole, requireSameCompany } from "../middleware/auth.js";

export const companiesRouter = Router();

// 公司 Logo/瀏覽器分頁圖示——刻意存在 uploads/ 底下的獨立子目錄，而不是另外開一個
// 新的頂層資料夾：這樣 server/scripts/backup.sh(整包備份 uploads/) 不用跟著改，
// 這批檔案就會自動被含在既有的備份範圍裡。跟憑證附件不同的是，這個子目錄會在
// index.ts 掛一個「不需要登入」的公開靜態路徑——瀏覽器原生載入 <link rel="icon">
// 不會帶我們自訂的 Authorization header，沒辦法比照憑證附件走認證過的路由。
const LOGO_UPLOAD_ROOT = path.join(process.cwd(), "uploads", "company-logos");
const MAX_LOGO_SIZE = 2 * 1024 * 1024;
// 分頁圖示很小張，256px 綽綽有餘(書籤、PWA icon 等情境也夠用)，不需要跟憑證附件
// 一樣考慮到列印/放大檢視的畫質。統一輸出 PNG 而不是 WebP——WebP 當 favicon 在
// Safari 上支援不完整，這裡相容性比省那幾 KB 檔案大小重要。
const LOGO_DIMENSION = 256;

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) {
      cb(new Error("只接受 PNG / JPEG / WEBP 圖片"));
      return;
    }
    cb(null, true);
  },
});

function logoUploadErrorMessage(err: unknown): string {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return `檔案過大，不能超過 ${MAX_LOGO_SIZE / 1024 / 1024}MB`;
  }
  return err instanceof Error ? err.message : "上傳失敗";
}

// GET /api/companies/:slug/config
// 前端 useCompanyConfig 打的就是這支，取代掉原本 vite.config.ts 裡的假 API。
companiesRouter.get("/:slug/config", async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { slug: req.params.slug },
    include: {
      departments: { where: { active: true }, orderBy: { sortOrder: "asc" } },
      expenseCategories: { where: { active: true }, orderBy: { sortOrder: "asc" } },
      expenseNatures: { where: { active: true }, orderBy: { sortOrder: "asc" } },
      approvalStages: { where: { active: true }, orderBy: { stageOrder: "asc" } },
      exchangeRates: true,
    },
  });

  if (!company) {
    return res.status(404).json({ error: `找不到公司：${req.params.slug}` });
  }

  res.json({
    companyId: company.id,
    branding: {
      name: company.name,
      nameEn: company.nameEn ?? undefined,
      logoUrl: company.logoUrl ?? undefined,
      primaryColor: company.primaryColor,
      headerBgColor: company.headerBgColor,
      gradientFrom: company.gradientFrom,
      gradientTo: company.gradientTo,
    },
    multiCurrencyEnabled: company.multiCurrencyEnabled,
    optionalFields: company.optionalFields,
    printRowsPerPage: company.printRowsPerPage,
    departments: company.departments.map((d) => ({ id: d.id, name: d.name })),
    expenseNatures: company.expenseNatures.map((n) => ({ id: n.id, name: n.name })),
    expenseCategories: company.expenseCategories.map((c) => ({
      id: c.id,
      name: c.name,
      requiresProjectCode: c.requiresProjectCode,
    })),
    approvalStages: company.approvalStages.map((s) => ({
      id: s.id,
      stageOrder: s.stageOrder,
      roleKey: s.roleKey,
      label: s.label,
    })),
    exchangeRates: company.exchangeRates.map((r) => ({ currency: r.currency, rateToTWD: r.rateToTWD })),
  });
});

const optionalFieldsSchema = z.object({
  projectCode: z.boolean().optional(),
  invoiceDate: z.boolean().optional(),
  payeeInfo: z.boolean().optional(),
  requestedPaymentDate: z.boolean().optional(),
});

const settingsSchema = z.object({
  multiCurrencyEnabled: z.boolean().optional(),
  optionalFields: optionalFieldsSchema.optional(),
  name: z.string().min(1).optional(),
  nameEn: z.string().optional(),
  // 瀏覽器分頁圖示(favicon)網址；除了手動貼外部網址，也可能是上傳圖片後自動填回來的
  // 站內相對路徑(/public/company-logos/...)，所以除了合法網址，也接受 "/" 開頭的路徑。
  // 空字串代表清掉、改回預設圖示。
  logoUrl: z.union([z.string().url(), z.string().regex(/^\//), z.literal("")]).optional(),
  // 上限抓 20：實測短文字時一頁 A4 大約能放到 16 筆左右就會超出可印刷高度，
  // 抓 20 留一點彈性給文字特別短的公司，超過這個數字的極端情況交給 usePrintFit 兜底縮放。
  printRowsPerPage: z.number().int().min(1).max(20).optional(),
});

// PUT /api/companies/:companyId/settings  （用 companyId 而非 slug，跟其他後台管理路由一致）
companiesRouter.put(
  "/:companyId/settings",
  requireAuth,
  requireSameCompany,
  requireRole("admin"),
  async (req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const existing = await prisma.company.findUnique({ where: { id: req.params.companyId } });
    if (!existing) return res.status(404).json({ error: "找不到公司" });

    // optionalFields 存在 Company 上的單一 JSON 欄位裡，這裡只更新有帶到的欄位，
    // 沒帶到的維持原樣，不能直接整包覆蓋掉沒動到的開關。
    const { optionalFields, logoUrl, ...rest } = parsed.data;
    const mergedOptionalFields = optionalFields
      ? { ...(existing.optionalFields as Record<string, boolean>), ...optionalFields }
      : undefined;

    const company = await prisma.company.update({
      where: { id: req.params.companyId },
      data: {
        ...rest,
        ...(logoUrl !== undefined ? { logoUrl: logoUrl || null } : {}),
        ...(mergedOptionalFields ? { optionalFields: mergedOptionalFields } : {}),
      },
    });
    res.json({
      name: company.name,
      nameEn: company.nameEn,
      logoUrl: company.logoUrl,
      multiCurrencyEnabled: company.multiCurrencyEnabled,
      optionalFields: company.optionalFields,
      printRowsPerPage: company.printRowsPerPage,
    });
  }
);

// POST /api/companies/:companyId/logo —— 上傳圖片檔案設定 Logo/瀏覽器分頁圖示，
// 跟上面 PUT /settings 手動貼網址是兩條平行的路，都是在寫同一個 logoUrl 欄位。
companiesRouter.post(
  "/:companyId/logo",
  requireAuth,
  requireSameCompany,
  requireRole("admin"),
  (req, res, next) => {
    logoUpload.single("logo")(req, res, (err) => {
      if (err) return res.status(400).json({ error: logoUploadErrorMessage(err) });
      next();
    });
  },
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "請選擇圖片檔案" });

    const pngBuffer = await sharp(req.file.buffer)
      .resize({ width: LOGO_DIMENSION, height: LOGO_DIMENSION, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();

    fs.mkdirSync(LOGO_UPLOAD_ROOT, { recursive: true });
    fs.writeFileSync(path.join(LOGO_UPLOAD_ROOT, `${req.params.companyId}.png`), pngBuffer);

    // 檔名固定、每次上傳都覆蓋掉，靠 query string 帶時間戳記破快取——瀏覽器對 favicon
    // 快取通常很積極，同一個檔名網址換了圖片內容不會主動重抓新的。
    const logoUrl = `/public/company-logos/${req.params.companyId}.png?v=${Date.now()}`;
    const company = await prisma.company.update({
      where: { id: req.params.companyId },
      data: { logoUrl },
    });
    res.json({ logoUrl: company.logoUrl });
  }
);
