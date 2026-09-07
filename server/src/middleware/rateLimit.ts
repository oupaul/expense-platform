import rateLimit from "express-rate-limit";

// 登入 API 沒有任何節流，理論上可以被無限次嘗試帳密——scrypt 雜湊本身有一定的
// 計算成本，但沒有節流的話還是能長時間、低頻率地慢慢猜，也可能被拿來對單一帳號
// 洗大量請求造成 CPU 負擔。用 IP 分開計算：15 分鐘內同一個 IP 最多 20 次失敗嘗試，
// 超過就先擋 15 分鐘，不分帳號也不分公司(同一個攻擊來源不管打哪個公司/帳號都算)。
// 只算失敗的請求(skipSuccessfulRequests)，正常使用者密碼打對了就不會佔用額度。
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "登入嘗試次數過多，請 15 分鐘後再試一次" },
});
