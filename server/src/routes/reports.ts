import { Router, type Request } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { prisma } from "../db.js";
import { requireAuth, requireSameCompany, requireReportAccess } from "../middleware/auth.js";

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  pending: "審核中",
  approved: "已核准",
  rejected: "已駁回",
  returned: "已退回",
  cancelled: "已取消",
};

// mergeParams 讓 :companyId 在執行期確實會被合併進 req.params，但 TypeScript 只會依路由
// 自己的路徑字面量推斷型別，推不出來自父層掛載路徑的參數，所以要手動標型別。
type CompanyScoped = Request<{ companyId: string }>;

// 租戶管理員視角的報表：各部門/費用類別支出總覽、簽核狀態分佈、月度趨勢。
// admin，或被指定 canViewAllReports 的人都能看。
export const reportsRouter = Router({ mergeParams: true });
reportsRouter.use(requireAuth, requireSameCompany, requireReportAccess);

const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

// GET /api/companies/:companyId/reports/summary?from=&to=
reportsRouter.get("/summary", async (req: CompanyScoped, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const companyId = req.params.companyId;
  const to = parsed.data.to ?? new Date();
  const from = parsed.data.from ?? new Date(new Date(to).setMonth(to.getMonth() - 11));

  const dateRange = { applicationDate: { gte: from, lte: to } };
  // 「實際花費」只算已核准的申請單——審核中/被駁回/被退回的金額還不是真的花出去的錢，
  // 混進來會讓部門/類別的支出總覽失真。簽核狀態分佈本身的用意就是要看全部狀態，
  // 所以那個查詢刻意不加這個 status 篩選。
  const approvedWhere = { companyId, status: "approved", ...dateRange };

  const [byDepartmentRaw, departments, categories, byStatusRaw, approvedApps, byCategoryRaw] = await Promise.all([
    prisma.expenseApplication.groupBy({
      by: ["departmentId"],
      where: approvedWhere,
      _sum: { totalAmountTWD: true },
      _count: { _all: true },
    }),
    prisma.department.findMany({ where: { companyId } }),
    prisma.expenseCategory.findMany({ where: { companyId } }),
    prisma.expenseApplication.groupBy({
      // 草稿不算「已經在跑簽核流程」的狀態，排除掉——不然這裡的圓餅圖會混進使用者
      // 還沒寫完、根本還沒送出的東西，STATUS_LABEL 也沒有對應的中文標籤可以顯示。
      by: ["status"],
      where: { companyId, status: { not: "draft" }, ...dateRange },
      _sum: { totalAmountTWD: true },
      _count: { _all: true },
    }),
    prisma.expenseApplication.findMany({
      where: approvedWhere,
      select: { applicationDate: true, totalAmountTWD: true },
    }),
    prisma.expenseItem.groupBy({
      by: ["categoryId"],
      where: { application: approvedWhere },
      _sum: { amountInTWD: true },
      _count: { _all: true },
    }),
  ]);

  const departmentNameById = new Map(departments.map((d) => [d.id, d.name]));
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  // departmentId 在 schema 上是可以是 null 的(草稿狀態才會發生)，但這裡的查詢條件已經
  // 限定 status: "approved"——申請單要能走到核准，一定是從 submit-draft 或直接建立送出
  // 那條路徑過來的，兩者都強制檢查過 departmentId 一定有值，這裡用 ! 斷言是安全的。
  const byDepartment = byDepartmentRaw.map((row) => ({
    departmentId: row.departmentId!,
    name: departmentNameById.get(row.departmentId!) ?? "(未知部門)",
    totalTWD: Number(row._sum.totalAmountTWD ?? 0),
    count: row._count._all,
  }));

  const byCategory = byCategoryRaw.map((row) => ({
    categoryId: row.categoryId,
    name: categoryNameById.get(row.categoryId) ?? "(未知類別)",
    totalTWD: Number(row._sum.amountInTWD ?? 0),
    count: row._count._all,
  }));

  const byStatus = byStatusRaw.map((row) => ({
    status: row.status,
    totalTWD: Number(row._sum.totalAmountTWD ?? 0),
    count: row._count._all,
  }));

  // 月度趨勢直接在 JS 裡依 applicationDate 分月加總——單一租戶的申請單量級不大，
  // 不值得為了這個另外寫綁死 Postgres 方言的 date_trunc 查詢。
  const monthlyMap = new Map<string, number>();
  for (const app of approvedApps) {
    // 同上：已核准的申請單一定有 applicationDate，! 斷言安全。
    const month = app.applicationDate!.toISOString().slice(0, 7);
    monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + Number(app.totalAmountTWD));
  }
  const monthlyTrend = Array.from(monthlyMap.entries())
    .map(([month, totalTWD]) => ({ month, totalTWD }))
    .sort((a, b) => a.month.localeCompare(b.month));

  res.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    byDepartment,
    byCategory,
    byStatus,
    monthlyTrend,
  });
});

// GET /api/companies/:companyId/reports/export?from=&to=
// 匯出報表篩選範圍內「逐筆費用明細」的 Excel 檔案，跟上面 /summary 的彙總數字不同——
// 這支是給財務對帳/匯入其他系統用的原始資料，一列一筆費用項目(不是一列一張申請單，
// 一張申請單可能有好幾筆不同類別的費用，攤開成多列才對得到帳)。跟部門/類別支出總覽
// 用同一個「已核准」定義：審核中/被駁回/被退回的金額還不是真的花出去的錢，匯出給財務
// 對帳的話混進來沒有意義。
reportsRouter.get("/export", async (req: CompanyScoped, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const companyId = req.params.companyId;
  const to = parsed.data.to ?? new Date();
  const from = parsed.data.from ?? new Date(new Date(to).setMonth(to.getMonth() - 11));

  const items = await prisma.expenseItem.findMany({
    where: {
      application: {
        companyId,
        status: "approved",
        applicationDate: { gte: from, lte: to },
      },
    },
    include: {
      category: { select: { name: true } },
      application: {
        select: {
          applicationNumber: true,
          applicationDate: true,
          status: true,
          applicant: { select: { name: true } },
          department: { select: { name: true } },
          expenseNature: { select: { name: true } },
        },
      },
    },
    orderBy: [{ application: { applicationDate: "asc" } }, { id: "asc" }],
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("費用明細");
  sheet.columns = [
    { header: "申請單號", key: "applicationNumber", width: 18 },
    { header: "申請人", key: "applicant", width: 12 },
    { header: "部門", key: "department", width: 12 },
    { header: "費用性質", key: "expenseNature", width: 10 },
    { header: "費用項目類別", key: "category", width: 14 },
    { header: "說明", key: "description", width: 30 },
    { header: "幣別", key: "currency", width: 8 },
    { header: "金額", key: "amount", width: 12 },
    { header: "換算TWD", key: "amountInTWD", width: 12 },
    { header: "申請日期", key: "applicationDate", width: 12 },
    { header: "狀態", key: "status", width: 10 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const item of items) {
    sheet.addRow({
      applicationNumber: item.application.applicationNumber ?? "-",
      applicant: item.application.applicant.name,
      department: item.application.department?.name ?? "-",
      expenseNature: item.application.expenseNature?.name ?? "-",
      category: item.category.name,
      description: item.description ?? "",
      currency: item.currency,
      amount: Number(item.amount),
      amountInTWD: Number(item.amountInTWD),
      // 已核准的申請單一定有 applicationDate(跟上面 /summary 的斷言同理)，這裡直接
      // 用非 null 斷言，理由一樣。
      applicationDate: item.application.applicationDate!.toISOString().slice(0, 10),
      status: STATUS_LABEL[item.application.status] ?? item.application.status,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `expense-report-${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
});
