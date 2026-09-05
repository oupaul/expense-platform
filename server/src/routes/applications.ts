import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireSameCompany } from "../middleware/auth.js";
import { ALL_CURRENCIES } from "../constants.js";
import { attachmentsRouter } from "./attachments.js";

// mergeParams 讓 :companyId 在執行期確實會被合併進 req.params，但 TypeScript 只會依路由
// 自己的路徑字面量(例如 "/:id")推斷型別，推不出來自父層掛載路徑的參數，所以要手動標型別。
type CompanyScoped = Request<{ companyId: string }>;
type CompanyScopedWithId = Request<{ companyId: string; id: string }>;

// 簽名圖檔存成 base64 data URL；用最基本的格式檢查擋掉亂塞的字串，
// 大小上限搭配 index.ts 的 express.json({ limit: "5mb" })，避免單一簽名把 payload 撐爆。
const signatureSchema = z
  .string()
  .min(1, "請先簽名再送出")
  .max(2_000_000, "簽名圖檔過大，請重新簽名或使用較小的圖片")
  .regex(/^data:image\/(png|jpeg|jpg|webp);base64,/, "簽名格式不正確");

export const applicationsRouter = Router({ mergeParams: true });
applicationsRouter.use(requireAuth, requireSameCompany);
applicationsRouter.use("/:id/attachments", attachmentsRouter);

const itemSchema = z.object({
  categoryId: z.string().min(1),
  description: z.string().optional(),
  date: z.coerce.date().optional(),
  projectCode: z.string().max(10, "專案編號最多 10 碼").optional(),
  invoiceDate: z.coerce.date().optional(),
  currency: z.enum(ALL_CURRENCIES).default("TWD"),
  amount: z.number().positive(),
});

const createSchema = z.object({
  departmentId: z.string().min(1),
  expenseNatureId: z.string().min(1),
  applicationDate: z.coerce.date(),
  purpose: z.string().optional(),
  payeeName: z.string().optional(),
  payeeBankInfo: z.record(z.string()).optional(),
  requestedPaymentDate: z.coerce.date().optional(),
  items: z.array(itemSchema).min(1),
  applicantSignature: signatureSchema,
});

type CreateData = z.infer<typeof createSchema>;

// department / 費用性質 / 每個費用項目的類別都要屬於同一家公司，否則有心人可以拿別家公司的 id
// 硬塞進來(id 是全域唯一的 cuid，DB 層的外鍵擋不住跨公司關聯)。建立跟退回重新送出共用同一套檢查，
// 避免規則(專案編號必填、多幣別、匯率)寫兩份之後改一邊忘了改另一邊。
async function validateApplicationInput(companyId: string, data: CreateData) {
  const [company, department, nature, categories, exchangeRates] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.department.findFirst({ where: { id: data.departmentId, companyId } }),
    prisma.expenseNature.findFirst({ where: { id: data.expenseNatureId, companyId } }),
    prisma.expenseCategory.findMany({
      where: { id: { in: data.items.map((i) => i.categoryId) }, companyId },
    }),
    prisma.exchangeRate.findMany({ where: { companyId } }),
  ]);

  if (!company) return { ok: false as const, status: 404, error: "找不到公司" };
  if (!department) return { ok: false as const, status: 400, error: "部門不存在或不屬於此公司" };
  if (!nature) return { ok: false as const, status: 400, error: "費用性質不存在或不屬於此公司" };
  if (categories.length !== new Set(data.items.map((i) => i.categoryId)).size) {
    return { ok: false as const, status: 400, error: "有費用項目類別不存在或不屬於此公司" };
  }
  if (!company.multiCurrencyEnabled && data.items.some((i) => i.currency !== "TWD")) {
    return { ok: false as const, status: 400, error: "此公司未開啟多幣別功能，費用項目只能使用 TWD" };
  }

  // 選到「需要專案編號」的類別時，該列的專案編號不能空著(長度上限已經在 itemSchema 擋過)。
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const missingProjectCode = data.items.find((item) => {
    const category = categoryById.get(item.categoryId);
    return category?.requiresProjectCode && !item.projectCode?.trim();
  });
  if (missingProjectCode) {
    const categoryName = categoryById.get(missingProjectCode.categoryId)?.name;
    return { ok: false as const, status: 400, error: `費用項目「${categoryName}」需要填寫專案編號` };
  }

  const rateByCurrency = new Map(exchangeRates.map((r) => [r.currency, Number(r.rateToTWD)]));
  const itemsWithConversion = data.items.map((item) => {
    if (item.currency === "TWD") return { ...item, amountInTWD: item.amount };
    const rate = rateByCurrency.get(item.currency);
    if (rate === undefined) return { ...item, amountInTWD: null };
    return { ...item, amountInTWD: Math.round(item.amount * rate * 100) / 100 };
  });
  const missingRateFor = itemsWithConversion.find((i) => i.amountInTWD === null);
  if (missingRateFor) {
    return { ok: false as const, status: 400, error: `尚未設定 ${missingRateFor.currency} 的匯率，請聯絡管理員在後台設定後再送出` };
  }

  const totalAmountTWD = itemsWithConversion.reduce((sum, item) => sum + (item.amountInTWD as number), 0);
  return { ok: true as const, itemsWithConversion, totalAmountTWD };
}

// POST /api/companies/:companyId/applications
applicationsRouter.post("/", async (req: CompanyScoped, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const companyId = req.params.companyId;
  const data = parsed.data;

  const validated = await validateApplicationInput(companyId, data);
  if (!validated.ok) {
    return res.status(validated.status).json({ error: validated.error });
  }
  const { itemsWithConversion, totalAmountTWD } = validated;

  const stages = await prisma.approvalStage.findMany({ where: { companyId, active: true }, orderBy: { stageOrder: "asc" } });
  if (stages.length === 0) {
    return res.status(400).json({ error: "此公司尚未設定簽核關卡，無法送出申請" });
  }

  const application = await prisma.expenseApplication.create({
    data: {
      companyId,
      applicantId: req.auth!.userId,
      departmentId: data.departmentId,
      expenseNatureId: data.expenseNatureId,
      applicationDate: data.applicationDate,
      purpose: data.purpose,
      payeeName: data.payeeName,
      payeeBankInfo: data.payeeBankInfo,
      requestedPaymentDate: data.requestedPaymentDate,
      applicantSignature: data.applicantSignature,
      totalAmountTWD,
      items: {
        create: itemsWithConversion.map((item) => ({
          categoryId: item.categoryId,
          description: item.description,
          date: item.date,
          projectCode: item.projectCode,
          invoiceDate: item.invoiceDate,
          currency: item.currency,
          amount: item.amount,
          amountInTWD: item.amountInTWD as number,
        })),
      },
      approvalRecords: {
        create: stages.map((stage) => ({ stageId: stage.id, status: "waiting" })),
      },
    },
    include: { items: true, approvalRecords: true },
  });

  res.status(201).json(application);
});

// GET /api/companies/:companyId/applications?scope=mine|pending|all
applicationsRouter.get("/", async (req: CompanyScoped, res) => {
  const scope = req.query.scope === "pending" || req.query.scope === "all" ? req.query.scope : "mine";
  const auth = req.auth!;

  if (scope === "all" && auth.role !== "admin") {
    return res.status(403).json({ error: "只有管理員能查看全部申請單" });
  }

  const where =
    scope === "mine"
      ? { companyId: req.params.companyId, applicantId: auth.userId }
      : scope === "all"
      ? { companyId: req.params.companyId }
      : { companyId: req.params.companyId }; // pending 再用程式篩選當前關卡

  const applications = await prisma.expenseApplication.findMany({
    where,
    include: {
      applicant: { select: { name: true } },
      department: { select: { name: true } },
      approvalRecords: { include: { stage: true }, orderBy: { stage: { stageOrder: "asc" } } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (scope !== "pending") {
    return res.json(applications);
  }

  // pending：只回傳「目前輪到我這個角色簽核」的申請單 —— 前面關卡都還沒過的不算輪到我。
  const pending = applications.filter((app) => {
    if (app.status !== "pending") return false;
    const currentStage = app.approvalRecords.find((r) => r.status === "waiting");
    return currentStage?.stage.roleKey === auth.role;
  });
  res.json(pending);
});

// GET /api/companies/:companyId/applications/:id
applicationsRouter.get("/:id", async (req: CompanyScopedWithId, res) => {
  const application = await prisma.expenseApplication.findFirst({
    where: { id: req.params.id, companyId: req.params.companyId },
    include: {
      applicant: { select: { name: true, email: true } },
      department: { select: { name: true } },
      expenseNature: { select: { name: true } },
      items: { include: { category: { select: { name: true } } } },
      approvalRecords: {
        include: { stage: true, approver: { select: { name: true } } },
        orderBy: { stage: { stageOrder: "asc" } },
      },
      attachments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!application) return res.status(404).json({ error: "找不到申請單" });
  res.json(application);
});

const decisionSchema = z
  .object({
    action: z.enum(["approve", "reject", "return"]),
    comment: z.string().optional(),
    signatureImage: signatureSchema,
  })
  // 退回是要讓申請人知道哪裡要改，備註沒填等於白退回，所以跟核准/駁回不同，強制要填。
  .refine((data) => data.action !== "return" || !!data.comment?.trim(), {
    message: "退回時必須填寫備註說明",
    path: ["comment"],
  });

// POST /api/companies/:companyId/applications/:id/decision
applicationsRouter.post("/:id/decision", async (req: CompanyScopedWithId, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const auth = req.auth!;

  const application = await prisma.expenseApplication.findFirst({
    where: { id: req.params.id, companyId: req.params.companyId },
    include: { approvalRecords: { include: { stage: true }, orderBy: { stage: { stageOrder: "asc" } } } },
  });
  if (!application) return res.status(404).json({ error: "找不到申請單" });
  if (application.status !== "pending") {
    return res.status(409).json({ error: "此申請單已經處理完畢" });
  }

  const currentRecord = application.approvalRecords.find((r) => r.status === "waiting");
  if (!currentRecord) {
    return res.status(409).json({ error: "此申請單已經處理完畢" });
  }
  if (currentRecord.stage.roleKey !== auth.role) {
    return res.status(403).json({ error: "還沒輪到你這個角色簽核" });
  }

  const { action, comment, signatureImage } = parsed.data;
  // 不能直接拿 stage.stageOrder 跟「這張申請單有幾個關卡」比大小：關卡如果曾經被停用/新增/
  // 拖曳調整過順序，stageOrder 的數值會有跳號(例如只剩 1、2 兩關是啟用的)，跟這張申請單
  // 實際的關卡「筆數」對不起來，比對會誤判，讓中間某一關被當成最後一關直接核准過關。
  // 正確做法是看這個關卡在「這張申請單自己的、已經按 stageOrder 排序好的關卡清單」裡排第幾個。
  const currentIndex = application.approvalRecords.findIndex((r) => r.id === currentRecord.id);
  const isLastStage = currentIndex === application.approvalRecords.length - 1;
  const recordStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : "returned";
  const applicationStatus =
    action === "reject" ? "rejected" : action === "return" ? "returned" : isLastStage ? "approved" : "pending";

  await prisma.$transaction([
    prisma.approvalRecord.update({
      where: { id: currentRecord.id },
      data: {
        status: recordStatus,
        approverId: auth.userId,
        comment,
        signatureImage,
        signedAt: new Date(),
      },
    }),
    prisma.expenseApplication.update({
      where: { id: application.id },
      data: {
        status: applicationStatus,
        ...(action === "return"
          ? { returnComment: comment, returnedAt: new Date(), returnedByStageLabel: currentRecord.stage.label }
          : {}),
      },
    }),
  ]);

  res.status(204).end();
});

const resubmitSchema = createSchema;

// POST /api/companies/:companyId/applications/:id/resubmit
// 退回後申請人修改內容重新送出：沿用同一張申請單(保留 id 方便追蹤)，
// 但要求重新簽名，且把每一關簽核紀錄都重置為 waiting，讓修改後的內容重新跑一次完整簽核流程。
applicationsRouter.post("/:id/resubmit", async (req: CompanyScopedWithId, res) => {
  const parsed = resubmitSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const auth = req.auth!;
  const companyId = req.params.companyId;
  const data = parsed.data;

  const application = await prisma.expenseApplication.findFirst({
    where: { id: req.params.id, companyId },
    include: { approvalRecords: true },
  });
  if (!application) return res.status(404).json({ error: "找不到申請單" });
  if (application.applicantId !== auth.userId) {
    return res.status(403).json({ error: "只有申請人本人能修改重新送出" });
  }
  if (application.status !== "returned") {
    return res.status(409).json({ error: "此申請單目前不是退回狀態，無法重新送出" });
  }

  const validated = await validateApplicationInput(companyId, data);
  if (!validated.ok) {
    return res.status(validated.status).json({ error: validated.error });
  }
  const { itemsWithConversion, totalAmountTWD } = validated;

  await prisma.$transaction([
    prisma.expenseApplication.update({
      where: { id: application.id },
      data: {
        departmentId: data.departmentId,
        expenseNatureId: data.expenseNatureId,
        applicationDate: data.applicationDate,
        purpose: data.purpose,
        payeeName: data.payeeName,
        payeeBankInfo: data.payeeBankInfo,
        requestedPaymentDate: data.requestedPaymentDate,
        applicantSignature: data.applicantSignature,
        totalAmountTWD,
        status: "pending",
        items: {
          deleteMany: {},
          create: itemsWithConversion.map((item) => ({
            categoryId: item.categoryId,
            description: item.description,
            date: item.date,
            projectCode: item.projectCode,
            invoiceDate: item.invoiceDate,
            currency: item.currency,
            amount: item.amount,
            amountInTWD: item.amountInTWD as number,
          })),
        },
      },
    }),
    prisma.approvalRecord.updateMany({
      where: { applicationId: application.id },
      data: { status: "waiting", approverId: null, comment: null, signatureImage: null, signedAt: null },
    }),
  ]);

  const refreshed = await prisma.expenseApplication.findFirst({
    where: { id: application.id },
    include: { items: true, approvalRecords: true },
  });
  res.status(200).json(refreshed);
});
