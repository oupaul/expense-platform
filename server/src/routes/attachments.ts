import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import multer from "multer";
import sharp from "sharp";
import { prisma } from "../db.js";
import { canViewApplication } from "../services/applicationAccess.js";

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
// iPhone 拍照預設存成 HEIC/HEIF 格式，這個問題實測過：這台主機裝的 sharp/libvips 雖然有
// 「heif 容器格式」的支援，但實際負責解碼 HEIC 影像內容的 HEVC 解碼器沒有編進去(常見於
// 預先編譯好的 libheif 套件，跟授權金/專利費有關，不是這台主機設定錯)，塞進 sharp() 會直接
// 丟例外。與其讓它們矇混過 mimetype 檢查、跑到 sharp 那步才爆炸變成看不懂的「伺服器發生
// 錯誤」，不如在這裡就先攔下來、給一個看得懂、知道怎麼解決的訊息。
const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);

// 圖片一律轉成 WebP 並限制長邊尺寸——手機拍照動輒 4000px 以上、好幾 MB，收據只要看得清楚
// 文字內容即可，轉檔+限制尺寸疊加通常能把檔案壓到原本的 20~40%。刻意不保留原始位元組，
// 只存轉檔後的結果(已跟使用者確認過這個取捨)。PDF 不是圖片格式，維持原樣儲存。
const MAX_IMAGE_DIMENSION = 2000;
const WEBP_QUALITY = 82;
// 最終存檔的副檔名固定從「處理後的 mimeType」查表決定，不是從使用者上傳的原始檔名拿，
// 這樣完全不用擔心原始檔名裡夾帶奇怪字元(例如路徑分隔符)造成路徑穿越。
const EXT_BY_MIME: Record<string, string> = { "application/pdf": ".pdf", "image/webp": ".webp" };

// 圖片轉檔失敗(HEIC 之外，偶爾也會遇到手機在不穩定的網路上傳到一半、buffer 不完整，
// 或極少數相機 App 產生的非標準 JPEG 變體)要回一個使用者看得懂的 400，不能讓 sharp
// 丟出來的原始例外一路穿到最外層的錯誤處理，變成語意不明的「伺服器發生錯誤」。
class UnsupportedImageError extends Error {}

// multer(底層是 busboy)解析 multipart/form-data 表頭時，檔名一律先當 latin1 解碼——
// 瀏覽器實際上是用 UTF-8 位元組直接寫進表頭(沒有另外做 percent-encoding)，兩邊編碼
// 對不上，中文/日文等非 ASCII 檔名就會變成亂碼(例如「測試.png」變成「æ¸¬è©¦.png」)。
// 修法是把 busboy 誤判成 latin1 的字串，再重新當成 latin1 編碼還原回原始位元組、
// 用 UTF-8 重新解碼一次——這是 multer/busboy 這個已知行為的標準解法，不是自創的猜測。
function decodeOriginalFilename(name: string): string {
  return Buffer.from(name, "latin1").toString("utf8");
}

async function processFile(file: Express.Multer.File): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  const originalName = decodeOriginalFilename(file.originalname);
  if (file.mimetype === "application/pdf") {
    return { buffer: file.buffer, mimeType: file.mimetype, filename: originalName };
  }
  let webpBuffer: Buffer;
  try {
    webpBuffer = await sharp(file.buffer)
      .rotate() // 依 EXIF 方向自動轉正，避免手機直拍存起來變橫的
      .resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    throw new UnsupportedImageError("圖片檔案無法處理，請確認檔案沒有毀損，或改用 JPG / PNG 格式重新上傳");
  }
  const baseName = originalName.replace(/\.[^./]+$/, "") || "image";
  return { buffer: webpBuffer, mimeType: "image/webp", filename: `${baseName}.webp` };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: (_req, file, cb) => {
    if (HEIC_MIME_TYPES.has(file.mimetype)) {
      cb(
        new UnsupportedImageError(
          "不支援 HEIC/HEIF 格式(iPhone 拍照預設格式)。請到手機「設定 → 相機 → 格式」改成「最相容」，" +
            "或改用「檔案」App 把照片轉存成 JPEG 後再上傳"
        )
      );
      return;
    }
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
  if (application.status !== "draft" && application.status !== "pending" && application.status !== "returned") {
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
    let processed;
    try {
      processed = await processFile(file);
    } catch (err) {
      // 前面幾個檔案(如果有的話)已經處理、存檔成功的部分不會被回滾——這批只要有一個檔案
      // 處理失敗就整個中止，剩下還沒處理的檔案也不會再繼續跑，直接把清楚的錯誤原因回給
      // 使用者，讓他知道是「這個檔案」的問題，不是系統掛了，可以換一個檔案再試。
      return res.status(400).json({ error: err instanceof UnsupportedImageError ? err.message : "檔案處理失敗" });
    }
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
// 跟 applications.ts 的 GET /:id 明細用同一套 canViewApplication 規則——申請單明細本身
// 鎖起來、附件檔案卻誰都能下載的話，等於明細白鎖，兩邊必須一致。
attachmentsRouter.get("/:attachmentId", async (req: ScopedRequest, res) => {
  const { companyId, id: applicationId, attachmentId } = req.params;
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, applicationId, application: { companyId } },
    include: { application: { include: { approvalRecords: { include: { stage: true } } } } },
  });
  if (!attachment) return res.status(404).json({ error: "找不到附件" });
  if (!canViewApplication(attachment.application, req.auth!)) {
    return res.status(403).json({ error: "無權查看此附件" });
  }

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
  if (attachment.application.status !== "draft" && attachment.application.status !== "pending" && attachment.application.status !== "returned") {
    return res.status(409).json({ error: "此申請單已經完成簽核，無法刪除附件" });
  }

  await prisma.attachment.delete({ where: { id: attachment.id } });
  fs.rm(path.join(UPLOAD_ROOT, companyId, applicationId, attachment.storedName), { force: true }, () => {});
  res.status(204).end();
});
