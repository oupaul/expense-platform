import jwt from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";

// Microsoft 用同一組全域簽章金鑰服務所有 Azure AD 租戶(不是每個 tenant 各自一組)，
// 這裡的 JwksClient 用哪個 tenantId 的 discovery 端點去抓 key 其實不影響安全性——
// 真正的多租戶隔離邊界是下面 verifyM365IdToken 裡對 issuer/audience 的檢查，
// 不是這個 client 本身。用 "common" 固定抓、快取，不用每家公司各開一個 client。
const jwksClient = new JwksClient({
  jwksUri: "https://login.microsoftonline.com/common/discovery/v2.0/keys",
  cache: true,
  cacheMaxAge: 24 * 60 * 60 * 1000,
  rateLimit: true,
});

function getSigningKey(kid: string): Promise<string> {
  return new Promise((resolve, reject) => {
    jwksClient.getSigningKey(kid, (err, key) => {
      if (err || !key) return reject(err ?? new Error("找不到對應的簽章金鑰"));
      resolve(key.getPublicKey());
    });
  });
}

export interface M365Claims {
  email: string;
  name?: string;
}

// 驗證前端(MSAL.js)登入完拿到的 Microsoft ID token 真的是這家公司自己 Azure AD
// 租戶核發的、給我們這個 Client ID 用的——iss/aud 兩個檢查是這整個多租戶 SSO 設計
// 唯一的安全邊界，兩個都要對到「這家公司」設定的 tenantId/clientId，不能只驗證
// 「這是不是一個合法的 Microsoft token」就算數，不然 A 公司的人可能可以拿自己
// Azure 租戶核發的合法 token 冒充成 B 公司的使用者登入。
export async function verifyM365IdToken(idToken: string, tenantId: string, clientId: string): Promise<M365Claims> {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || typeof decoded === "string" || !decoded.header.kid) {
    throw new Error("ID token 格式不正確");
  }

  const publicKey = await getSigningKey(decoded.header.kid);
  const payload = jwt.verify(idToken, publicKey, {
    algorithms: ["RS256"],
    audience: clientId,
    // v2.0 端點核發的 token，issuer 固定長這個形狀；沒有掛這個租戶自己的
    // GUID/網域，就不是這家公司 Azure AD 核發的 token。
    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  }) as jwt.JwtPayload;

  // email 這個 claim 要在 Azure App 註冊的「選用宣告」裡額外勾選才會一定出現，
  // preferred_username 則是 v2.0 token 預設就會帶的登入帳號(通常就是 UPN/email)，
  // 兩個都沒有的話就沒辦法比對到系統裡的 User，直接視為驗證失敗。
  const email = (payload.email as string | undefined) ?? (payload.preferred_username as string | undefined);
  if (!email) {
    throw new Error("Microsoft 帳號沒有回傳 email，請確認 Azure App 註冊的權杖設定");
  }

  return { email, name: payload.name as string | undefined };
}
