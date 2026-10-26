import { z } from "zod";

export const EXTRA_NOTIFY_EVENTS = ["approved", "rejected", "returned"] as const;
export type ExtraNotifyEvent = (typeof EXTRA_NOTIFY_EVENTS)[number];

const targetSchema = z.object({
  roles: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
  userIds: z.array(z.string().min(1).max(60)).max(200).default([]),
});

export const extraNotifyRulesSchema = z.object({
  approved: targetSchema.default({}),
  rejected: targetSchema.default({}),
  returned: targetSchema.default({}),
});

export type ExtraNotifyRules = z.infer<typeof extraNotifyRulesSchema>;

export const EMPTY_RULES: ExtraNotifyRules = extraNotifyRulesSchema.parse({});

// 資料庫裡的 JSON 理論上都是 PUT 路由驗證過才存的，但這裡仍用 safeParse：欄位壞掉(手動改過
// 資料庫、日後改了格式)時退回「沒有額外收件人」，絕不能因此讓核准/駁回的通知流程丟例外。
export function parseRules(raw: unknown): ExtraNotifyRules {
  const parsed = extraNotifyRulesSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : EMPTY_RULES;
}
