import jwt from "jsonwebtoken";

export interface AuthPayload {
  userId: string;
  // 平台管理者(role: "platform_admin")不屬於任何租戶，companyId/departmentId 一定是 null；
  // requireSameCompany 拿 null 去比對任何 :companyId 都不會相等，天然就擋掉平台管理者
  // 用同一張 token 存取租戶資料——這個邊界是刻意設計的，不是遺漏。
  companyId: string | null;
  role: string;
  departmentId: string | null;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET 未設定");
  return secret;
}

export function signAuthToken(payload: AuthPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "8h" });
}

export function verifyAuthToken(token: string): AuthPayload {
  return jwt.verify(token, getSecret()) as AuthPayload;
}
