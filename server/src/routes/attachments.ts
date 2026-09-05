import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import multer from "multer";
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
// storedName = randomUUID() + 副檔名，副檔名要嚴格限制格式，
// 不然萬一原始檔名夾帶奇怪字元(例如包含 "/")，拼出來的檔名可能變成路徑穿越。
const SAFE_EXT_PATTERN = /^\.[a-zA-Z0-9]{1,10}$/;

function safeExt(originalname: string): string {
  const ext = path.extname(originalname);
  return SAFE_EXT_PATTERN.test(ext) ? ext : "";
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
    const storedName = `${randomUUID()}${safeExt(file.originalname)}`;
    fs.writeFileSync(path.join(dir, storedName), file.buffer);
    const attachment = await prisma.attachment.create({
      data: {
        applicationId,
        filename: file.originalname,
        storedName,
        mimeType: file.mimetype,
        size: file.size,
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
