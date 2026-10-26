import { z } from "zod";

export const EXTRA_NOTIFY_EVENTS = ["approved", "rejected", "returned"] as const;
export type ExtraNotifyEvent = (typeof EXTRA_NOTIFY_EVENTS)[number];

const targetSchema = z.object({
  roles: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
  userIds: z.array(z.string().min(1).max(60)).max(200).default([]),
});

// zod 4 的 .default() 遇到 undefined 會直接回傳預設值、不再跑內層 schema(內層的 roles/userIds
// 預設值就不會補上)，所以物件要用 .prefault()：先把 {} 當輸入再完整解析一次。
export const extraNotifyRulesSchema = z.object({
  approved: targetSchema.prefault({}),
  rejected: targetSchema.prefault({}),
  returned: targetSchema.prefault({}),
});

export type ExtraNotifyRules = z.infer<typeof extraNotifyRulesSchema>;

export const EMPTY_RULES: ExtraNotifyRules = extraNotifyRulesSchema.parse({});

// 資料庫裡的 JSON 理論上都是 PUT 路由驗證過才存的，但這裡仍用 safeParse：欄位壞掉(手動改過
// 資料庫、日後改了格式)時退回「沒有額外收件人」，絕不能因此讓核准/駁回的通知流程丟例外。
export function parseRules(raw: unknown): ExtraNotifyRules {
  const parsed = extraNotifyRulesSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : EMPTY_RULES;
}
