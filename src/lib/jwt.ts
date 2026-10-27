// 只在前端判斷「這個 token 是不是已經過期」用，不驗證簽章(那是後端的事)：讀 payload 裡的
// exp(秒)跟現在比。解不出來(格式怪異/沒有 exp)一律當作「沒過期」，交給後端的 401 去判斷，
// 避免前端誤判把正常使用者登出。skewSeconds 讓快過期的 token 提早半分鐘就視為過期，
// 不要等到送請求才被擋。
export function isTokenExpired(token: string, skewSeconds = 30): boolean {
  try {
    const payload = token.split(".")[1];
    if (!payload) return false;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "="));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" && exp - skewSeconds <= Date.now() / 1000;
  } catch {
    return false;
  }
}

export const AUTH_EXPIRED_NOTICE = "登入已過期，請重新登入";
