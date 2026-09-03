import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole, requireSameCompany } from "../middleware/auth.js";

export const approvalStagesRouter = Router({ mergeParams: true });
// 簽核關卡設定也是後台管理專用，同樣要求 admin 角色。
approvalStagesRouter.use(requireAuth, requireSameCompany, requireRole("admin"));

const upsertSchema = z.object({
  roleKey: z.string().min(1),
  label: z.string().min(1),
});

// GET /api/companies/:companyId/approval-stages
approvalStagesRouter.get("/", async (req, res) => {
  const stages = await prisma.approvalStage.findMany({
    where: { companyId: req.params.companyId },
    orderBy: { stageOrder: "asc" },
  });
  res.json(stages);
});

// POST /api/companies/:companyId/approval-stages
// 新關卡固定加在最後一關，要調順序用 PUT /reorder。
approvalStagesRouter.post("/", async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const count = await prisma.approvalStage.count({ where: { companyId: req.params.companyId } });
  const stage = await prisma.approvalStage.create({
    data: { ...parsed.data, companyId: req.params.companyId, stageOrder: count },
  });
  res.status(201).json(stage);
});

// PUT /api/companies/:companyId/approval-stages/reorder  { orderedIds: string[] }
// 注意：這條路由要放在 "/:id" 之前，否則 "reorder" 會被 Express 當成 :id 吃掉。
approvalStagesRouter.put("/reorder", async (req, res) => {
  const parsed = z.object({ orderedIds: z.array(z.string()) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  // (companyId, stageOrder) 有唯一約束，直接改成最終順序會跟其他列的舊值互撞，
  // 所以先全部挪到不會衝突的負數暫存區間，再一次改成最終順序。
  const { orderedIds } = parsed.data;
  await prisma.$transaction([
    ...orderedIds.map((id, index) =>
      prisma.approvalStage.update({ where: { id }, data: { stageOrder: -(index + 1) } })
    ),
    ...orderedIds.map((id, index) =>
      prisma.approvalStage.update({ where: { id }, data: { stageOrder: index } })
    ),
  ]);
  res.status(204).end();
});

// PUT /api/companies/:companyId/approval-stages/:id
approvalStagesRouter.put("/:id", async (req, res) => {
  const parsed = upsertSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const stage = await prisma.approvalStage.update({
    where: { id: req.params.id },
    data: parsed.data,
  });
  res.json(stage);
});

// DELETE /api/companies/:companyId/approval-stages/:id
approvalStagesRouter.delete("/:id", async (req, res) => {
  await prisma.approvalStage.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
