import type { AuthPayload } from "../auth/jwt.js";

// 給「系統更新/重啟前檢查有沒有人在用」這種一次性判斷用的輕量記錄——只留在記憶體，
// 服務重啟就會清空，這正好符合使用情境(本來就是要重啟，不需要重啟後還留著舊資料)。
// 刻意不寫資料庫、不另外開一張 session 表：這裡要的只是「最近幾分鐘內是不是還有人在
// 動」的粗略判斷，不是要做長期可稽核的登入紀錄，沒必要讓每一次 API 請求都多一次
// 資料庫寫入的成本。
type ActivityEntry = Pick<AuthPayload, "userId" | "companyId" | "role"> & { lastSeenAt: number };

const lastSeenByUserId = new Map<string, ActivityEntry>();

export function recordActivity(auth: Pick<AuthPayload, "userId" | "companyId" | "role">): void {
  lastSeenByUserId.set(auth.userId, { ...auth, lastSeenAt: Date.now() });
}

export function listActiveSince(minutesAgo: number): ActivityEntry[] {
  const cutoff = Date.now() - minutesAgo * 60_000;
  return Array.from(lastSeenByUserId.values()).filter((entry) => entry.lastSeenAt >= cutoff);
}
