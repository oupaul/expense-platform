import jwt from "jsonwebtoken";

export interface AuthPayload {
  userId: string;
  companyId: string;
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
