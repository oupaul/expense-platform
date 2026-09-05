import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import multer from "multer";
import sharp from "sharp";
import { prisma } from "../db.js";

// mergeParams 讓 :companyId(從 index.ts 掛載路徑)、:id(申請單 id，從 applications.ts 的
// "/:id/attachments" 掛載路徑)都會被合併進 req.params。
type Params = { companyId: string; id: string; attachmentId: string };
type ScopedRequest = Request<Params>;

// 檔案存伺服器磁碟(不進 DB 也不進 git)，路徑跟 companyId/applicationId 對齊，
// 方便備份/清理時直接對應到哪家公司、哪張申請單。
const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 5;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

// 圖片一律轉成 WebP 並限制長邊尺寸——手機拍照動輒 4000px 以上、好幾 MB，收據只要看得清楚
// 文字內容即可，轉檔+限制尺寸疊加通常能把檔案壓到原本的 20~40%。刻意不保留原始位元組，
// 只存轉檔後的結果(已跟使用者確認過這個取捨)。PDF 不是圖片格式，維持原樣儲存。
const MAX_IMAGE_DIMENSION = 2000;
const WEBP_QUALITY = 82;
// 最終存檔的副檔名固定從「處理後的 mimeType」查表決定，不是從使用者上傳的原始檔名拿，
// 這樣完全不用擔心原始檔名裡夾帶奇怪字元(例如路徑分隔符)造成路徑穿越。
const EXT_BY_MIME: Record<string, string> = { "application/pdf": ".pdf", "image/webp": ".webp" };

async function processFile(file: Express.Multer.File): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  if (file.mimetype === "application/pdf") {
    return { buffer: file.buffer, mimeType: file.mimetype, filename: file.originalname };
  }
  const webpBuffer = await sharp(file.buffer)
    .rotate() // 依 EXIF 方向自動轉正，避免手機直拍存起來變橫的
    .resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  const baseName = file.originalname.replace(/\.[^./]+$/, "") || "image";
  return { buffer: webpBuffer, mimeType: "image/webp", filename: `${baseName}.webp` };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error("只接受 JPG / PNG / WEBP 圖片或 PDF 檔案"));
      return;
    }
    cb(null, true);
  },
});

function multerErrorMessage(err: unknown): string {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") return `檔案過大，單一檔案不能超過 ${MAX_FILE_SIZE / 1024 / 1024}MB`;
    if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") return `一次最多上傳 ${MAX_FILES} 個檔案`;
  }
  return err instanceof Error ? err.message : "上傳失敗";
}

export const attachmentsRouter = Router({ mergeParams: true });

// POST /api/companies/:companyId/applications/:id/attachments
attachmentsRouter.post("/", (req, res, next) => {
  upload.array("files", MAX_FILES)(req, res, (err) => {
    if (err) return res.status(400).json({ error: multerErrorMessage(err) });
    next();
  });
}, async (req: ScopedRequest, res) => {
  const { companyId, id: applicationId } = req.params;
  const auth = req.auth!;

  const application = await prisma.expenseApplication.findFirst({ where: { id: applicationId, companyId } });
  if (!application) return res.status(404).json({ error: "找不到申請單" });
  if (application.applicantId !== auth.userId) {
    return res.status(403).json({ error: "只有申請人本人能上傳附件" });
  }
  if (application.status !== "pending" && application.status !== "returned") {
    return res.status(409).json({ error: "此申請單已經完成簽核，無法再新增附件" });
  }

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) {
    return res.status(400).json({ error: "沒有收到任何檔案" });
  }

  const dir = path.join(UPLOAD_ROOT, companyId, applicationId);
  fs.mkdirSync(dir, { recursive: true });

  const created = [];
  for (const file of files) {
    const processed = await processFile(file);
    const storedName = `${randomUUID()}${EXT_BY_MIME[processed.mimeType]}`;
    fs.writeFileSync(path.join(dir, storedName), processed.buffer);
    const attachment = await prisma.attachment.create({
      data: {
        applicationId,
        filename: processed.filename,
        storedName,
        mimeType: processed.mimeType,
        size: processed.buffer.length,
        uploadedById: auth.userId,
      },
    });
    created.push(attachment);
  }
  res.status(201).json(created);
});

// GET /api/companies/:companyId/applications/:id/attachments/:attachmentId
// 沒有另外限制「只有申請人或當前關卡簽核者」才能看，跟其他 GET /applications/:id 明細
// 端點的權限寬鬆度一致(同公司登入使用者都能查看申請單明細)。
attachmentsRouter.get("/:attachmentId", async (req: ScopedRequest, res) => {
  const { companyId, id: applicationId, attachmentId } = req.params;
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, applicationId, application: { companyId } },
  });
  if (!attachment) return res.status(404).json({ error: "找不到附件" });

  const filePath = path.join(UPLOAD_ROOT, companyId, applicationId, attachment.storedName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "檔案已遺失" });

  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(attachment.filename)}"`);
  res.sendFile(filePath);
});

// DELETE /api/companies/:companyId/applications/:id/attachments/:attachmentId
attachmentsRouter.delete("/:attachmentId", async (req: ScopedRequest, res) => {
  const { companyId, id: applicationId, attachmentId } = req.params;
  const auth = req.auth!;
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, applicationId, application: { companyId } },
    include: { application: true },
  });
  if (!attachment) return res.status(404).json({ error: "找不到附件" });
  if (attachment.application.applicantId !== auth.userId) {
    return res.status(403).json({ error: "只有申請人本人能刪除附件" });
  }
  if (attachment.application.status !== "pending" && attachment.application.status !== "returned") {
    return res.status(409).json({ error: "此申請單已經完成簽核，無法刪除附件" });
  }

  await prisma.attachment.delete({ where: { id: attachment.id } });
  fs.rm(path.join(UPLOAD_ROOT, companyId, applicationId, attachment.storedName), { force: true }, () => {});
  res.status(204).end();
});
